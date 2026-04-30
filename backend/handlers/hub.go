package handlers

import (
	"sync"
)

// Message définit la structure des messages circulant dans le Hub et l'API
type Message struct {
	Type        string `json:"type"`   // "public" ou "private"
	Sender      string `json:"sender"` // Nickname du posteur
	Content     string `json:"content"`
	ServerID    string `json:"server_id"`    // ID du serveur (anciennement channel_id)
	MessageType string `json:"message_type"` // "user" ou "system"
	CreatedAt   string `json:"created_at"`
}

type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	mu         sync.Mutex
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
