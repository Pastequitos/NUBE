package handlers

import (
    "database/sql"
    "encoding/json"
    "net/http"
    "github.com/google/uuid"
)

// --- CRÉATION D'UN SALON ---
func CreateServerHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
            http.Error(w, "Méthode non autorisée", http.StatusMethodNotAllowed)
            return
        }

        cookie, err := r.Cookie("session_token")
        if err != nil {
            http.Error(w, "Non autorisé", http.StatusUnauthorized)
            return
        }

        var userID string
        err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&userID)
        if err != nil {
            http.Error(w, "Session invalide", http.StatusUnauthorized)
            return
        }

        var req struct {
            Name  string `json:"name"`
            Color string `json:"color"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
            http.Error(w, "Requête invalide", http.StatusBadRequest)
            return
        }

        if req.Color == "" {
            req.Color = "#5865F2" // Bleu par défaut au cas où
        }

        serverID := uuid.New().String()

        _, err = db.Exec("INSERT INTO servers (id, name, owner_id, color) VALUES (?, ?, ?, ?)", serverID, req.Name, userID, req.Color)
        if err != nil {
            http.Error(w, "Erreur création salon", http.StatusInternalServerError)
            return
        }

        _, err = db.Exec("INSERT INTO server_members (server_id, user_id) VALUES (?, ?)", serverID, userID)
        if err != nil {
            http.Error(w, "Erreur ajout membre", http.StatusInternalServerError)
            return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]string{
            "id":   serverID,
            "name": req.Name,
        })
    }
}

// --- LECTURE DES SALONS ---
type ServerResponse struct {
    ID          string `json:"id"`
    Name        string `json:"name"`
    Color       string `json:"color"`
    MemberCount int    `json:"member_count"`
}

func GetServersHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        cookie, err := r.Cookie("session_token")
        if err != nil {
            http.Error(w, "Non autorisé", http.StatusUnauthorized)
            return
        }

        var userID string
        err = db.QueryRow("SELECT user_id FROM sessions WHERE id = ?", cookie.Value).Scan(&userID)
        if err != nil {
            http.Error(w, "Session invalide", http.StatusUnauthorized)
            return
        }

        query := `
            SELECT s.id, s.name, s.color, 
                   (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
            FROM servers s 
            JOIN server_members sm ON s.id = sm.server_id 
            WHERE sm.user_id = ?
        `
        rows, err := db.Query(query, userID)
        if err != nil {
            http.Error(w, "Erreur BDD", http.StatusInternalServerError)
            return
        }
        defer rows.Close()

        var servers []ServerResponse
        for rows.Next() {
            var srv ServerResponse
            if err := rows.Scan(&srv.ID, &srv.Name, &srv.Color, &srv.MemberCount); err == nil {
                servers = append(servers, srv)
            }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(servers)
    }
}