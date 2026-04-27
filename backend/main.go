package main

import (
	"fmt"
	"forum-certif/backend/database"
	"forum-certif/backend/handlers"
	"log"
	"net/http"
)

func main() {
	// 1. Initialisation de la BDD
	db, err := database.InitDB()
	if err != nil {
		log.Fatalf("Erreur initialisation BDD: %v", err)
	}
	defer db.Close()

	fmt.Println("✅ Base de données prête (forum.db)")

	// 2. GESTION DES FICHIERS STATIQUES (CSS, JS, Images)
	fs := http.FileServer(http.Dir("./frontend"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// 3. ROUTE PRINCIPALE (Sert le fichier index.html)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// On s'assure que si l'utilisateur demande une page qui n'existe pas, 
		// on lui renvoie quand même index.html (principe de la SPA)
		if r.URL.Path != "/" {
			// Optionnel : tu peux gérer ici tes erreurs 404 ou rediriger vers /
		}
		http.ServeFile(w, r, "./frontend/index.html")
	})

	// 4. ROUTES API (JSON)
	http.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Pong ! Le serveur Go fonctionne.")
	})

	http.HandleFunc("/api/register", handlers.RegisterHandler(db))

	fmt.Println("🚀 Serveur lancé sur : http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}