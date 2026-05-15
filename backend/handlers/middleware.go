
package handlers

import (
	"forum/backend/utils"
	"net/http"
	"strings"
	"sync"
	"time"
)

func SecurityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-XSS-Protection", "1; mode=block")

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
	strictVisitors = make(map[string]*visitor)
	strictMu       sync.Mutex

	globalVisitors = make(map[string]*visitor)
	globalMu       sync.Mutex
)

type visitor struct {
	lastSeen time.Time
	attempts int
}

func RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr

		strictMu.Lock()
		v, exists := strictVisitors[ip]
		if !exists {
			strictVisitors[ip] = &visitor{lastSeen: time.Now(), attempts: 1}
		} else {
			if time.Since(v.lastSeen) > 1*time.Minute {
				v.attempts = 0
			}
			v.attempts++
			v.lastSeen = time.Now()

			if v.attempts > 5 {
				strictMu.Unlock()
				utils.SendJSONError(w, `{"message": "Trop de tentatives de connexion. Veuillez patienter."}`, http.StatusTooManyRequests)
				return
			}
		}
		strictMu.Unlock()

		next.ServeHTTP(w, r)
	})
}

func GlobalRateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		ip := r.RemoteAddr

		globalMu.Lock()
		v, exists := globalVisitors[ip]
		if !exists {
			globalVisitors[ip] = &visitor{lastSeen: time.Now(), attempts: 1}
		} else {
			if time.Since(v.lastSeen) > 1*time.Minute {
				v.attempts = 0
			}
			v.attempts++
			v.lastSeen = time.Now()

			if v.attempts > 120 {
				globalMu.Unlock()
				utils.SendJSONError(w, `{"message": "Trop de requêtes globales. Calmez-vous."}`, http.StatusTooManyRequests)
				return
			}
		}
		globalMu.Unlock()

		next.ServeHTTP(w, r)
	})
}
