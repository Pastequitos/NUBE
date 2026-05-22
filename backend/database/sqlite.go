package database

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
)

func InitDB() (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "./forum.db")
	if err != nil {
		return nil, err
	}

	// Activation des clés étrangères pour SQLite
	_, err = db.Exec("PRAGMA foreign_keys = ON;")
	if err != nil {
		return nil, err
	}

	const schema = `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		nickname TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		age INTEGER,
		gender TEXT,
		first_name TEXT,
		last_name TEXT,
		avatar TEXT DEFAULT '',
		bio TEXT DEFAULT '',
		background TEXT DEFAULT '/frontend/assets/background/bg1.jpg',
		last_server_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		expires_at DATETIME NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS servers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		owner_id TEXT NOT NULL,
		color TEXT NOT NULL DEFAULT '#5865F2',
		avatar TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS server_members (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		role TEXT DEFAULT 'member',
		muted_until DATETIME,
		PRIMARY KEY (server_id, user_id),
		FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS server_bans (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		reason TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (server_id, user_id),
		FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		server_id TEXT NOT NULL,
		sender_id TEXT NOT NULL,
		content TEXT NOT NULL,
		message_type TEXT NOT NULL DEFAULT 'user',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS private_messages (
		id TEXT PRIMARY KEY,
		sender_id TEXT NOT NULL,
		receiver_id TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS private_read_receipts (
		user_id TEXT NOT NULL,
		peer_id TEXT NOT NULL,
		last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, peer_id),
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(peer_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS invites (
		token TEXT PRIMARY KEY,
		server_id TEXT NOT NULL,
		creator_id TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		expires_at DATETIME,
		FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY(creator_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS friends (
		user_id1 TEXT NOT NULL,
		user_id2 TEXT NOT NULL,
		status TEXT DEFAULT 'pending',
		action_user_id TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id1, user_id2),
		FOREIGN KEY (user_id1) REFERENCES users(id),
		FOREIGN KEY (user_id2) REFERENCES users(id)
	);
	`

	_, err = db.Exec(schema)
	if err != nil {
		return nil, err
	}

	// 🛠️ Insertion des données système (System / Salon Général)
	_, _ = db.Exec(`INSERT OR IGNORE INTO users (id, nickname, email, password) VALUES ('0', 'System', 'system@forum.com', 'none');`)
	_, _ = db.Exec(`INSERT OR IGNORE INTO servers (id, name, owner_id, color) VALUES ('1', 'Salon Général', '0', '#5865F2');`)
	_, _ = db.Exec(`INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES ('1', '0');`)

	return db, nil
}
