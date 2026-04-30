package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Structure pour recevoir la demande de création d'invitation
type InviteRequest struct {
	ServerID string `json:"server_id"`
}

// Structure pour recevoir la demande de rejoindre un serveur
type JoinRequest struct {
	Token string `json:"token"`
}

// CreateInviteHandler génère un code unique de 8 caractères pour un serveur
func CreateInviteHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non autorisé", http.StatusUnauthorized)
			return
		}

		var userID string
		err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&userID)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		var req InviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ServerID == "" {
			http.Error(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		token := uuid.New().String()[:8]

		query := `INSERT INTO invites (token, server_id, creator_id) VALUES (?, ?, ?)`
		_, err = db.Exec(query, token, req.ServerID, userID)
		if err != nil {
			http.Error(w, "Erreur lors de la création de l'invitation", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"token": token,
		})
	}
}

// JoinServerHandler permet de rejoindre un serveur et prévient le Hub pour le temps réel
func JoinServerHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// 1. Session & Utilisateur
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non autorisé", http.StatusUnauthorized)
			return
		}

		var userID, nickname string
		err = db.QueryRow(`
            SELECT u.id, u.nickname 
            FROM users u 
            JOIN sessions s ON u.id = s.user_id 
            WHERE s.id = ?`, cookie.Value).Scan(&userID, &nickname)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		// 2. Token
		var req JoinRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
			http.Error(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		token := strings.TrimSpace(req.Token)
		if strings.Contains(token, "/") {
			parts := strings.Split(token, "/")
			token = parts[len(parts)-1]
		}

		// 3. Infos Serveur
		var serverID, serverName string
		err = db.QueryRow(`
            SELECT i.server_id, s.name 
            FROM invites i 
            JOIN servers s ON i.server_id = s.id 
            WHERE i.token = ?`, token).Scan(&serverID, &serverName)
		if err != nil {
			http.Error(w, "Invitation invalide ou expirée", http.StatusNotFound)
			return
		}

		// 4. Insertion Membre
		_, err = db.Exec("INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)", serverID, userID)
		if err != nil {
			http.Error(w, "Erreur lors de l'adhésion", http.StatusInternalServerError)
			return
		}

		// 5. Message de bienvenue (System)
		welcomeContent := fmt.Sprintf("%s a rejoint le serveur, dites-lui bonjour !", nickname)
		msgID := uuid.New().String()
		now := time.Now() // On récupère l'heure précise

		_, err = db.Exec(`
            INSERT INTO messages (id, server_id, sender_id, content, message_type) 
            VALUES (?, ?, ?, ?, ?)`,
			msgID, serverID, "0", welcomeContent, "system")

		// 6. 🚀 LES DEUX NOTIFICATIONS WEB SOCKET 🚀

		// A. Notification pour actualiser la liste des membres (à droite)
		joinNotification, _ := json.Marshal(map[string]interface{}{
			"type":      "member_join",
			"server_id": serverID,
			"user_id":   userID,
			"nickname":  nickname,
		})
		hub.Broadcast <- joinNotification

		// B. FIX : Notification pour afficher le message dans le chat (au centre)
		chatNotification, _ := json.Marshal(map[string]string{
			"type":         "public",
			"sender":       "System", // Ou nickname si tu veux
			"content":      welcomeContent,
			"server_id":    serverID,
			"message_type": "system",
			"created_at":   now.Format(time.RFC3339),
		})
		hub.Broadcast <- chatNotification

		// 7. Réponse HTTP finale
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"message":     "Succès",
			"server_id":   serverID,
			"server_name": serverName,
		})
	}
}
