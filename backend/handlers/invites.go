package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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

		// 1. Vérification de la session
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

		// 2. Lecture de la requête
		var req InviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ServerID == "" {
			http.Error(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		// 3. Génération du token (8 caractères)
		token := uuid.New().String()[:8]

		// 4. Enregistrement dans la base de données
		query := `INSERT INTO invites (token, server_id, creator_id) VALUES (?, ?, ?)`
		_, err = db.Exec(query, token, req.ServerID, userID)
		if err != nil {
			http.Error(w, "Erreur lors de la création de l'invitation", http.StatusInternalServerError)
			return
		}

		// 5. Réponse
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"token": token,
		})
	}
}

func JoinServerHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// 1. Vérification session
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non autorisé", http.StatusUnauthorized)
			return
		}

		var userID, nickname string
		// On récupère l'ID ET le Nickname de celui qui veut rejoindre
		err = db.QueryRow(`
			SELECT u.id, u.nickname 
			FROM users u 
			JOIN sessions s ON u.id = s.user_id 
			WHERE s.id = ?`, cookie.Value).Scan(&userID, &nickname)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		// 2. Lecture du token
		var req JoinRequest
		json.NewDecoder(r.Body).Decode(&req)
		token := strings.TrimSpace(req.Token)
		if strings.Contains(token, "/") {
			parts := strings.Split(token, "/")
			token = parts[len(parts)-1]
		}

		// 3. Trouver le serveur
		var serverID string
		err = db.QueryRow("SELECT server_id FROM invites WHERE token = ?", token).Scan(&serverID)
		if err != nil {
			http.Error(w, "Invitation invalide", http.StatusNotFound)
			return
		}

		// 4. Ajouter le membre
		_, err = db.Exec("INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)", serverID, userID)
		if err != nil {
			http.Error(w, "Erreur lors de l'adhésion", http.StatusInternalServerError)
			return
		}

		// --- NOUVEAU : LE MESSAGE DE BIENVENUE ---
		welcomeContent := fmt.Sprintf("%s a rejoint le serveur, dites-lui bonjour !", nickname)
		msgID := uuid.New().String()

		// On insère le message en tant que 'System' (sender_id '0') et type 'system'
		_, err = db.Exec(`
			INSERT INTO messages (id, server_id, sender_id, content, message_type) 
			VALUES (?, ?, ?, ?, ?)`,
			msgID, serverID, "0", welcomeContent, "system")

		if err != nil {
			fmt.Println("Erreur message bienvenue:", err)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Serveur rejoint !"})
	}
}
