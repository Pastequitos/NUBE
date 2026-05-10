package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

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

		_, err = tx.Exec(`INSERT INTO servers (id, name, owner_id, color) VALUES (?, ?, ?, ?)`,
			serverID, req.Name, userID, req.Color)
		if err != nil {
			tx.Rollback()
			http.Error(w, "Erreur lors de la création du serveur", http.StatusInternalServerError)
			return
		}

		_, err = tx.Exec(`INSERT INTO server_members (server_id, user_id) VALUES (?, ?)`,
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

		query := `
            SELECT s.id, s.name, s.color, 
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
			if err := rows.Scan(&srv.ID, &srv.Name, &srv.Color, &srv.MemberCount); err == nil {
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
