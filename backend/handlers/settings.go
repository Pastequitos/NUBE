package handlers

import (
	"forum/backend/utils"
	"log"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"encoding/base64"
	"os"
	"path/filepath"
	"fmt"
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
            Bio        string `json:"bio"`
            Background string `json:"background"`
        }
        json.NewDecoder(r.Body).Decode(&req)

        var err error
        if req.Background != "" {
            _, err = db.Exec("UPDATE users SET bio = ?, background = ? WHERE id = ?", req.Bio, req.Background, myID)
        } else {
            _, err = db.Exec("UPDATE users SET bio = ? WHERE id = ?", req.Bio, myID)
        }
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

func UploadBackgroundHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// Max size 5MB (highly compressed WebP 1920x1080 is around ~200KB-800KB, so 5MB is extremely safe)
		r.Body = http.MaxBytesReader(w, r.Body, 5<<20)

		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non autorisé ou session invalide", http.StatusUnauthorized)
			return
		}

		var req struct {
			Background string `json:"background"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			utils.SendJSONError(w, "Données invalides", http.StatusBadRequest)
			return
		}

		if req.Background == "" || !strings.HasPrefix(req.Background, "data:image/") {
			utils.SendJSONError(w, "Format d'image invalide", http.StatusBadRequest)
			return
		}

		parts := strings.Split(req.Background, ",")
		if len(parts) < 2 {
			utils.SendJSONError(w, "Base64 corrompu", http.StatusBadRequest)
			return
		}

		decodedData, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			log.Printf("❌ Erreur dans UploadBackgroundHandler : %v", err)
			utils.SendJSONError(w, "Base64 invalide", http.StatusBadRequest)
			return
		}

		if err := utils.ValidateImageMimeType(decodedData); err != nil {
			utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
			return
		}

		uploadDir := "./uploads/background"
		os.MkdirAll(uploadDir, 0755)

		fileName := fmt.Sprintf("bg-%s.webp", myID)
		filePath := filepath.Join(uploadDir, fileName)

		err = os.WriteFile(filePath, decodedData, 0644)
		if err != nil {
			log.Printf("❌ Erreur dans UploadBackgroundHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue lors de l'écriture du fichier.", http.StatusInternalServerError)
			return
		}

		dbPath := fmt.Sprintf("/uploads/background/%s", fileName)
		_, err = db.Exec("UPDATE users SET background = ? WHERE id = ?", dbPath, myID)
		if err != nil {
			log.Printf("❌ Erreur dans UploadBackgroundHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue lors de la mise à jour en BDD.", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Background mis à jour",
			"path":    dbPath,
		})
	}
}