package utils

import "time"

type User struct {
	ID           string    `json:"id"`
	Nickname     string    `json:"nickname"`
	Email        string    `json:"email"`
	Password     string    `json:"password"`
	Age          int       `json:"age"`
	Gender       string    `json:"gender"`
	FirstName    string    `json:"firstName"`
	LastName     string    `json:"lastName"`
	Avatar       string    `json:"avatar"`
	Bio          string    `json:"bio"`
	LastServerID string    `json:"last_server_id"`
	CreatedAt    time.Time `json:"created_at"`
}

type Session struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type Message struct {
	Type        string `json:"type"`
	Sender      string `json:"sender"`
	SenderID    string `json:"sender_id"`
	Avatar      string `json:"avatar"`
	Content     string `json:"content"`
	ServerID    string `json:"server_id"`
	ReceiverID  string `json:"receiver_id"`
	MessageType string `json:"message_type"`
	CreatedAt   string `json:"created_at"`
}

type ServerRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type ServerResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Avatar      string `json:"avatar"`
	Color       string `json:"color"`
	MemberCount int    `json:"member_count"`
}

type UpdateServerRequest struct {
	ServerID string `json:"server_id"`
	Name     string `json:"name"`
	Avatar   string `json:"avatar"`
}

type InviteRequest struct {
	ServerID string `json:"server_id"`
}

type JoinRequest struct {
	Token string `json:"token"`
}

type FriendRequest struct {
	TargetID string `json:"target_id"`
}

type MuteRequest struct {
	ServerID string `json:"server_id"`
	TargetID string `json:"target_id"`
	Duration string `json:"duration"` 
}

type BanRequest struct {
	ServerID string `json:"server_id"`
	TargetID string `json:"target_id"`
}

type AvatarRequest struct {
	Avatar string `json:"avatar"` 
}

type SettingsRequest struct {
	Bio string `json:"bio"`
}
