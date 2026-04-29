package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Client struct {
	UserID   string
	Nickname string
	Conn     *websocket.Conn
	Send     chan []byte
	DB       *sql.DB
}

type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	mu         sync.Mutex
}

type Message struct {
	Type      string `json:"type"`
	Sender    string `json:"sender"`
	Content   string `json:"content"`
	ChannelID string `json:"channel_id"`
	CreatedAt string `json:"created_at"`
}

func NewHub() *Hub {
	return &Hub{
		Clients:    make(map[*Client]bool),
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			h.mu.Unlock()
			fmt.Println("👤 Connecté au Hub:", client.Nickname)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
			}
			h.mu.Unlock()

		case message := <-h.Broadcast:
			h.mu.Lock()
			for client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// --- LE HANDLER PRINCIPAL ---

func ServeWs(hub *Hub, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Récupérer le cookie
		cookie, err := r.Cookie("session_token")
		if err != nil {
			return // Pas de cookie, pas de chat
		}

		var nickname, userID string
		err = db.QueryRow("SELECT u.nickname, u.id FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.id = ?", cookie.Value).Scan(&nickname, &userID)
		if err != nil {
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		// 3. Créer le client avec son VRAI pseudo
		client := &Client{
			UserID:   userID, // <-- NOUVEAU
			Nickname: nickname,
			Conn:     conn,
			Send:     make(chan []byte, 256),
			DB:       db,
		}
		hub.Register <- client

		go client.WritePump()
		go client.ReadPump(hub)
	}
}

func (c *Client) ReadPump(hub *Hub) {
	defer func() {
		hub.Unregister <- c
		c.Conn.Close()
	}()
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err == nil {
			msg.CreatedAt = time.Now().Format(time.RFC3339)

			msgID := fmt.Sprintf("msg_%d", time.Now().UnixNano())

			_, err = c.DB.Exec("INSERT INTO messages (id, server_id, sender_id, content) VALUES (?, ?, ?, ?)",
				msgID, msg.ChannelID, c.UserID, msg.Content)

			if err != nil {
				fmt.Println("❌ Erreur insertion BDD :", err)
			}
		}

		newJSON, _ := json.Marshal(msg)
		hub.Broadcast <- newJSON
	}
}

func (c *Client) WritePump() {
	defer c.Conn.Close()
	for {
		message, ok := <-c.Send
		if !ok {
			return
		}
		c.Conn.WriteMessage(websocket.TextMessage, message)
	}
}
func GetMessagesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		// LA NOUVELLE REQUÊTE SQL MAGIQUE
		query := `
            SELECT sub.nickname, sub.content, sub.server_id, sub.created_at 
            FROM (
                SELECT u.nickname, m.content, m.server_id, m.created_at 
                FROM messages m 
                JOIN users u ON m.sender_id = u.id 
                ORDER BY m.created_at DESC 
                LIMIT 50
            ) sub
            ORDER BY sub.created_at ASC
        `

		rows, err := db.Query(query)
		if err != nil {
			http.Error(w, "Erreur BDD", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var messages []Message
		for rows.Next() {
			var msg Message
			msg.Type = "public"
			if err := rows.Scan(&msg.Sender, &msg.Content, &msg.ChannelID, &msg.CreatedAt); err == nil {
				messages = append(messages, msg)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(messages)
	}
}
