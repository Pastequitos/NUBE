package database

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
)

func InitDB() (*sql.DB, error) {
	// Connexion à la base de données
	db, err := sql.Open("sqlite3", "./forum.db")
	if err != nil {
		return nil, err
	}

	// 1. Activation des clés étrangères (INDISPENSABLE pour la cohérence)
	_, err = db.Exec("PRAGMA foreign_keys = ON;")
	if err != nil {
		return nil, err
	}

	// 2. Création des tables
	const schema = `
	-- Table des utilisateurs

	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		nickname TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		age INTEGER,
		gender TEXT,
		first_name TEXT,
		last_name TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Table des sessions (pour rester connecté 24h)

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		expires_at DATETIME NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	-- Table des Salons (Channels type #general, #gaming)

	CREATE TABLE IF NOT EXISTS channels (
		id TEXT PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		description TEXT
	);

	-- Table des Messages de Salons (Publics)

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		channel_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		content TEXT NOT NULL,
		image_url TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	-- Table des Messages Privés (MP entre deux utilisateurs)
	
	CREATE TABLE IF NOT EXISTS private_messages (
		id TEXT PRIMARY KEY,
		sender_id TEXT NOT NULL,
		receiver_id TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
	);
	`

	_, err = db.Exec(schema)
	if err != nil {
		return nil, err
	}

	return db, nil
}