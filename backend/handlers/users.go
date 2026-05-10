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
		err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		// 🌟 SQL MAGIQUE : On ajoute une sous-requête pour compter les messages non lus
		// COALESCE permet de mettre une date très ancienne si on n'a jamais ouvert la discussion.
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
            ) as unread_count
            FROM friends f
            JOIN users u ON (u.id = f.user_id1 OR u.id = f.user_id2)
            WHERE (f.user_id1 = ? OR f.user_id2 = ?) 
              AND u.id != ?`

		rows, err := db.Query(query, myID, myID, myID, myID, myID)
		if err != nil {
			http.Error(w, "Erreur SQL lors de la récupération des amis", 500)
			return
		}
		defer rows.Close()

		var friends []map[string]interface{}
		for rows.Next() {
			var id, nickname, status, actionUserID string
			var avatar sql.NullString
			var unreadCount int // 🌟 Nouvelle variable

			// On ajoute &unreadCount au scan
			if err := rows.Scan(&id, &nickname, &avatar, &status, &actionUserID, &unreadCount); err != nil {
				continue
			}

			// Statut en ligne via le Hub
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
				"unread_count": unreadCount, // 🌟 On l'envoie au Frontend
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

// Modifie la signature pour accepter le Hub
func DeclineFriendHandler(db *sql.DB, hub *Hub) http.HandlerFunc { // 🌟 Ajout du hub
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
			http.Error(w, "Erreur lors de la suppression", http.StatusInternalServerError)
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

type AvatarRequest struct {
	Avatar string `json:"avatar"`
}

func UpdateAvatarHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"message": "Méthode non autorisée"}`, http.StatusMethodNotAllowed)
			return
		}

		// 🌟 SÉCURITÉ ULTRA-OPTIMISÉE :
		// Puisque le JS envoie un WebP 128x128, ça ne dépassera jamais 50Ko.
		// On met un plafond strict à 200 Ko (200 * 1024 octets).
		// Si un pirate essaie d'envoyer plus, le serveur lui raccroche au nez !
		r.Body = http.MaxBytesReader(w, r.Body, 200<<10)

		// 1. On vérifie que l'utilisateur est bien connecté
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, `{"message": "Non connecté"}`, http.StatusUnauthorized)
			return
		}

		var myID string
		err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)
		if err != nil {
			http.Error(w, `{"message": "Session invalide"}`, http.StatusUnauthorized)
			return
		}

		// 2. On lit l'image en Base64 envoyée par le frontend
		var req AvatarRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"message": "Données invalides"}`, http.StatusBadRequest)
			return
		}

		if req.Avatar == "" {
			http.Error(w, `{"message": "Aucune image fournie"}`, http.StatusBadRequest)
			return
		}

		_, err = db.Exec("UPDATE users SET avatar = ? WHERE id = ?", req.Avatar, myID)
		if err != nil {
			http.Error(w, `{"message": "Erreur serveur lors de la sauvegarde"}`, http.StatusInternalServerError)
			return
		}

		// 4. On renvoie un succès au JS
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Avatar mis à jour avec succès"})
	}
}

func UpdateLastServerHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// 1. Vérifier la session
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non connecté", http.StatusUnauthorized)
			return
		}

		var myID string
		err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		var req struct {
			ServerID string `json:"server_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		// 🌟 ON FAIT DEUX UPDATES D'UN COUP
		// 1. Mémorise le dernier serveur (ton code actuel)
		db.Exec("UPDATE users SET last_server_id = ? WHERE id = ?", req.ServerID, myID)

		// 2. Marque le serveur comme LU (Nouveau !)
		// On met à jour la date dans la table de liaison
		db.Exec(`
            UPDATE server_members 
            SET last_read_at = CURRENT_TIMESTAMP 
            WHERE server_id = ? AND user_id = ?`,
			req.ServerID, myID)

		w.WriteHeader(http.StatusOK)
	}
}

// GetUnreadCountsHandler renvoie le nombre de messages non lus pour chaque serveur
func GetUnreadCountsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non connecté", http.StatusUnauthorized)
			return
		}

		var userID string
		err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&userID)
		if err != nil {
			http.Error(w, "Session invalide", http.StatusUnauthorized)
			return
		}

		// 🌟 On compte les messages créés APRÈS la date de dernière lecture
		// et on exclut les messages envoyés par l'utilisateur lui-même (m.sender_id != sm.user_id) !
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
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
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

// MarkPrivateReadHandler met à jour la date de dernière lecture d'une conversation privée
func MarkPrivateReadHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		var req struct {
			TargetID string `json:"target_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		// 🌟 INSERT OR REPLACE : Magie de SQLite !
		// Si la ligne existe, il la met à jour. Si elle n'existe pas (première discussion), il la crée.
		_, err = db.Exec(`
            INSERT OR REPLACE INTO private_read_receipts (user_id, peer_id, last_read_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)`,
			myID, req.TargetID)

		if err != nil {
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}
