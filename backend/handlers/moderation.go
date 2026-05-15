package handlers

import (
	"database/sql"
	"encoding/json"
	"forum/backend/utils"
	"log"
	"net/http"
	"time"
)

func MuteMemberHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, _ := r.Cookie("session_token")
		var myID string
		db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		var req struct {
			ServerID string `json:"server_id"`
			TargetID string `json:"target_id"`
			Duration string `json:"duration"` 
		}
		json.NewDecoder(r.Body).Decode(&req)

		var role string
		err := db.QueryRow(`
			SELECT role 
			FROM server_members
			WHERE server_id = ? AND user_id = ?`,
			req.ServerID, myID).Scan(&role)

		if err != nil || role != "admin" {
			utils.SendJSONError(w, "Accès refusé : Droits administrateur requis", http.StatusForbidden)
			return
		}

		var mutedUntil *string
		if req.Duration != "infinite" {
			d, err := time.ParseDuration(req.Duration)
			if err == nil {
				t := time.Now().Add(d).Format("2006-01-02 15:04:05")
				mutedUntil = &t
			}
		} else {
			
			t := time.Now().AddDate(100, 0, 0).Format("2006-01-02 15:04:05")
			mutedUntil = &t
		}

		_, err = db.Exec("UPDATE server_members SET muted_until = ? WHERE server_id = ? AND user_id = ?",
			mutedUntil, req.ServerID, req.TargetID)

		if err != nil {
			log.Printf("❌ Erreur dans MuteMemberHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", 500)
			return
		}

		muteNotify := map[string]interface{}{
			"type":      "mute_update",
			"server_id": req.ServerID,
			"is_muted":  true,
			"until":     *mutedUntil, 
		}
		notifyJSON, _ := json.Marshal(muteNotify)

		hub.SendToUsers(notifyJSON, req.TargetID)

		w.WriteHeader(200)
	}
}

func BanMemberHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé", http.StatusUnauthorized)
			return
		}

		var req struct {
			ServerID string `json:"server_id"`
			TargetID string `json:"target_id"`
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

		var ownerID string
		db.QueryRow("SELECT owner_id FROM servers WHERE id = ?", req.ServerID).Scan(&ownerID)

		if req.TargetID == ownerID {
			utils.SendJSONError(w, "Impossible de bannir le propriétaire du serveur", http.StatusBadRequest)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			log.Printf("❌ Erreur dans BanMemberHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		defer tx.Rollback()

		_, err = tx.Exec("INSERT OR IGNORE INTO server_bans (server_id, user_id) VALUES (?, ?)",
			req.ServerID, req.TargetID)
		if err != nil {
			log.Printf("❌ Erreur lors du bannissement : %v", err)
			log.Printf("❌ Erreur dans BanMemberHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		_, err = tx.Exec("DELETE FROM server_members WHERE server_id = ? AND user_id = ?",
			req.ServerID, req.TargetID)
		if err != nil {
			log.Printf("❌ Erreur lors de l'expulsion : %v", err)
			log.Printf("❌ Erreur dans BanMemberHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		if err := tx.Commit(); err != nil {
			log.Printf("❌ Erreur dans BanMemberHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Utilisateur banni avec succès"})
	}
}
