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
	"github.com/microcosm-cc/bluemonday"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// 🌟 On prépare la politique de nettoyage une seule fois pour tout le fichier
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

		// --- 🛡️ SÉCURITÉ ANTI-SPAM (Niveau 1) : 100ms ---
		if now.Sub(c.LastMessage) < 100*time.Millisecond {
			c.sendSystemNotif("Doucement ! Un message toutes les 100ms max.")
			continue
		}

		// --- 🛡️ SÉCURITÉ ANTI-SPAM (Niveau 2) : 10/10s ---
		c.MsgHistory = append(c.MsgHistory, now)
		if len(c.MsgHistory) > 10 {
			c.MsgHistory = c.MsgHistory[1:]
		}

		if len(c.MsgHistory) == 10 {
			firstMsgTime := c.MsgHistory[0]
			if now.Sub(firstMsgTime) < 10*time.Second {
				c.sendSystemNotif("Calmos ! Pas plus de 10 messages en 10 secondes.")
				c.MsgHistory = c.MsgHistory[:9]
				continue
			}
		}

		c.LastMessage = now

		var msg Message
		if err := json.Unmarshal(message, &msg); err == nil {

			// 🌟 SÉCURITÉ 3 : Nettoyage strict (Sanitization)
			// 1. On enlève les espaces inutiles
			// 2. On passe le nettoyeur Bluemonday pour supprimer tout HTML/Script
			cleanContent := ugcPolicy.Sanitize(strings.TrimSpace(msg.Content))

			if cleanContent == "" {
				continue
			}

			// On limite la taille après nettoyage
			if len(cleanContent) > 2000 {
				cleanContent = cleanContent[:2000]
			}

			msg.Content = cleanContent
			msg.CreatedAt = time.Now().Format(time.RFC3339)
			msg.Sender = c.Nickname

			if msg.MessageType == "" {
				msg.MessageType = "user"
			}

			msgID := uuid.New().String()

			var avatar sql.NullString
			_ = c.DB.QueryRow("SELECT avatar FROM users WHERE id = ?", c.UserID).Scan(&avatar)
			finalAvatar := ""
			if avatar.Valid {
				finalAvatar = avatar.String
			}

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
				hub.SendToUsers(newJSON, c.UserID, msg.ReceiverID)

			} else { // 🌟 C'est un message de Serveur

				var mutedStr sql.NullString

				err := c.DB.QueryRow(`
				SELECT muted_until 
				FROM server_members 
				WHERE server_id = ? AND user_id = ?`,
					msg.ServerID, c.UserID).Scan(&mutedStr)

				if err != nil {
					c.sendSystemNotif("Vous n'êtes pas membre de ce serveur.")
					continue
				}

				// 🌟 AJOUT DE LOGS DE DÉBOGAGE ICI :
				fmt.Println("--- DEBUG MUTE ---")
				fmt.Println("Utilisateur :", c.Nickname)
				fmt.Println("A une date de mute en BDD ?", mutedStr.Valid)

				if mutedStr.Valid {
					fmt.Println("Date brute dans la BDD :", mutedStr.String)

					// 🌟 CORRECTION ICI : On utilise time.RFC3339 (le format avec le T et le Z)
					mutedTime, parseErr := time.Parse(time.RFC3339, mutedStr.String)

					// Petite sécurité : si ça rate, on essaie quand même l'ancien format au cas où
					if parseErr != nil {
						mutedTime, parseErr = time.ParseInLocation("2006-01-02 15:04:05", mutedStr.String, time.Local)
					}

					if parseErr != nil {
						fmt.Println("❌ ERREUR DÉFINITIVE DE FORMAT :", parseErr)
					} else {
						fmt.Println("Heure actuelle :", time.Now().Format("2006-01-02 15:04:05"))
						fmt.Println("Fin du Mute    :", mutedTime.Format("2006-01-02 15:04:05"))

						if time.Now().Before(mutedTime) {
							fmt.Println("✅ L'UTILISATEUR EST BIEN BLOQUÉ !")
							formattedDate := mutedTime.Format("02/01/2006 à 15h04")
							c.sendSystemNotif("🔇 Vous êtes réduit au silence sur ce serveur jusqu'au " + formattedDate + ".")
							continue // 🚫 On bloque le message ici !
						} else {
							fmt.Println("🔓 LE MUTE EST DÉJÀ EXPIRÉ (Heure actuelle > Fin du mute)")
						}
					}
				}

				// 👇 Si le code arrive ici, c'est que l'utilisateur a le droit de parler 👇
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
