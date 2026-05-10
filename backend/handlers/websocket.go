package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
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

	// 🌟 SÉCURITÉ 1 : On bloque les paquets de plus de 8 Ko (empêche le crash serveur)
	c.Conn.SetReadLimit(8192)

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		now := time.Now()

		// --- 🛡️ SÉCURITÉ ANTI-SPAM (Niveau 1) : Délai abaissé à 100ms ---
		if now.Sub(c.LastMessage) < 100*time.Millisecond {
			c.sendSystemNotif("Doucement ! Un message toutes les 100ms max.")
			continue
		}

		// --- 🛡️ SÉCURITÉ ANTI-SPAM (Niveau 2) : 10 messages max en 10 secondes ---
		c.MsgHistory = append(c.MsgHistory, now)
		if len(c.MsgHistory) > 10 {
			c.MsgHistory = c.MsgHistory[1:] // On ne garde en mémoire que les 10 derniers
		}

		if len(c.MsgHistory) == 10 {
			firstMsgTime := c.MsgHistory[0]
			if now.Sub(firstMsgTime) < 10*time.Second {
				c.sendSystemNotif("Calmos ! Pas plus de 10 messages en 10 secondes.")
				// On retire cette tentative de l'historique car elle a été rejetée
				c.MsgHistory = c.MsgHistory[:9]
				continue
			}
		}

		// Le message est valide, on met à jour le chrono !
		c.LastMessage = now

		// --- SUITE DU TRAITEMENT NORMAL ---
		var msg Message
		if err := json.Unmarshal(message, &msg); err == nil {

			// 🌟 SÉCURITÉ 3 : On nettoie et on valide le texte du message !
			msg.Content = strings.TrimSpace(msg.Content)
			if msg.Content == "" {
				continue // On ignore silencieusement les messages vides
			}
			if len(msg.Content) > 2000 { // Limite façon Discord
				msg.Content = msg.Content[:2000] // On coupe ce qui dépasse
			}

			msg.CreatedAt = time.Now().Format(time.RFC3339)
			msg.Sender = c.Nickname

			if msg.MessageType == "" {
				msg.MessageType = "user"
			}

			msgID := uuid.New().String()

			// 🌟 On récupère l'avatar une seule fois pour les deux cas
			var avatar sql.NullString
			_ = c.DB.QueryRow("SELECT avatar FROM users WHERE id = ?", c.UserID).Scan(&avatar)
			finalAvatar := ""
			if avatar.Valid {
				finalAvatar = avatar.String
			}

			// 🌟 LOGIQUE MESSAGE PRIVÉ
			if msg.Type == "private" {
				_, err = c.DB.Exec(`
                    INSERT INTO private_messages (id, sender_id, receiver_id, content) 
                    VALUES (?, ?, ?, ?)`,
					msgID, c.UserID, msg.ReceiverID, msg.Content)

				if err != nil {
					fmt.Println("❌ Erreur insertion BDD Privée :", err)
					continue
				}

				outgoingMsg := map[string]interface{}{
					"type":         "private",
					"sender_id":    c.UserID,
					"sender":       c.Nickname,
					"receiver_id":  msg.ReceiverID,
					"content":      msg.Content,
					"message_type": msg.MessageType,
					"created_at":   msg.CreatedAt,
					"avatar":       finalAvatar,
				}

				newJSON, _ := json.Marshal(outgoingMsg)
				// On n'envoie qu'à l'expéditeur et au destinataire !
				hub.SendToUsers(newJSON, c.UserID, msg.ReceiverID)

			} else {
				// 🌟 LOGIQUE MESSAGE PUBLIC
				_, err = c.DB.Exec(`
                    INSERT INTO messages (id, server_id, sender_id, content, message_type) 
                    VALUES (?, ?, ?, ?, ?)`,
					msgID, msg.ServerID, c.UserID, msg.Content, msg.MessageType)

				if err != nil {
					fmt.Println("❌ Erreur insertion BDD Publique :", err)
					continue
				}

				outgoingMsg := map[string]interface{}{
					"type":         "public",
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
}

// 💡 À ajouter n'importe où dans ton fichier websocket.go (hors de ReadPump)
// Cette petite fonction permet d'envoyer l'alerte rouge directement au spammeur
func (c *Client) sendSystemNotif(content string) {
	msg := map[string]interface{}{
		"type":         "system", // 🌟 Crucial pour que ton websocket.js l'accepte
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
