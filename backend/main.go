package main

import (
	"fmt"
	"forum-certif/backend/database"
	"forum-certif/backend/handlers"
	"log"
	"net/http"
	"time"
)

// Middleware pour logger les requêtes dans le terminal
func logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		fmt.Printf("🕒 %s | %s | %s | %v\n",
			start.Format("15:04:05"), r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	// 1. Initialisation de la BDD
	db, err := database.InitDB()
	if err != nil {
		log.Fatalf("Erreur initialisation BDD: %v", err)
	}
	defer db.Close()

	fmt.Println("✅ Base de données prête (forum.db)")

	// Utilisation d'un ServeMux pour organiser les routes proprement
	mux := http.NewServeMux()

	hub := handlers.NewHub()
	go hub.Run()

	mux.HandleFunc("/ws", handlers.ServeWs(hub))

	// 2. GESTION DES FICHIERS STATIQUES
	fs := http.FileServer(http.Dir("./frontend"))
	mux.Handle("/static/", http.StripPrefix("/static/", fs))

	// 3. ROUTE PRINCIPALE (Serve le HTML)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			// Optionnel : rediriger vers / pour la SPA ou servir index.html
		}
		http.ServeFile(w, r, "./frontend/index.html")
	})

	// 4. ROUTES API
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Pong ! Le serveur Go fonctionne.")
	})

	// 5. ROUTES AUTH
	mux.HandleFunc("/api/register", handlers.RegisterHandler(db))
	mux.HandleFunc("/api/login", handlers.LoginHandler(db))
	mux.HandleFunc("/api/logout", handlers.LogoutHandler(db))
	mux.HandleFunc("/api/me", handlers.MeHandler(db))

	fmt.Println("🚀 Serveur lancé sur : http://localhost:8080")

	// On lance le serveur en enveloppant le tout avec le logger
	log.Fatal(http.ListenAndServe(":8080", logger(mux)))
}
