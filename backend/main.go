package main

import (
	"fmt"
	"forum-certif/backend/database"
	"forum-certif/backend/handlers"
	"log"
	"net/http"
	"os" // Pour récupérer le port de Koyeb

	_ "github.com/mattn/go-sqlite3"
)

// Middleware simple pour logger les requêtes dans le terminal
func logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("🔔 %s %s\n", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func main() {
	// 1. Initialisation de la base de données
	db, err := database.InitDB()
	if err != nil {
		log.Fatal("Erreur DB:", err)
	}
	defer db.Close()

	// 2. Initialisation du Hub WebSocket
	hub := handlers.NewHub()
	go hub.Run()

	// 3. Création du multiplexeur (Routeur)
	mux := http.NewServeMux()

	// Routes Statiques (Frontend)
	mux.Handle("/frontend/", http.StripPrefix("/frontend/", http.FileServer(http.Dir("./frontend"))))
	
	// Route par défaut (Sert l'index.html)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./frontend/index.html")
	})

	// Routes API Auth
	mux.HandleFunc("/api/register", handlers.RegisterHandler(db))
	mux.HandleFunc("/api/login", handlers.LoginHandler(db))
	mux.HandleFunc("/api/logout", handlers.LogoutHandler(db))
	mux.HandleFunc("/api/me", handlers.MeHandler(db))

	// Route WebSocket (On passe le hub et la db)
	mux.HandleFunc("/ws", handlers.ServeWs(hub, db))

	// 4. Gestion du PORT pour Koyeb
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Println("🚀 Serveur prêt sur http://localhost:" + port)
	
	// Lancement du serveur avec le logger
	err = http.ListenAndServe(":" + port, logger(mux))
	if err != nil {
		log.Fatal("Erreur Serveur:", err)
	}
}