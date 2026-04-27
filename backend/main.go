package main

import (
	"fmt"
	"forum-certif/backend/database"
	"log"
	"net/http"
)

func main() {
	// Initialisation de la BDD
	db, err := database.InitDB()
	if err != nil {
		log.Fatalf("Erreur initialisation BDD: %v", err)
	}
	defer db.Close()

	fmt.Println("✅ Base de données prête (forum.db)")

	// Route de test
	http.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Pong ! Le serveur Go fonctionne.")
	})

	fmt.Println("http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
