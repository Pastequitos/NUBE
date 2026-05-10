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
		//fmt.Printf("🔔 %s %s\n", r.Method, r.URL.Path)
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
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "./frontend/index.html")
	})

	// Routes API Auth
	mux.Handle("/api/register", handlers.RateLimitMiddleware(handlers.RegisterHandler(db)))
	mux.Handle("/api/login", handlers.RateLimitMiddleware(handlers.LoginHandler(db)))
	mux.HandleFunc("/api/logout", handlers.LogoutHandler(db))
	mux.HandleFunc("/api/me", handlers.MeHandler(db))

	mux.HandleFunc("/api/messages", handlers.GetMessagesHandler(db))
	mux.HandleFunc("/api/messages/private", handlers.GetPrivateMessagesHandler(db))
	mux.HandleFunc("/api/servers", handlers.CreateServerHandler(db))
	mux.HandleFunc("/api/my-servers", handlers.GetServersHandler(db))
	mux.HandleFunc("/api/invites", handlers.CreateInviteHandler(db))
	mux.HandleFunc("/api/join", handlers.JoinServerHandler(db, hub))
	mux.HandleFunc("/join/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./frontend/index.html")
	})
	mux.HandleFunc("/api/server-members", handlers.GetServerMembersHandler(db, hub))
	mux.HandleFunc("/api/users/search", handlers.SearchUsersHandler(db))
	mux.HandleFunc("/api/friends/add", handlers.AddFriendHandler(db, hub))
	mux.HandleFunc("/api/friends/list", handlers.GetFriendsHandler(db, hub))
	mux.HandleFunc("/api/friends/accept", handlers.AcceptFriendHandler(db, hub))
	mux.HandleFunc("/api/friends/decline", handlers.DeclineFriendHandler(db, hub))

	mux.HandleFunc("/api/avatar", handlers.UpdateAvatarHandler(db))
	mux.HandleFunc("/api/settings", handlers.UpdateSettingsHandler(db))
	mux.HandleFunc("/api/user-profile", handlers.GetUserProfileHandler(db, hub))

	// Route WebSocket (On passe le hub et la db)
	mux.HandleFunc("/ws", handlers.ServeWs(hub, db))

	// 4. Gestion du PORT pour Koyeb
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Println("🚀 Serveur prêt sur http://localhost:" + port)

	// 🌟 LA MAGIE OPÈRE ICI :
	// On enveloppe TOUT le mux avec ton SecurityMiddleware,
	// puis on l'enveloppe avec ton logger !
	err = http.ListenAndServe(":"+port, logger(handlers.SecurityMiddleware(mux)))
	if err != nil {
		log.Fatal("Erreur Serveur:", err)
	}
}
