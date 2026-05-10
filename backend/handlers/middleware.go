// backend/handlers/middleware.go
package handlers

import (
	"net/http"
	"sync"
	"time"
)

// SecurityMiddleware ajoute des en-têtes de sécurité HTTP pour protéger l'application
func SecurityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// 🌟 LA NOUVELLE RÈGLE CSP MISE À JOUR :
		// - script-src : on ajoute https://unpkg.com pour Three.js
		// - style-src : on ajoute https://fonts.googleapis.com pour la CSS de la police
		// - font-src : on crée cette règle pour autoriser le téléchargement du fichier de police depuis Google
		csp := "default-src 'self'; " +
			"script-src 'self' 'unsafe-inline' https://unpkg.com; " +
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
			"font-src 'self' https://fonts.gstatic.com; " +
			"img-src 'self' data: https:; " +
			"connect-src 'self' ws: wss:;"

		w.Header().Set("Content-Security-Policy", csp)

		next.ServeHTTP(w, r)
	})
}

var (
	visitors = make(map[string]*visitor)
	mu       sync.Mutex
)

type visitor struct {
	lastSeen time.Time
	attempts int
}

// RateLimitMiddleware bloque les IP qui spamment une route spécifique (ex: /api/login)
func RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// On récupère l'adresse IP de l'utilisateur
		ip := r.RemoteAddr

		mu.Lock()
		v, exists := visitors[ip]
		if !exists {
			// C'est sa première visite, on l'enregistre
			visitors[ip] = &visitor{lastSeen: time.Now(), attempts: 1}
		} else {
			// Si sa dernière tentative date d'il y a plus d'une minute, on remet le compteur à zéro
			if time.Since(v.lastSeen) > 1*time.Minute {
				v.attempts = 0
			}
			v.attempts++
			v.lastSeen = time.Now()

			// 🌟 LA RÈGLE : Plus de 5 tentatives par minute = BLOQUÉ
			if v.attempts > 5 {
				mu.Unlock()
				http.Error(w, `{"message": "Trop de tentatives. Veuillez patienter une minute."}`, http.StatusTooManyRequests) // Erreur 429
				return
			}
		}
		mu.Unlock()

		// Si tout va bien, on passe au handler normal
		next.ServeHTTP(w, r)
	})
}
