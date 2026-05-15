package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"forum/backend/utils"
)

func GetMessagesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		
		serverID := r.URL.Query().Get("server_id")
		if serverID == "" {
			utils.SendJSONError(w, "server_id manquant", http.StatusBadRequest)
			return
		}

		offsetStr := r.URL.Query().Get("offset")
		offset := 0
		if offsetStr != "" {
			offset, _ = strconv.Atoi(offsetStr)
		}

		query := `
            SELECT u.nickname, u.avatar, m.sender_id, m.content, m.server_id, m.message_type, m.created_at 
            FROM messages m 
            JOIN users u ON m.sender_id = u.id 
            WHERE m.server_id = ? 
            ORDER BY m.created_at DESC
            LIMIT 20 OFFSET ?
        `

		rows, err := db.Query(query, serverID, offset)
		if err != nil {
			log.Printf("❌ Erreur dans GetMessagesHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var messages []map[string]interface{}

		for rows.Next() {
			var nickname, content, srvID, msgType, createdAt, senderID string
			var avatar sql.NullString 

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

		for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
			messages[i], messages[j] = messages[j], messages[i]
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	}
}

func GetPrivateMessagesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		
		currentUserID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		friendID := r.URL.Query().Get("user_id")
		if friendID == "" {
			utils.SendJSONError(w, "user_id manquant", http.StatusBadRequest)
			return
		}

		offsetStr := r.URL.Query().Get("offset")
		offset := 0
		if offsetStr != "" {
			offset, _ = strconv.Atoi(offsetStr)
		}

		query := `
            SELECT u.nickname, u.avatar, m.sender_id, m.content, m.created_at 
            FROM private_messages m 
            JOIN users u ON m.sender_id = u.id 
            WHERE (m.sender_id = ? AND m.receiver_id = ?) 
               OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.created_at DESC
            LIMIT 20 OFFSET ?
        `

		rows, err := db.Query(query, currentUserID, friendID, friendID, currentUserID, offset)
		if err != nil {
			log.Printf("❌ Erreur dans GetPrivateMessagesHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var messages []utils.Message

		for rows.Next() {
			var msg utils.Message
			var avatar sql.NullString

			err := rows.Scan(&msg.Sender, &avatar, &msg.SenderID, &msg.Content, &msg.CreatedAt)
			if err == nil {
				msg.Type = "private"
				msg.MessageType = "user"

				if avatar.Valid {
					msg.Avatar = avatar.String
				}

				messages = append(messages, msg)
			}
		}

		if messages == nil {
			messages = []utils.Message{}
		}

		for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
			messages[i], messages[j] = messages[j], messages[i]
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	}
}
