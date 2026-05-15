package utils

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
)

const SessionCookieName = "session_token"

func GetUserIDFromSession(r *http.Request, db *sql.DB) (string, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return "", err
	}

	var userID string
	err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&userID)

	return userID, err
}

func SendJSONError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}

func ValidateImageMimeType(data []byte) error {
	mimeType := http.DetectContentType(data)
	if mimeType != "image/png" && mimeType != "image/jpeg" && mimeType != "image/webp" {
		return fmt.Errorf("type de fichier non autorisé : %s", mimeType)
	}
	return nil
}
