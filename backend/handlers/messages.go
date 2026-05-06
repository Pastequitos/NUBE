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