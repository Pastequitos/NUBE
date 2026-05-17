package handlers

import (
	"log"
	"database/sql"
	"encoding/json"
	"forum/backend/utils"
	"net/http"
	"time"
	"unicode"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func RegisterHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		var user utils.User
		if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"message": "Données invalides"})
			return
		}

		if !isPasswordStrong(user.Password) {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"message": "Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial.",
			})
			return
		}

		var dummy string
		err := db.QueryRow("SELECT id FROM users WHERE email = ?", user.Email).Scan(&dummy)
		if err == nil {
			
			w.WriteHeader(http.StatusConflict) 
			json.NewEncoder(w).Encode(map[string]string{"message": "Cet email est déjà utilisé."})
			return
		} else if err != sql.ErrNoRows {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"message": "Erreur serveur (email)"})
			return
		}

		err = db.QueryRow("SELECT id FROM users WHERE nickname = ?", user.Nickname).Scan(&dummy)
		if err == nil {
			
			w.WriteHeader(http.StatusConflict) 
			json.NewEncoder(w).Encode(map[string]string{"message": "Ce pseudo est déjà pris. Veuillez en choisir un autre."})
			return
		} else if err != sql.ErrNoRows {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"message": "Erreur serveur (pseudo)"})
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"message": "Erreur hachage"})
			return
		}

		newID := uuid.New().String()
		query := `INSERT INTO users (id, nickname, age, gender, first_name, last_name, email, password) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

		_, err = db.Exec(query, newID, user.Nickname, user.Age, user.Gender, user.FirstName, user.LastName, user.Email, string(hashedPassword))
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"message": "Erreur lors de la création du compte"})
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "Utilisateur créé avec succès !"})
	}
}

func LoginHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			utils.SendJSONError(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
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
			w.WriteHeader(http.StatusUnauthorized) 
			json.NewEncoder(w).Encode(map[string]string{"message": "Email/Pseudo ou mot de passe incorrect"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(creds.Password)); err != nil {
			w.WriteHeader(http.StatusUnauthorized) 
			json.NewEncoder(w).Encode(map[string]string{"message": "Email/Pseudo ou mot de passe incorrect"})
			return
		}

		sessionToken := uuid.New().String()
		expiresAt := time.Now().Add(24 * time.Hour)

		_, err = db.Exec("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
			sessionToken, user.ID, expiresAt)
		if err != nil {
			log.Printf("❌ Erreur dans LoginHandler : %v", err)
			utils.SendJSONError(w, "Une erreur interne est survenue. Veuillez réessayer plus tard.", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    sessionToken,
			Expires:  expiresAt,
			Path:     "/",
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})

		json.NewEncoder(w).Encode(map[string]string{
			"message":  "Connexion réussie",
			"nickname": user.Nickname,
			"id":       user.ID,
		})
	}
}

func LogoutHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err == nil {
			db.Exec("DELETE FROM sessions WHERE id = ?", cookie.Value)
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    "",
			Path:     "/",
			Expires:  time.Now().Add(-1 * time.Hour),
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteStrictMode,
		})

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Déconnecté"})
	}
}

func MeHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		myID, err := utils.GetUserIDFromSession(r, db)
		if err != nil {
			utils.SendJSONError(w, "Non connecté ou session expirée", http.StatusUnauthorized)
			return
		}

		var nickname, avatar, background string
		var lastServerID sql.NullString

		query := `SELECT nickname, avatar, last_server_id, background FROM users WHERE id = ?`
		err = db.QueryRow(query, myID).Scan(&nickname, &avatar, &lastServerID, &background)

		if err != nil {
			utils.SendJSONError(w, "Utilisateur introuvable", http.StatusUnauthorized)
			return
		}

		if background == "" {
			background = "/frontend/assets/background/bg1.jpg"
		}

		w.Header().Set("Content-Type", "application/json")

		response := map[string]interface{}{
			"id":             myID,
			"nickname":       nickname,
			"avatar":         avatar,
			"last_server_id": nil,
			"background":     background,
		}

		if lastServerID.Valid {
			response["last_server_id"] = lastServerID.String
		}

		json.NewEncoder(w).Encode(response)
	}
}

func isPasswordStrong(pwd string) bool {
	if len(pwd) < 8 {
		return false
	}
	hasUpper := false
	hasNumber := false
	hasSpecial := false
	for _, char := range pwd {
		if unicode.IsUpper(char) {
			hasUpper = true
		}
		if unicode.IsNumber(char) {
			hasNumber = true
		}
		if !unicode.IsLetter(char) && !unicode.IsDigit(char) {
			hasSpecial = true
		}
	}
	return hasUpper && hasNumber && hasSpecial
}
