package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

func GetMessagesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Récupérer le server_id dans l'URL (?server_id=...)
		serverID := r.URL.Query().Get("server_id")
		if serverID == "" {
			http.Error(w, "server_id manquant", http.StatusBadRequest)
			return
		}

		// 🌟 2. Requête SQL MODIFIÉE : On inclut u.avatar et m.sender_id
		query := `
            SELECT u.nickname, u.avatar, m.sender_id, m.content, m.server_id, m.message_type, m.created_at 
            FROM messages m 
            JOIN users u ON m.sender_id = u.id 
            WHERE m.server_id = ? 
            ORDER BY m.created_at ASC
        `

		rows, err := db.Query(query, serverID)
		if err != nil {
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		// 🌟 3. On crée un tableau de maps pour construire le JSON exactement comme le JS l'attend
		var messages []map[string]interface{}

		for rows.Next() {
			var nickname, content, srvID, msgType, createdAt, senderID string
			var avatar sql.NullString // Sécurité si jamais l'avatar n'est pas encore défini

			err := rows.Scan(&nickname, &avatar, &senderID, &content, &srvID, &msgType, &createdAt)
			if err == nil {

				finalAvatar := ""
				if avatar.Valid {
					finalAvatar = avatar.String
				}

				messages = append(messages, map[string]interface{}{
					"type":         "public",
					"sender":       nickname,
					"sender_id":    senderID,
					"avatar":       finalAvatar,
					"content":      content,
					"server_id":    srvID,
					"message_type": msgType,
					"created_at":   createdAt,
				})
			}
		}

		if messages == nil {
			messages = []map[string]interface{}{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	}
}

func GetPrivateMessagesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Récupérer l'ID de l'utilisateur actuel via le cookie
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non autorisé", http.StatusUnauthorized)
			return
		}

		var currentUserID string
		err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&currentUserID)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		// 2. Récupérer l'ID de l'ami avec qui on discute
		friendID := r.URL.Query().Get("user_id")
		if friendID == "" {
			http.Error(w, "user_id manquant", http.StatusBadRequest)
			return
		}

		// 3. Récupérer les messages entre les deux utilisateurs (dans les deux sens)
		query := `
            SELECT u.nickname, u.avatar, m.sender_id, m.content, m.created_at 
            FROM private_messages m 
            JOIN users u ON m.sender_id = u.id 
            WHERE (m.sender_id = ? AND m.receiver_id = ?) 
               OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.created_at ASC
        `

		rows, err := db.Query(query, currentUserID, friendID, friendID, currentUserID)
		if err != nil {
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var messages []map[string]interface{}

		for rows.Next() {
			var nickname, content, createdAt, senderID string
			var avatar sql.NullString

			err := rows.Scan(&nickname, &avatar, &senderID, &content, &createdAt)
			if err == nil {
				finalAvatar := ""
				if avatar.Valid {
					finalAvatar = avatar.String
				}

				messages = append(messages, map[string]interface{}{
					"type":         "private",
					"sender":       nickname,
					"sender_id":    senderID,
					"avatar":       finalAvatar,
					"content":      content,
					"message_type": "user",
					"created_at":   createdAt,
				})
			}
		}

		if messages == nil {
			messages = []map[string]interface{}{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	}
}
