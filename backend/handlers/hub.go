package handlers

import (
	"encoding/json"
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

			// 📢 Notifier tout le monde que cet utilisateur est en ligne
			h.broadcastStatus(client.UserID, "online")

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				userID := client.UserID // On garde l'ID avant de supprimer
				delete(h.Clients, client)
				close(client.Send)

				// 📢 Notifier tout le monde que cet utilisateur est hors-ligne
				h.broadcastStatus(userID, "offline")
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

// broadcastStatus prévient tous les clients connectés d'un changement de statut
func (h *Hub) broadcastStatus(userID string, status string) {
	msg, err := json.Marshal(map[string]string{
		"type":    "user_status",
		"user_id": userID,
		"status":  status,
	})

	if err != nil {
		return
	}

	// On ne verrouille pas ici car broadcastStatus est appelé
	// depuis Run qui gère déjà ses propres flux de données sécurisés
	for client := range h.Clients {
		select {
		case client.Send <- msg:
		default:
			// Si le canal est bloqué, on laisse tomber pour ce client
		}
	}
}

// GetOnlineUserIDs retourne une map des IDs actuellement connectés
func (h *Hub) GetOnlineUserIDs() map[string]bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	onlineMap := make(map[string]bool)
	for client := range h.Clients {
		onlineMap[client.UserID] = true
	}
	return onlineMap
}
