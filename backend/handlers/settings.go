package handlers

import (
	"forum/backend/utils"
	"log"
	"database/sql"
	"encoding/json"
	"net/http"
)

func UpdateSettingsHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
            utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
            return
        }

        cookie, _ := r.Cookie("session_token")
        var myID string
        db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

        var req struct {
            Bio string `json:"bio"`
            
        }
        json.NewDecoder(r.Body).Decode(&req)

        _, err := db.Exec("UPDATE users SET bio = ? WHERE id = ?", req.Bio, myID)
        if err != nil {
            log.Printf("❌ Erreur dans UpdateSettingsHandler : %v", err)
            utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
            return
        }

        w.WriteHeader(http.StatusOK)
    }
}

func GetUserProfileHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        userID := r.URL.Query().Get("user_id")
        if userID == "" {
            utils.SendJSONError(w, "user_id manquant", http.StatusBadRequest)
            return
        }

        var bio sql.NullString
        var createdAt sql.NullString

        err := db.QueryRow("SELECT bio, created_at FROM users WHERE id = ?", userID).Scan(&bio, &createdAt)
        
        if err != nil && err != sql.ErrNoRows {
            log.Printf("❌ Erreur dans GetUserProfileHandler : %v", err)
            utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
            return
        }

        finalBio := ""
        if bio.Valid {
            finalBio = bio.String
        }

        finalCreatedAt := ""
        if createdAt.Valid {
            finalCreatedAt = createdAt.String
        }

        isOnline := false
        for client := range hub.Clients {
            if client.UserID == userID {
                isOnline = true
                break
            }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{
            "bio":        finalBio,
            "created_at": finalCreatedAt,
            "is_online":  isOnline,
        })
    }
}