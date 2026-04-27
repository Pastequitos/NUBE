package handlers

import (
	"database/sql"
	"encoding/json"
	"forum-certif/backend/utils"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

// RegisterHandler gère l'inscription des nouveaux utilisateurs
func RegisterHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. On n'accepte que la méthode POST
		if r.Method != http.MethodPost {
			http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
			return
		}

		// 2. On décode le JSON reçu du frontend
		var user utils.User
		err := json.NewDecoder(r.Body).Decode(&user)
		if err != nil {
			http.Error(w, "Données invalides", http.StatusBadRequest)
			return
		}

		// 3. HACHAGE du mot de passe
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, "Erreur lors du hachage", http.StatusInternalServerError)
			return
		}

		// 4. INSERTION dans la base de données
		query := `INSERT INTO users (id, nickname, age, gender, first_name, last_name, email, password) 
				  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

		_, err = db.Exec(query, user.Nickname, user.Nickname, user.Age, user.Gender, user.FirstName, user.LastName, user.Email, string(hashedPassword))

		if err != nil {
			http.Error(w, "Utilisateur ou Email déjà existant", http.StatusConflict)
			return
		}

		// 5. Réponse de succès
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "Utilisateur créé avec succès !"})
	}
}
