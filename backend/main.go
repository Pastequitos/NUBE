package main

import (
	"context"
	"fmt"
	"forum/backend/database"
	"forum/backend/handlers"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
	})
}

func main() {
	db, err := database.InitDB()
	if err != nil {
		log.Fatal("Erreur DB:", err)
	}
	defer db.Close()

	database.StartGlobalCleaner(db)

	hub := handlers.NewHub()
	go hub.Run()

	mux := http.NewServeMux()

	mux.Handle("/frontend/", http.StripPrefix("/frontend/", http.FileServer(http.Dir("./frontend"))))

	fs := http.FileServer(http.Dir("./uploads"))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", fs))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, "./frontend/index.html")
	})

	mux.Handle("/api/register", handlers.RateLimitMiddleware(handlers.RegisterHandler(db)))
	mux.Handle("/api/login", handlers.RateLimitMiddleware(handlers.LoginHandler(db)))
	mux.HandleFunc("/api/logout", handlers.LogoutHandler(db))
	mux.HandleFunc("/api/me", handlers.MeHandler(db))
	mux.Handle("/api/users/last-server", handlers.UpdateLastServerHandler(db))
	mux.HandleFunc("/api/users/delete", handlers.DeleteUserHandler(db))

	mux.HandleFunc("/api/notifications/unread", handlers.GetUnreadCountsHandler(db))
	mux.HandleFunc("/api/users/mark-private-read", handlers.MarkPrivateReadHandler(db))

	mux.HandleFunc("/api/messages", handlers.GetMessagesHandler(db))
	mux.HandleFunc("/api/messages/private", handlers.GetPrivateMessagesHandler(db))
	mux.HandleFunc("/api/servers", handlers.CreateServerHandler(db))
	mux.HandleFunc("/api/servers/delete", handlers.DeleteServerHandler(db))
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
	mux.HandleFunc("/api/servers/update-overview", handlers.UpdateServerOverviewHandler(db))
	mux.HandleFunc("/api/servers/update-role", handlers.UpdateMemberRoleHandler(db))
	mux.HandleFunc("/api/servers/mute", handlers.MuteMemberHandler(db, hub))
	mux.HandleFunc("/api/servers/ban", handlers.BanMemberHandler(db))
	mux.HandleFunc("/api/servers/role", handlers.GetUserRoleHandler(db))

	mux.HandleFunc("/api/avatar", handlers.UpdateAvatarHandler(db))
	mux.HandleFunc("/api/settings", handlers.UpdateSettingsHandler(db))
	mux.HandleFunc("/api/user-profile", handlers.GetUserProfileHandler(db, hub))

	mux.HandleFunc("/ws", handlers.ServeWs(hub, db))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:    ":" + port,
		Handler: logger(handlers.SecurityMiddleware(handlers.GlobalRateLimitMiddleware(mux))),
	}

	go func() {
		fmt.Println("🚀 Serveur prêt sur http://localhost:" + port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Erreur Serveur: %v\n", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	<-stop

	fmt.Println("\n⚠️ Arrêt du serveur en cours...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("❌ Erreur lors de l'arrêt du serveur: %v\n", err)
	}

	fmt.Println("✅ Serveur arrêté proprement.")
}
