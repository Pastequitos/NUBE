package handlers

import (
	"log"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"forum/backend/utils"

	"github.com/google/uuid"
)

func CreateServerHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		userID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var req struct {
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, "Requête invalide", http.StatusBadRequest)
			return
		}

		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" || len(req.Name) > 50 {
			utils.SendJSONError(w, "Nom du serveur invalide (1 à 50 caractères maximum)", http.StatusBadRequest)
			return
		}

		if req.Color == "" {
			req.Color = "#5865F2"
		}

		tx, err := db.Begin()
		if err != nil {
			log.Printf("❌ Erreur dans CreateServerHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		serverID := uuid.New().String()

		_, err = tx.Exec(`INSERT INTO servers (id, name, owner_id, color) VALUES (?, ?, ?, ?)`,
			serverID, req.Name, userID, req.Color)
		if err != nil {
			tx.Rollback()
			log.Printf("❌ Erreur dans CreateServerHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		_, err = tx.Exec(`INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, 'admin')`,
			serverID, userID)
		if err != nil {
			tx.Rollback()
			log.Printf("❌ Erreur dans CreateServerHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		if err := tx.Commit(); err != nil {
			log.Printf("❌ Erreur dans CreateServerHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
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

func GetServersHandler(db *sql.DB) http.HandlerFunc {
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
            SELECT s.id, s.name, s.avatar, s.color, 
                   (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
            FROM servers s 
            JOIN server_members sm ON s.id = sm.server_id 
            WHERE sm.user_id = ?
        `
		rows, err := db.Query(query, userID)
		if err != nil {
			log.Printf("❌ Erreur dans GetServersHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var servers []utils.ServerResponse
		for rows.Next() {
			var srv utils.ServerResponse
			var avatar sql.NullString

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
			utils.SendJSONError(w, "ID serveur manquant", http.StatusBadRequest)
			return
		}
		onlineUsers := hub.GetOnlineUserIDs()

		rows, err := db.Query(`
            SELECT u.id, u.nickname, u.avatar, sm.role
            FROM users u 
            JOIN server_members sm ON u.id = sm.user_id 
            WHERE sm.server_id = ?`, serverID)
		if err != nil {
			log.Printf("❌ Erreur dans GetServerMembersHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var members []map[string]interface{}
		for rows.Next() {
			var id, nickname, role string
			var avatar sql.NullString

			if err := rows.Scan(&id, &nickname, &avatar, &role); err != nil {
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
				"role":     role,
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
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 200<<10)
		var req struct {
			ServerID string `json:"server_id"`
			Name     string `json:"name"`
			Avatar   string `json:"avatar"` 
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, "Données invalides", http.StatusBadRequest)
			return
		}

		var role string
		err = db.QueryRow(`
            SELECT role 
            FROM server_members
            WHERE server_id = ? AND user_id = ?`,
			req.ServerID, myID).Scan(&role)

		if err != nil || role != "admin" {
			utils.SendJSONError(w, "Accès refusé : Droits administrateur requis", http.StatusForbidden)
			return
		}

		dbAvatarPath := ""
		if req.Avatar != "" && strings.HasPrefix(req.Avatar, "data:image/") {

			parts := strings.Split(req.Avatar, ",")
			if len(parts) == 2 {
				decodedData, err := base64.StdEncoding.DecodeString(parts[1])
				if err == nil {
					if err := utils.ValidateImageMimeType(decodedData); err != nil {
						utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
						return
					}

					ext := ".png"
					if strings.Contains(parts[0], "webp") {
						ext = ".webp"
					}
					if strings.Contains(parts[0], "jpeg") {
						ext = ".jpg"
					}

					uploadDir := "./uploads/serverAvatar"
					os.MkdirAll(uploadDir, 0755)

					fileName := fmt.Sprintf("server_%s_%d%s", req.ServerID, time.Now().Unix(), ext)
					filePath := filepath.Join(uploadDir, fileName)

					var oldAvatar sql.NullString
					err = db.QueryRow("SELECT avatar FROM servers WHERE id = ?", req.ServerID).Scan(&oldAvatar)
					if err == nil && oldAvatar.Valid && oldAvatar.String != "" {
						oldPath := "." + oldAvatar.String
						if strings.HasPrefix(oldPath, "./uploads/") {
							os.Remove(oldPath)
						}
					}

					if err := os.WriteFile(filePath, decodedData, 0644); err == nil {
						dbAvatarPath = "/uploads/serverAvatar/" + fileName
					}
				}
			}
		}

		if dbAvatarPath != "" {
			_, err = db.Exec(`UPDATE servers SET name = ?, avatar = ? WHERE id = ?`,
				req.Name, dbAvatarPath, req.ServerID)
		} else {
			_, err = db.Exec(`UPDATE servers SET name = ? WHERE id = ?`,
				req.Name, req.ServerID)
		}

		if err != nil {
			log.Printf("❌ Erreur dans UpdateServerOverviewHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Serveur mis à jour !",
			"avatar":  dbAvatarPath,
		})
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

		err := db.QueryRow(`
			SELECT sm.role, s.owner_id, sm.muted_until 
			FROM servers s
			LEFT JOIN server_members sm ON s.id = sm.server_id AND sm.user_id = ?
			WHERE s.id = ?`, myID, serverID).Scan(&role, &ownerID, &mutedUntil)

		if err != nil {
			utils.SendJSONError(w, "Serveur introuvable", 404)
			return
		}

		if myID == ownerID {
			role = "admin"
		}

		isMuted := false
		untilVal := ""
		if mutedUntil.Valid {
			untilVal = mutedUntil.String

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
			"until":    untilVal, 
		})
	}
}

func DeleteServerHandler(db *sql.DB) http.HandlerFunc {
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, "Données invalides", http.StatusBadRequest)
			return
		}

		var ownerID string
		var avatar sql.NullString
		err = db.QueryRow("SELECT owner_id, avatar FROM servers WHERE id = ?", req.ServerID).Scan(&ownerID, &avatar)
		if err != nil {
			utils.SendJSONError(w, "Serveur introuvable", http.StatusNotFound)
			return
		}

		if ownerID != myID {
			utils.SendJSONError(w, "Seul le propriétaire peut supprimer le serveur", http.StatusForbidden)
			return
		}

		if avatar.Valid && avatar.String != "" {
			oldPath := "." + avatar.String
			if strings.HasPrefix(oldPath, "./uploads/") {
				os.Remove(oldPath)
			}
		}

		_, err = db.Exec("DELETE FROM servers WHERE id = ?", req.ServerID)
		if err != nil {
			log.Printf("❌ Erreur dans DeleteServerHandler : %v", err)
			utils.SendJSONError(w, "Erreur interne", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Serveur supprimé"})
	}
}

func UpdateMemberRoleHandler(db *sql.DB) http.HandlerFunc {
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
			TargetID string `json:"target_id"`
			Role     string `json:"role"` 
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, "Données invalides", http.StatusBadRequest)
			return
		}

		if req.Role != "admin" && req.Role != "member" {
			utils.SendJSONError(w, "Rôle invalide", http.StatusBadRequest)
			return
		}

		var myRole string
		err = db.QueryRow("SELECT role FROM server_members WHERE server_id = ? AND user_id = ?", req.ServerID, myID).Scan(&myRole)
		if err != nil || myRole != "admin" {
			utils.SendJSONError(w, "Accès refusé : Droits administrateur requis", http.StatusForbidden)
			return
		}

		var ownerID string
		db.QueryRow("SELECT owner_id FROM servers WHERE id = ?", req.ServerID).Scan(&ownerID)
		if req.TargetID == ownerID {
			utils.SendJSONError(w, "Impossible de modifier le rôle du propriétaire du serveur", http.StatusForbidden)
			return
		}

		_, err = db.Exec("UPDATE server_members SET role = ? WHERE server_id = ? AND user_id = ?", req.Role, req.ServerID, req.TargetID)
		if err != nil {
			log.Printf("❌ Erreur dans UpdateMemberRoleHandler : %v", err)
			utils.SendJSONError(w, "Erreur interne", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Rôle mis à jour avec succès"})
	}
}
