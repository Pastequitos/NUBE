package handlers

import (
	"encoding/json"
	"fmt"
	"sync"
)

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

			h.broadcastStatus(client.UserID, "online")

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				userID := client.UserID
				delete(h.Clients, client)
				close(client.Send)

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

func (h *Hub) broadcastStatus(userID string, status string) {
	msg, err := json.Marshal(map[string]string{
		"type":    "user_status",
		"user_id": userID,
		"status":  status,
	})

	if err != nil {
		return
	}

	for client := range h.Clients {
		select {
		case client.Send <- msg:
		default:
		}
	}
}

func (h *Hub) GetOnlineUserIDs() map[string]bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	onlineMap := make(map[string]bool)
	for client := range h.Clients {
		onlineMap[client.UserID] = true
	}
	return onlineMap
}

func (h *Hub) SendToUsers(message []byte, userIDs ...string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	fmt.Printf("📢 Tentative d'envoi WS à : %v\n", userIDs) 

	for client := range h.Clients {
		
		for _, id := range userIDs {
			if client.UserID == id {
				fmt.Printf("✅ Cible trouvée, envoi du message !\n")
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
		}
	}
}
