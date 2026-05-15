package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"forum/backend/utils"

	"github.com/google/uuid"
)

func CreateInviteHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		userID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var req utils.InviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ServerID == "" {
			utils.SendJSONError(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		var role string
		err = db.QueryRow("SELECT role FROM server_members WHERE server_id = ? AND user_id = ?", req.ServerID, userID).Scan(&role)
		if err != nil || role != "admin" {
			utils.SendJSONError(w, "Accès refusé : Droits administrateur requis", http.StatusForbidden)
			return
		}

		expiresAt := time.Now().Add(24 * time.Hour) 

		token := uuid.New().String()[:8]

		query := `INSERT INTO invites (token, server_id, creator_id, expires_at) VALUES (?, ?, ?, ?)`
		_, err = db.Exec(query, token, req.ServerID, userID, expiresAt)
		if err != nil {
			log.Printf("❌ Erreur dans CreateInviteHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"token": token,
		})
	}
}

func JoinServerHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		userID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var req utils.JoinRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
			utils.SendJSONError(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		token := strings.TrimSpace(req.Token)
		if strings.Contains(token, "/") {
			parts := strings.Split(token, "/")
			token = parts[len(parts)-1]
		}

		var serverID, serverName string
		var expiresAt time.Time

		err = db.QueryRow(`
            SELECT i.server_id, s.name, i.expires_at 
            FROM invites i 
            JOIN servers s ON i.server_id = s.id 
            WHERE i.token = ?`, token).Scan(&serverID, &serverName, &expiresAt)

		if err != nil {
			utils.SendJSONError(w, "Invitation invalide ou serveur inexistant", http.StatusNotFound)
			return
		}

		if time.Now().After(expiresAt) {
			utils.SendJSONError(w, "Cette invitation a expiré", http.StatusGone)
			return
		}

		var isBanned int
		db.QueryRow("SELECT COUNT(*) FROM server_bans WHERE server_id = ? AND user_id = ?",
			serverID, userID).Scan(&isBanned)
		if isBanned > 0 {
			utils.SendJSONError(w, "Vous avez été banni de ce serveur", http.StatusForbidden)
			return
		}

		var alreadyMember int
		err = db.QueryRow("SELECT COUNT(*) FROM server_members WHERE server_id = ? AND user_id = ?",
			serverID, userID).Scan(&alreadyMember)

		if alreadyMember > 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"message":        "Déjà membre",
				"server_id":      serverID,
				"server_name":    serverName,
				"already_joined": true,
			})
			return
		}

		_, err = db.Exec("INSERT INTO server_members (server_id, user_id) VALUES (?, ?)", serverID, userID)
		if err != nil {
			log.Printf("❌ Erreur dans JoinServerHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		var nickname string
		_ = db.QueryRow("SELECT nickname FROM users WHERE id = ?", userID).Scan(&nickname)

		welcomeContent := fmt.Sprintf("%s a rejoint le serveur, dites-lui bonjour !", nickname)
		msgID := uuid.New().String()
		now := time.Now()

		_, err = db.Exec(`
            INSERT INTO messages (id, server_id, sender_id, content, message_type) 
            VALUES (?, ?, ?, ?, ?)`,
			msgID, serverID, "0", welcomeContent, "system")

		joinNotification, _ := json.Marshal(map[string]interface{}{
			"type":      "member_join",
			"server_id": serverID,
			"user_id":   userID,
			"nickname":  nickname,
		})
		hub.Broadcast <- joinNotification

		chatNotification, _ := json.Marshal(map[string]string{
			"type":         "public",
			"sender":       "System",
			"content":      welcomeContent,
			"server_id":    serverID,
			"message_type": "system",
			"created_at":   now.Format(time.RFC3339),
		})
		hub.Broadcast <- chatNotification

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message":        "Succès",
			"server_id":      serverID,
			"server_name":    serverName,
			"already_joined": false,
		})
	}
}
