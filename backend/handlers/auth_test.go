package handlers

import (
	"golang.org/x/crypto/bcrypt"
	"testing"
)

func TestIsPasswordStrong(t *testing.T) {
	tests := []struct {
		name     string
		password string
		expected bool
	}{
		{name: "Valid strong password", password: "SecurePass123!", expected: true},
		{name: "Too short password", password: "P1!", expected: false},
		{name: "Missing uppercase character", password: "securepass123!", expected: false},
		{name: "Missing digit character", password: "SecurePass!", expected: false},
		{name: "Missing special character", password: "SecurePass123", expected: false},
		{name: "Empty password", password: "", expected: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isPasswordStrong(tt.password)
			if result != tt.expected {
				t.Errorf("isPasswordStrong(%q) = %v; want %v", tt.password, result, tt.expected)
			}
		})
	}
}

// 2. Nouveau : Test du processus de hachage et de comparaison Bcrypt
func TestPasswordHashingAndVerification(t *testing.T) {
	password := "SecurePass123!"

	// A. Étape d'inscription : Test de la génération du Hash
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("Erreur critique lors de la génération du hash Bcrypt : %v", err)
	}

	if len(hashedPassword) == 0 {
		t.Error("Échec : Le hash généré est vide")
	}

	if string(hashedPassword) == password {
		t.Error("Échec critique de sécurité : Le mot de passe a été stocké en clair")
	}

	// B. Étape de login : Test de la comparaison (Cas passant)
	err = bcrypt.CompareHashAndPassword(hashedPassword, []byte(password))
	if err != nil {
		t.Errorf("Échec : Le système refuse le bon mot de passe lors de la comparaison : %v", err)
	}

	// C. Étape de login : Test de la comparaison (Cas non-passant / Mauvais mot de passe)
	wrongPassword := "MaliciousAttacker123"
	err = bcrypt.CompareHashAndPassword(hashedPassword, []byte(wrongPassword))
	if err == nil {
		t.Error("Échec critique de sécurité : La comparaison a validé un mauvais mot de passe")
	}
}
