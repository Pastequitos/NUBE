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

		// 2. Requête SQL filtrée par serveur et incluant le message_type
		query := `
			SELECT u.nickname, m.content, m.server_id, m.message_type, m.created_at 
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

		var messages []Message
		for rows.Next() {
			var msg Message
			msg.Type = "public"
			err := rows.Scan(&msg.Sender, &msg.Content, &msg.ServerID, &msg.MessageType, &msg.CreatedAt)
			if err == nil {
				messages = append(messages, msg)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	}
}
