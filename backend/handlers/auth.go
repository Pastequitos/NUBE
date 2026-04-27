package handlers

import (
	"database/sql"
	"encoding/json"
	"forum-certif/backend/utils"
	"net/http"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func RegisterHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		var user utils.User
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			http.Error(w, "Données invalides", http.StatusBadRequest)
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, "Erreur hachage", http.StatusInternalServerError)
			return
		}

		newID := uuid.New().String()
		query := `INSERT INTO users (id, nickname, age, gender, first_name, last_name, email, password) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

		_, err = db.Exec(query, newID, user.Nickname, user.Age, user.Gender, user.FirstName, user.LastName, user.Email, string(hashedPassword))
		if err != nil {
			http.Error(w, "Utilisateur ou Email déjà existant", http.StatusConflict)
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "Utilisateur créé avec succès !"})
	}
}

func LoginHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		var creds struct {
			Login    string `json:"login"`
			Password string `json:"password"`
		}
		json.NewDecoder(r.Body).Decode(&creds)

		var user utils.User
		query := `SELECT id, nickname, password FROM users WHERE email = ? OR nickname = ?`
		err := db.QueryRow(query, creds.Login, creds.Login).Scan(&user.ID, &user.Nickname, &user.Password)
		if err != nil {
			http.Error(w, "Identifiants incorrects", http.StatusUnauthorized)
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(creds.Password)); err != nil {
			http.Error(w, "Identifiants incorrects", http.StatusUnauthorized)
			return
		}

		sessionToken := uuid.New().String()
		expiresAt := time.Now().Add(24 * time.Hour)

		_, err = db.Exec("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
			sessionToken, user.ID, expiresAt)
		if err != nil {
			http.Error(w, "Erreur lors de la création de session", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    sessionToken,
			Expires:  expiresAt,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})

		json.NewEncoder(w).Encode(map[string]string{
			"message":  "Connexion réussie",
			"nickname": user.Nickname,
		})
	}
}

func LogoutHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err == nil {
			// Supprimer de la BDD
			db.Exec("DELETE FROM sessions WHERE id = ?", cookie.Value)
		}

		// Expire le cookie côté navigateur
		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    "",
			Path:     "/",
			Expires:  time.Now().Add(-1 * time.Hour),
			HttpOnly: true,
		})

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Déconnecté"})
	}
}

func MeHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err != nil {
			http.Error(w, "Non connecté", http.StatusUnauthorized)
			return
		}

		var nickname string
		query := `SELECT u.nickname FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.id = ?`

		err = db.QueryRow(query, cookie.Value).Scan(&nickname)
		if err != nil {
			http.Error(w, "Session invalide ou expirée", http.StatusUnauthorized)
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"nickname": nickname})
	}
}
