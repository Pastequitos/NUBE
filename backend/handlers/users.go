package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

func SearchUsersHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query().Get("q")
		if len(query) < 2 {
			http.Error(w, "Recherche trop courte", http.StatusBadRequest)
			return
		}

		rows, err := db.Query("SELECT id, nickname FROM users WHERE nickname LIKE ? LIMIT 5", "%"+query+"%")
		if err != nil {
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
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

// AddFriendHandler envoie une demande d'ami
func AddFriendHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// 1. Récupération de l'ID de l'envoyeur via la session
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non autorisé", http.StatusUnauthorized)
			return
		}

		var myID string
		err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		// 2. Récupération de l'ID de la cible
		var req struct {
			TargetID string `json:"target_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		if myID == req.TargetID {
			http.Error(w, "On ne peut pas être ami avec soi-même (même si on s'aime beaucoup)", http.StatusBadRequest)
			return
		}

		// 3. Tri des IDs pour la clé primaire (user_id1 < user_id2)
		uid1, uid2 := myID, req.TargetID
		if uid1 > uid2 {
			uid1, uid2 = uid2, uid1
		}

		// 4. Insertion en BDD
		// INSERT OR IGNORE évite les erreurs si une demande existe déjà
		result, err := db.Exec(`
			INSERT OR IGNORE INTO friends (user_id1, user_id2, status, action_user_id) 
			VALUES (?, ?, 'pending', ?)`,
			uid1, uid2, myID)

		if err != nil {
			http.Error(w, "Erreur lors de l'enregistrement de la demande", http.StatusInternalServerError)
			return
		}

		// Vérifier si une ligne a été réellement insérée
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			// 5. 🚀 NOTIFICATION WEB SOCKET (Temps Réel)
			// On prévient le destinataire qu'il a une nouvelle demande
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
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non autorisé", http.StatusUnauthorized)
			return
		}

		var myID string
		db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		query := `
            SELECT u.id, u.nickname, f.status, f.action_user_id
            FROM friends f
            JOIN users u ON (u.id = f.user_id1 OR u.id = f.user_id2)
            WHERE (f.user_id1 = ? OR f.user_id2 = ?) 
              AND u.id != ?`

		rows, err := db.Query(query, myID, myID, myID)
		if err != nil {
			http.Error(w, "Erreur SQL", 500)
			return
		}
		defer rows.Close()

		var friends []map[string]interface{}
		for rows.Next() {
			var id, nickname, status, actionUserID string
			rows.Scan(&id, &nickname, &status, &actionUserID)

			isOnline := false
			for client := range hub.Clients {
				if client.UserID == id {
					isOnline = true
					break
				}
			}

			isRequester := (actionUserID == myID)

			friends = append(friends, map[string]interface{}{
				"id":           id,
				"nickname":     nickname,
				"status":       status,
				"online":       isOnline,
				"is_requester": isRequester,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(friends)
	}
}

func AcceptFriendHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// 1. Récupérer ma session (mon ID)
		cookie, _ := r.Cookie("session_token")
		var myID string
		db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		// 2. Récupérer l'ID de la personne à accepter
		var req struct {
			TargetID string `json:"target_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		// 3. Normalisation des IDs (Ordre croissant pour la DB)
		uid1, uid2 := myID, req.TargetID
		if uid1 > uid2 {
			uid1, uid2 = uid2, uid1
		}

		// 4. Update SQL
		_, err := db.Exec(`
            UPDATE friends 
            SET status = 'accepted' 
            WHERE user_id1 = ? AND user_id2 = ? AND status = 'pending'`,
			uid1, uid2)

		if err != nil {
			http.Error(w, "Erreur SQL", http.StatusInternalServerError)
			return
		}

		// 5. Notification WebSocket (Broadcast à tout le monde)
		notification, _ := json.Marshal(map[string]interface{}{
			"type":      "friend_accept",
			"sender_id": myID,         // Celui qui a cliqué
			"target_id": req.TargetID, // L'autre qui attend
		})
		hub.Broadcast <- notification

		w.WriteHeader(http.StatusOK)
	}
}

// DeclineFriendHandler supprime simplement la relation
func DeclineFriendHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
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
			http.Error(w, "Erreur lors du refus", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}
