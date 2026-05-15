package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"forum/backend/utils"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/microcosm-cc/bluemonday"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

var ugcPolicy = bluemonday.StrictPolicy()

type Client struct {
	UserID      string
	Nickname    string
	Conn        *websocket.Conn
	Send        chan []byte
	DB          *sql.DB
	LastMessage time.Time
	MsgHistory  []time.Time
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

	c.Conn.SetReadLimit(8192)

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		now := time.Now()

		if now.Sub(c.LastMessage) < 100*time.Millisecond {
			c.sendSystemNotif("Doucement ! Un message toutes les 100ms max.")
			continue
		}

		c.MsgHistory = append(c.MsgHistory, now)
		if len(c.MsgHistory) > 10 {
			c.MsgHistory = c.MsgHistory[1:]
		}

		if len(c.MsgHistory) == 10 {
			if now.Sub(c.MsgHistory[0]) < 10*time.Second {
				c.sendSystemNotif("Calmos ! Pas plus de 10 messages en 10 secondes.")
				c.MsgHistory = c.MsgHistory[:9]
				continue
			}
		}
		c.LastMessage = now

		var msg utils.Message
		if err := json.Unmarshal(message, &msg); err == nil {

			cleanContent := ugcPolicy.Sanitize(strings.TrimSpace(msg.Content))
			if cleanContent == "" {
				continue
			}
			if len(cleanContent) > 2000 {
				cleanContent = cleanContent[:2000]
			}

			msg.Content = cleanContent
			msg.CreatedAt = time.Now().Format(time.RFC3339)
			msg.Sender = c.Nickname
			msg.SenderID = c.UserID

			if msg.MessageType == "" {
				msg.MessageType = "user"
			}

			var avatar sql.NullString
			_ = c.DB.QueryRow("SELECT avatar FROM users WHERE id = ?", c.UserID).Scan(&avatar)
			if avatar.Valid {
				msg.Avatar = avatar.String
			}

			msgID := uuid.New().String()

			if msg.Type == "private" {
				_, err = c.DB.Exec(`
                    INSERT INTO private_messages (id, sender_id, receiver_id, content) 
                    VALUES (?, ?, ?, ?)`,
					msgID, c.UserID, msg.ReceiverID, msg.Content)

				if err != nil {
					continue
				}

				newJSON, _ := json.Marshal(msg)
				hub.SendToUsers(newJSON, c.UserID, msg.ReceiverID)

			} else {
				var mutedStr sql.NullString
				err := c.DB.QueryRow(`
                    SELECT muted_until FROM server_members 
                    WHERE server_id = ? AND user_id = ?`,
					msg.ServerID, c.UserID).Scan(&mutedStr)

				if err != nil {
					c.sendSystemNotif("Vous n'êtes pas membre de ce serveur.")
					continue
				}

				if mutedStr.Valid {
					mutedTime, parseErr := time.Parse(time.RFC3339, mutedStr.String)
					if parseErr != nil {
						mutedTime, _ = time.ParseInLocation("2006-01-02 15:04:05", mutedStr.String, time.Local)
					}

					if time.Now().Before(mutedTime) {
						formattedDate := mutedTime.Format("02/01/2006 à 15h04")
						c.sendSystemNotif("🔇 Vous êtes réduit au silence jusqu'au " + formattedDate + ".")
						continue
					}
				}

				_, err = c.DB.Exec(`
                    INSERT INTO messages (id, server_id, sender_id, content, message_type) 
                    VALUES (?, ?, ?, ?, ?)`,
					msgID, msg.ServerID, c.UserID, msg.Content, msg.MessageType)

				if err != nil {
					continue
				}

				newJSON, _ := json.Marshal(msg)
				hub.Broadcast <- newJSON
			}
		}
	}
}

func (c *Client) sendSystemNotif(content string) {
	msg := map[string]interface{}{
		"type":         "system",
		"message_type": "system",
		"content":      content,
		"created_at":   time.Now().Format(time.RFC3339),
	}
	jsonMsg, _ := json.Marshal(msg)
	c.Send <- jsonMsg
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
