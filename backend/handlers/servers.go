package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func CreateServerHandler(db *sql.DB) http.HandlerFunc {
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

		var req struct {
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" || len(req.Name) > 50 {
			http.Error(w, "Nom du serveur invalide (1 à 50 caractères maximum)", http.StatusBadRequest)
			return
		}

		if req.Color == "" {
			req.Color = "#5865F2"
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Erreur interne", http.StatusInternalServerError)
			return
		}

		serverID := uuid.New().String()

		// 1. Création du serveur
		_, err = tx.Exec(`INSERT INTO servers (id, name, owner_id, color) VALUES (?, ?, ?, ?)`,
			serverID, req.Name, userID, req.Color)
		if err != nil {
			tx.Rollback()
			http.Error(w, "Erreur lors de la création du serveur", http.StatusInternalServerError)
			return
		}

		// 🌟 2. Ajout du créateur en tant que membre AVEC LE RÔLE ADMIN
		_, err = tx.Exec(`INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, 'admin')`,
			serverID, userID)
		if err != nil {
			tx.Rollback()
			http.Error(w, "Erreur lors de l'ajout du créateur aux membres", http.StatusInternalServerError)
			return
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Erreur lors de la validation des données", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{
			"id":    serverID,
			"name":  req.Name,
			"color": req.Color,
		})
	}
}

type ServerResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Avatar      string `json:"avatar"` // 🌟 Ajout du champ avatar
	Color       string `json:"color"`
	MemberCount int    `json:"member_count"`
}

func GetServersHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		// 🌟 Mise à jour de la requête pour inclure s.avatar
		query := `
            SELECT s.id, s.name, s.avatar, s.color, 
                   (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
            FROM servers s 
            JOIN server_members sm ON s.id = sm.server_id 
            WHERE sm.user_id = ?
        `
		rows, err := db.Query(query, userID)
		if err != nil {
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var servers []ServerResponse
		for rows.Next() {
			var srv ServerResponse
			var avatar sql.NullString // 🌟 Utilisation de NullString au cas où l'avatar est NULL

			if err := rows.Scan(&srv.ID, &srv.Name, &avatar, &srv.Color, &srv.MemberCount); err == nil {
				if avatar.Valid {
					srv.Avatar = avatar.String
				} else {
					srv.Avatar = ""
				}
				servers = append(servers, srv)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(servers)
	}
}

func GetServerMembersHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serverID := r.URL.Query().Get("server_id")
		if serverID == "" {
			http.Error(w, "ID serveur manquant", http.StatusBadRequest)
			return
		}
		onlineUsers := hub.GetOnlineUserIDs()

		rows, err := db.Query(`
            SELECT u.id, u.nickname, u.avatar 
            FROM users u 
            JOIN server_members sm ON u.id = sm.user_id 
            WHERE sm.server_id = ?`, serverID)
		if err != nil {
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var members []map[string]interface{}
		for rows.Next() {
			var id, nickname string
			var avatar sql.NullString

			if err := rows.Scan(&id, &nickname, &avatar); err != nil {
				continue
			}

			status := "offline"
			if onlineUsers[id] {
				status = "online"
			}

			finalAvatar := ""
			if avatar.Valid {
				finalAvatar = avatar.String
			}

			members = append(members, map[string]interface{}{
				"id":       id,
				"nickname": nickname,
				"status":   status,
				"avatar":   finalAvatar,
			})
		}

		if members == nil {
			members = []map[string]interface{}{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(members)
	}
}

func UpdateServerOverviewHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// 1. Vérification de session
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

		// 2. Lecture des données envoyées par le JS (Max 200Ko pour protéger l'image)
		r.Body = http.MaxBytesReader(w, r.Body, 200<<10)
		var req struct {
			ServerID string `json:"server_id"`
			Name     string `json:"name"`
			Avatar   string `json:"avatar"` // En Base64
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Données invalides", http.StatusBadRequest)
			return
		}

		// 3. 🛡️ SÉCURITÉ : Suis-je le propriétaire ou un Admin ?
		var role string
		var ownerID string
		err = db.QueryRow(`
			SELECT sm.role, s.owner_id 
			FROM server_members sm
			JOIN servers s ON s.id = sm.server_id
			WHERE sm.server_id = ? AND sm.user_id = ?`,
			req.ServerID, myID).Scan(&role, &ownerID)

		if err != nil || (role != "admin" && ownerID != myID) {
			http.Error(w, "Vous n'avez pas les droits pour modifier ce serveur", http.StatusForbidden)
			return
		}

		// 4. Mise à jour de la Base de Données
		// On utilise COALESCE/NULLIF pour ne mettre à jour l'avatar que si on en envoie un nouveau
		_, err = db.Exec(`
			UPDATE servers 
			SET name = ?, 
			    avatar = COALESCE(NULLIF(?, ''), avatar)
			WHERE id = ?`,
			req.Name, req.Avatar, req.ServerID)

		if err != nil {
			http.Error(w, "Erreur lors de la sauvegarde", http.StatusInternalServerError)
			return
		}

		// 5. On répond OK
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Serveur mis à jour !"})
	}
}

func GetUserRoleHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serverID := r.URL.Query().Get("server_id")
		cookie, _ := r.Cookie("session_token")
		var myID string
		_ = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		var role string
		var ownerID string
		var mutedUntil sql.NullString

		// Récupération du rôle, de l'owner et de la date de mute
		err := db.QueryRow(`
			SELECT sm.role, s.owner_id, sm.muted_until 
			FROM servers s
			LEFT JOIN server_members sm ON s.id = sm.server_id AND sm.user_id = ?
			WHERE s.id = ?`, myID, serverID).Scan(&role, &ownerID, &mutedUntil)

		if err != nil {
			http.Error(w, "Serveur introuvable", 404)
			return
		}

		// Si c'est le créateur, il est admin
		if myID == ownerID {
			role = "admin"
		}

		isMuted := false
		untilVal := ""
		if mutedUntil.Valid {
			// On stocke la valeur brute pour le JS
			untilVal = mutedUntil.String

			// Vérification si le mute est encore actif
			mutedTime, err := time.Parse(time.RFC3339, untilVal)
			if err != nil {
				mutedTime, _ = time.ParseInLocation("2006-01-02 15:04:05", untilVal, time.Local)
			}
			if time.Now().Before(mutedTime) {
				isMuted = true
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"role":     role,
			"is_muted": isMuted,
			"until":    untilVal, // 🌟 Important pour le refresh
		})
	}
}
