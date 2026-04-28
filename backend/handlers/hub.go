package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Client struct {
	Nickname string
	Conn     *websocket.Conn
	Send     chan []byte
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

		// 2. Chercher le pseudo en BDD
		var nickname string
		err = db.QueryRow("SELECT u.nickname FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.id = ?", cookie.Value).Scan(&nickname)
		if err != nil {
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		// 3. Créer le client avec son VRAI pseudo
		client := &Client{
			Nickname: nickname,
			Conn:     conn,
			Send:     make(chan []byte, 256),
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
			fmt.Printf("❌ Erreur lecture de %s: %v\n", c.Nickname, err)
			break
		}

/* 		fmt.Printf("\n📩 Message reçu de [%s] :\n", c.Nickname)
		fmt.Printf("   Contenu brut: %s\n", string(message)) */

		hub.Broadcast <- message
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
