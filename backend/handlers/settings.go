package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
)
// 1. Pour sauvegarder la bio quand on clique sur "Enregistrer" dans les paramètres
func UpdateSettingsHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
            http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
            return
        }

        cookie, _ := r.Cookie("session_token")
        var myID string
        db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&myID)

        var req struct {
            Bio string `json:"bio"`
            // On ignore l'avatar ici car il est déjà géré en direct par /api/avatar
        }
        json.NewDecoder(r.Body).Decode(&req)

        _, err := db.Exec("UPDATE users SET bio = ? WHERE id = ?", req.Bio, myID)
        if err != nil {
            http.Error(w, "Erreur BDD", http.StatusInternalServerError)
            return
        }

        w.WriteHeader(http.StatusOK)
    }
}

// 2. Pour récupérer la bio quand on clique sur un utilisateur
// 🌟 Ajout du paramètre hub *Hub pour vérifier qui est en ligne
func GetUserProfileHandler(db *sql.DB, hub *Hub) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        userID := r.URL.Query().Get("user_id")
        if userID == "" {
            http.Error(w, "user_id manquant", http.StatusBadRequest)
            return
        }

        // 🌟 1. On va chercher la bio ET la date de création
        var bio sql.NullString
        var createdAt sql.NullString
        
        // Assure-toi que la colonne s'appelle bien 'created_at' dans ta DB !
        err := db.QueryRow("SELECT bio, created_at FROM users WHERE id = ?", userID).Scan(&bio, &createdAt)
        
        if err != nil && err != sql.ErrNoRows {
            http.Error(w, "Erreur BDD", http.StatusInternalServerError)
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

        // 🌟 2. On vérifie si l'utilisateur est en ligne grâce au Hub
        isOnline := false
        for client := range hub.Clients {
            if client.UserID == userID {
                isOnline = true
                break
            }
        }

        // 🌟 3. On renvoie tout au format JSON (interface{} permet de mélanger string et bool)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{
            "bio":        finalBio,
            "created_at": finalCreatedAt,
            "is_online":  isOnline,
        })
    }
}