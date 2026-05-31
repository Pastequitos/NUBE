package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"forum/backend/utils"
)

func SearchUsersHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query().Get("q")
		if len(query) < 2 {
			utils.SendJSONError(w, "Recherche trop courte", http.StatusBadRequest)
			return
		}

		rows, err := db.Query("SELECT id, nickname FROM users WHERE nickname LIKE ? LIMIT 5", "%"+query+"%")
		if err != nil {
			log.Printf("❌ Erreur dans SearchUsersHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var users []map[string]string
		for rows.Next() {
			var id, nickname string
			rows.Scan(&id, &nickname)
			users = append(users, map[string]string{"id": id, "nickname": nickname})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

func AddFriendHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var req struct {
			TargetID string `json:"target_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		if myID == req.TargetID {
			utils.SendJSONError(w, "On ne peut pas être ami avec soi-même (même si on s'aime beaucoup)", http.StatusBadRequest)
			return
		}

		uid1, uid2 := myID, req.TargetID
		if uid1 > uid2 {
			uid1, uid2 = uid2, uid1
		}

		result, err := db.Exec(`
            INSERT OR IGNORE INTO friends (user_id1, user_id2, status, action_user_id) 
            VALUES (?, ?, 'pending', ?)`,
			uid1, uid2, myID)

		if err != nil {
			log.Printf("❌ Erreur dans AddFriendHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			notification, _ := json.Marshal(map[string]interface{}{
				"type":      "friend_request",
				"sender_id": myID,
				"target_id": req.TargetID,
				"status":    "pending",
			})
			hub.Broadcast <- notification
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Demande traitée"})
	}
}

func GetFriendsHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		query := `
            SELECT u.id, u.nickname, u.avatar, f.status, f.action_user_id,
            (
                SELECT COUNT(*) 
                FROM private_messages pm 
                WHERE pm.sender_id = u.id 
                  AND pm.receiver_id = ? 
                  AND pm.created_at > COALESCE(
                      (SELECT prr.last_read_at FROM private_read_receipts prr WHERE prr.user_id = ? AND prr.peer_id = u.id), 
                      '1970-01-01 00:00:00'
                  )
            ) as unread_count,
            COALESCE((
                SELECT MAX(created_at)
                FROM private_messages
                WHERE (sender_id = ? AND receiver_id = u.id)
                   OR (sender_id = u.id AND receiver_id = ?)
            ), '1970-01-01 00:00:00') as last_message_at
            FROM friends f
            JOIN users u ON (u.id = f.user_id1 OR u.id = f.user_id2)
            WHERE (f.user_id1 = ? OR f.user_id2 = ?) 
              AND u.id != ?
            ORDER BY last_message_at DESC`

		rows, err := db.Query(query, myID, myID, myID, myID, myID, myID, myID)
		if err != nil {
			log.Printf("❌ Erreur dans GetFriendsHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", 500)
			return
		}
		defer rows.Close()

		var friends []map[string]interface{}
		for rows.Next() {
			var id, nickname, status, actionUserID, lastMsgAt string
			var avatar sql.NullString
			var unreadCount int 

			if err := rows.Scan(&id, &nickname, &avatar, &status, &actionUserID, &unreadCount, &lastMsgAt); err != nil {
				continue
			}

			isOnline := false
			for client := range hub.Clients {
				if client.UserID == id {
					isOnline = true
					break
				}
			}

			isRequester := (actionUserID == myID)

			finalAvatar := ""
			if avatar.Valid {
				finalAvatar = avatar.String
			}

			friends = append(friends, map[string]interface{}{
				"id":           id,
				"nickname":     nickname,
				"status":       status,
				"online":       isOnline,
				"is_requester": isRequester,
				"avatar":       finalAvatar,
				"unread_count": unreadCount,
			})
		}

		if friends == nil {
			friends = []map[string]interface{}{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(friends)
	}
}

func AcceptFriendHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		cookie, _ := r.Cookie("session_token")
		var myID string
		db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		var req struct {
			TargetID string `json:"target_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		uid1, uid2 := myID, req.TargetID
		if uid1 > uid2 {
			uid1, uid2 = uid2, uid1
		}

		_, err := db.Exec(`
            UPDATE friends 
            SET status = 'accepted' 
            WHERE user_id1 = ? AND user_id2 = ? AND status = 'pending'`,
			uid1, uid2)

		if err != nil {
			log.Printf("❌ Erreur dans AcceptFriendHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		notification, _ := json.Marshal(map[string]interface{}{
			"type":      "friend_accept",
			"sender_id": myID,         
			"target_id": req.TargetID, 
		})
		hub.Broadcast <- notification

		w.WriteHeader(http.StatusOK)
	}
}

func DeclineFriendHandler(db *sql.DB, hub *Hub) http.HandlerFunc { 
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		cookie, _ := r.Cookie("session_token")
		var myID string
		db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		var req struct {
			TargetID string `json:"target_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		uid1, uid2 := myID, req.TargetID
		if uid1 > uid2 {
			uid1, uid2 = uid2, uid1
		}

		_, err := db.Exec("DELETE FROM friends WHERE user_id1 = ? AND user_id2 = ?", uid1, uid2)
		if err != nil {
			log.Printf("❌ Erreur dans DeclineFriendHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		notification, _ := json.Marshal(map[string]interface{}{
			"type":      "friend_remove",
			"sender_id": myID,
			"target_id": req.TargetID,
		})
		hub.Broadcast <- notification

		w.WriteHeader(http.StatusOK)
	}
}

func UpdateAvatarHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, `{"message": "Méthode non autorisée"}`, http.StatusMethodNotAllowed)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 200<<10)

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "Non autorisé ou session invalide"})
			return
		}

		var req utils.AvatarRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, `{"message": "Données invalides"}`, http.StatusBadRequest)
			return
		}

		if req.Avatar == "" || !strings.HasPrefix(req.Avatar, "data:image/") {
			utils.SendJSONError(w, `{"message": "Format d'image invalide"}`, http.StatusBadRequest)
			return
		}

		parts := strings.Split(req.Avatar, ",")
		if len(parts) < 2 {
			utils.SendJSONError(w, `{"message": "Base64 corrompu"}`, http.StatusBadRequest)
			return
		}

		extension := ".png"
		if strings.Contains(parts[0], "webp") {
			extension = ".webp"
		} else if strings.Contains(parts[0], "jpeg") || strings.Contains(parts[0], "jpg") {
			extension = ".jpg"
		}

		decodedData, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			log.Printf("❌ Erreur dans UpdateAvatarHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		if err := utils.ValidateImageMimeType(decodedData); err != nil {
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}

		uploadDir := "./uploads/avatars"
		os.MkdirAll(uploadDir, 0755)

		fileName := fmt.Sprintf("avatar_%s_%d%s", myID, time.Now().Unix(), extension)
		filePath := filepath.Join(uploadDir, fileName)

		var oldAvatar sql.NullString
		err = db.QueryRow("SELECT avatar FROM users WHERE id = ?", myID).Scan(&oldAvatar)
		if err == nil && oldAvatar.Valid && oldAvatar.String != "" {
			oldPath := "." + oldAvatar.String 
			if strings.HasPrefix(oldPath, "./uploads/") {
				os.Remove(oldPath) 
			}
		}

		err = os.WriteFile(filePath, decodedData, 0644)
		if err != nil {
			log.Printf("❌ Erreur dans UpdateAvatarHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		dbPath := fmt.Sprintf("/uploads/avatars/%s", fileName)
		_, err = db.Exec("UPDATE users SET avatar = ? WHERE id = ?", dbPath, myID)
		if err != nil {
			log.Printf("❌ Erreur dans UpdateAvatarHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Avatar mis à jour",
			"path":    dbPath,
		})
	}
}

func UpdateLastServerHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var req struct {
			ServerID string `json:"server_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		db.Exec("UPDATE users SET last_server_id = ? WHERE id = ?", req.ServerID, myID)

		db.Exec(`
            UPDATE server_members 
            SET last_read_at = CURRENT_TIMESTAMP 
            WHERE server_id = ? AND user_id = ?`,
			req.ServerID, myID)

		w.WriteHeader(http.StatusOK)
	}
}

func GetUnreadCountsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		userID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		query := `
            SELECT sm.server_id, COUNT(m.id) 
            FROM server_members sm
            LEFT JOIN messages m ON sm.server_id = m.server_id 
                AND m.created_at > sm.last_read_at 
                AND m.sender_id != sm.user_id
            WHERE sm.user_id = ?
            GROUP BY sm.server_id`

		rows, err := db.Query(query, userID)
		if err != nil {
			log.Printf("❌ Erreur dans GetUnreadCountsHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		results := make(map[string]int)
		for rows.Next() {
			var sID string
			var count int
			if err := rows.Scan(&sID, &count); err == nil {
				results[sID] = count
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

func MarkPrivateReadHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var req struct {
			TargetID string `json:"target_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		_, err = db.Exec(`
            INSERT OR REPLACE INTO private_read_receipts (user_id, peer_id, last_read_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)`,
			myID, req.TargetID)

		if err != nil {
			log.Printf("❌ Erreur dans MarkPrivateReadHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func DeleteUserHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var userAvatar sql.NullString
		var userBackground sql.NullString
		_ = db.QueryRow("SELECT avatar, background FROM users WHERE id = ?", myID).Scan(&userAvatar, &userBackground)

		rows, err := db.Query("SELECT avatar FROM servers WHERE owner_id = ?", myID)
		var serverAvatars []string
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var sa sql.NullString
				if err := rows.Scan(&sa); err == nil && sa.Valid && sa.String != "" {
					serverAvatars = append(serverAvatars, sa.String)
				}
			}
		}

		_, err = db.Exec("DELETE FROM users WHERE id = ?", myID)
		if err != nil {
			log.Printf("❌ Erreur dans DeleteUserHandler : %v", err)
			utils.SendJSONError(w, "Erreur interne", http.StatusInternalServerError)
			return
		}

		if userAvatar.Valid && userAvatar.String != "" {
			oldPath := "." + userAvatar.String
			if strings.HasPrefix(oldPath, "./uploads/") {
				os.Remove(oldPath)
			}
		}

		if userBackground.Valid && userBackground.String != "" {
			oldBgPath := "." + userBackground.String
			if strings.HasPrefix(oldBgPath, "./uploads/") {
				os.Remove(oldBgPath)
			}
		}

		for _, sa := range serverAvatars {
			oldPath := "." + sa
			if strings.HasPrefix(oldPath, "./uploads/") {
				os.Remove(oldPath)
			}
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    "",
			Path:     "/",
			Expires:  time.Now().Add(-1 * time.Hour),
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Compte supprimé"})
	}
}
