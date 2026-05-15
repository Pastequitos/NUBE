package database

import (
	"database/sql"
	"log"
	"time"
)

func StartGlobalCleaner(db *sql.DB) {
	ticker := time.NewTicker(1 * time.Hour)

	go func() {
		for range ticker.C {
			log.Println("🧹 [Cleaner] Début du grand ménage cyclique...")

			resInv, err := db.Exec("DELETE FROM invites WHERE expires_at < CURRENT_TIMESTAMP")
			if err != nil {
				log.Printf("❌ Erreur invites: %v", err)
			} else if count, _ := resInv.RowsAffected(); count > 0 {
				log.Printf("✅ %d invitations expirées supprimées", count)
			}

			resSes, err := db.Exec("DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP")
			if err != nil {
				log.Printf("❌ Erreur sessions: %v", err)
			} else if count, _ := resSes.RowsAffected(); count > 0 {
				log.Printf("✅ %d sessions expirées nettoyées (utilisateurs déconnectés)", count)
			}

			resMute, err := db.Exec("UPDATE server_members SET muted_until = NULL WHERE muted_until < CURRENT_TIMESTAMP")
			if err != nil {
				log.Printf("❌ Erreur mutes: %v", err)
			} else if count, _ := resMute.RowsAffected(); count > 0 {
				log.Printf("🔊 %d mutes sont arrivés à terme, la parole est libérée !", count)
			}
		}
	}()
}
