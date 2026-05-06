package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
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

func ServeWs(hub *Hub, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err != nil {
			return
		}

		var nickname, userID string
		err = db.QueryRow(`
			SELECT u.nickname, u.id 
			FROM users u 
			JOIN sessions s ON u.id = s.user_id 
			WHERE s.id = ?`, cookie.Value).Scan(&nickname, &userID)
		if err != nil {
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		client := &Client{
			UserID:   userID,
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
            msg.Sender = c.Nickname

            if msg.MessageType == "" {
                msg.MessageType = "user"
            }

            msgID := uuid.New().String()

            _, err = c.DB.Exec(`
                INSERT INTO messages (id, server_id, sender_id, content, message_type) 
                VALUES (?, ?, ?, ?, ?)`,
                msgID, msg.ServerID, c.UserID, msg.Content, msg.MessageType)

            if err != nil {
                fmt.Println("❌ Erreur insertion BDD :", err)
                continue
            }

            var avatar sql.NullString
            errAvatar := c.DB.QueryRow("SELECT avatar FROM users WHERE id = ?", c.UserID).Scan(&avatar)
            
            finalAvatar := ""
            if errAvatar == nil && avatar.Valid {
                finalAvatar = avatar.String
            }

            outgoingMsg := map[string]interface{}{
                "type":         msg.Type,
                "server_id":    msg.ServerID,
                "sender_id":    c.UserID, 
                "sender":       c.Nickname,
                "content":      msg.Content,
                "message_type": msg.MessageType,
                "created_at":   msg.CreatedAt,
                "avatar":       finalAvatar, 
            }

            newJSON, _ := json.Marshal(outgoingMsg)
            hub.Broadcast <- newJSON
        }
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
