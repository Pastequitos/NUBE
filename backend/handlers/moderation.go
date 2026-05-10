package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"
)

// MuteMemberHandler gère la réduction au silence
func MuteMemberHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, _ := r.Cookie("session_token")
		var myID string
		db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		var req struct {
			ServerID string `json:"server_id"`
			TargetID string `json:"target_id"`
			Duration string `json:"duration"` // "10m", "1h", "24h", "infinite"
		}
		json.NewDecoder(r.Body).Decode(&req)

		// 1. Vérifier si je suis Admin ou Owner
		var role, ownerID string
		err := db.QueryRow(`
			SELECT sm.role, s.owner_id 
			FROM server_members sm JOIN servers s ON s.id = sm.server_id
			WHERE sm.server_id = ? AND sm.user_id = ?`,
			req.ServerID, myID).Scan(&role, &ownerID)

		if err != nil || (role != "admin" && ownerID != myID) {
			http.Error(w, "Non autorisé", http.StatusForbidden)
			return
		}

		// 2. Calculer la date de fin
		var mutedUntil *string
		if req.Duration != "infinite" {
			d, err := time.ParseDuration(req.Duration)
			if err == nil {
				t := time.Now().Add(d).Format("2006-01-02 15:04:05")
				mutedUntil = &t
			}
		} else {
			// Si c'est infini, on met une date très lointaine
			t := time.Now().AddDate(100, 0, 0).Format("2006-01-02 15:04:05")
			mutedUntil = &t
		}

		// 3. Appliquer le Mute en BDD
		_, err = db.Exec("UPDATE server_members SET muted_until = ? WHERE server_id = ? AND user_id = ?",
			mutedUntil, req.ServerID, req.TargetID)

		if err != nil {
			http.Error(w, "Erreur BDD", 500)
			return
		}

		muteNotify := map[string]interface{}{
			"type":      "mute_update",
			"server_id": req.ServerID,
			"is_muted":  true,
			"until":     *mutedUntil, // 🌟 On envoie la date calculée
		}
		notifyJSON, _ := json.Marshal(muteNotify)

		// On envoie le signal uniquement à la cible
		hub.SendToUsers(notifyJSON, req.TargetID)

		w.WriteHeader(200)
	}
}

// BanMemberHandler expulse et bannit un membre
func BanMemberHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, _ := r.Cookie("session_token")
		var myID string
		db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

		var req struct {
			ServerID string `json:"server_id"`
			TargetID string `json:"target_id"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		// 1. Vérification des droits (identique au Mute)
		var role, ownerID string
		db.QueryRow(`
			SELECT sm.role, s.owner_id 
			FROM server_members sm JOIN servers s ON s.id = sm.server_id
			WHERE sm.server_id = ? AND sm.user_id = ?`,
			req.ServerID, myID).Scan(&role, &ownerID)

		if role != "admin" && ownerID != myID {
			http.Error(w, "Non autorisé", http.StatusForbidden)
			return
		}

		// On ne peut pas bannir le propriétaire
		if req.TargetID == ownerID {
			http.Error(w, "Impossible de bannir le propriétaire", http.StatusBadRequest)
			return
		}

		// 2. Ajouter à la table des bannis ET le retirer des membres
		// On fait ça dans une transaction pour être sûr que les deux actions se fassent ensemble
		tx, _ := db.Begin()
		tx.Exec("INSERT OR IGNORE INTO server_bans (server_id, user_id) VALUES (?, ?)", req.ServerID, req.TargetID)
		tx.Exec("DELETE FROM server_members WHERE server_id = ? AND user_id = ?", req.ServerID, req.TargetID)
		tx.Commit()

		w.WriteHeader(200)
	}
}
