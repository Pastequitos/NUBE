package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
)

var IsPostgres = false

const SupabaseURI = "postgres://postgres:AQ6Ms4KgCRexoepc@db.wwxzzmazmwavsgatwiav.supabase.co:6543/postgres?sslmode=require&binary_parameters=yes"

func init() {
	sql.Register("nube-postgres", &postgresWrapperDriver{})
}

type postgresWrapperDriver struct{}

func (d *postgresWrapperDriver) Open(name string) (driver.Conn, error) {
	pDriver := &pq.Driver{}
	conn, err := pDriver.Open(name)
	if err != nil {
		return nil, err
	}
	return &postgresWrapperConn{conn}, nil
}

type postgresWrapperConn struct {
	driver.Conn
}

func TranslateQuery(query string) string {
	if !IsPostgres {
		return query
	}

	if strings.Contains(query, "$1") {
		return query
	}

	n := 1
	var result strings.Builder
	for i := 0; i < len(query); i++ {
		if query[i] == '?' {
			result.WriteString(fmt.Sprintf("$%d", n))
			n++
		} else {
			result.WriteByte(query[i])
		}
	}
	query = result.String()

	if strings.Contains(query, "INSERT OR IGNORE INTO server_bans") {
		query = strings.Replace(query, "INSERT OR IGNORE INTO server_bans", "INSERT INTO server_bans", 1)
		query += " ON CONFLICT (server_id, user_id) DO NOTHING"
	} else if strings.Contains(query, "INSERT OR IGNORE INTO friends") {
		query = strings.Replace(query, "INSERT OR IGNORE INTO friends", "INSERT INTO friends", 1)
		query += " ON CONFLICT (user_id1, user_id2) DO NOTHING"
	}

	return query
}

func (c *postgresWrapperConn) Prepare(query string) (driver.Stmt, error) {
	return c.Conn.Prepare(TranslateQuery(query))
}

func (c *postgresWrapperConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	translated := TranslateQuery(query)
	if prepCtx, ok := c.Conn.(driver.ConnPrepareContext); ok {
		return prepCtx.PrepareContext(ctx, translated)
	}
	return c.Conn.Prepare(translated)
}

func (c *postgresWrapperConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	translated := TranslateQuery(query)
	if execCtx, ok := c.Conn.(driver.ExecerContext); ok {
		return execCtx.ExecContext(ctx, translated, args)
	}
	return nil, driver.ErrSkip
}

func (c *postgresWrapperConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	translated := TranslateQuery(query)
	if queryCtx, ok := c.Conn.(driver.QueryerContext); ok {
		return queryCtx.QueryContext(ctx, translated, args)
	}
	return nil, driver.ErrSkip
}

func (c *postgresWrapperConn) Exec(query string, args []driver.Value) (driver.Result, error) {
	translated := TranslateQuery(query)
	if execer, ok := c.Conn.(driver.Execer); ok {
		return execer.Exec(translated, args)
	}
	return nil, driver.ErrSkip
}

func (c *postgresWrapperConn) Query(query string, args []driver.Value) (driver.Rows, error) {
	translated := TranslateQuery(query)
	if queryer, ok := c.Conn.(driver.Queryer); ok {
		return queryer.Query(translated, args)
	}
	return nil, driver.ErrSkip
}

func InitDB() (*sql.DB, error) {
	connectionURI := os.Getenv("DATABASE_URL")
	if connectionURI == "" {
		connectionURI = SupabaseURI
	}

	if strings.TrimSpace(connectionURI) == "" || strings.Contains(connectionURI, "[YOUR_PASSWORD]") {
		log.Println("ℹ️ [Database] Aucune URI valide pour Supabase trouvée. Rabattement sur SQLite3 local (forum.db)...")
		return initSqliteDB()
	}

	log.Println("🔌 [Database] Connexion à Supabase (PostgreSQL) en cours...")
	return initPostgresDB(connectionURI)
}

func initSqliteDB() (*sql.DB, error) {
	IsPostgres = false
	db, err := sql.Open("sqlite3", "./forum.db")
	if err != nil {
		return nil, err
	}

	_, err = db.Exec("PRAGMA foreign_keys = ON;")
	if err != nil {
		db.Close()
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
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		expires_at TIMESTAMP NOT NULL,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS servers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		owner_id TEXT NOT NULL,
		color TEXT NOT NULL DEFAULT '#5865F2',
		avatar TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS server_members (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		role TEXT DEFAULT 'member',
		muted_until TIMESTAMP,
		PRIMARY KEY (server_id, user_id),
		FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS server_bans (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		reason TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS private_messages (
		id TEXT PRIMARY KEY,
		sender_id TEXT NOT NULL,
		receiver_id TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS private_read_receipts (
		user_id TEXT NOT NULL,
		peer_id TEXT NOT NULL,
		last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, peer_id),
		FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY(peer_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS invites (
		token TEXT PRIMARY KEY,
		server_id TEXT NOT NULL,
		creator_id TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		expires_at TIMESTAMP,
		FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY(creator_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS friends (
		user_id1 TEXT NOT NULL,
		user_id2 TEXT NOT NULL,
		status TEXT DEFAULT 'pending',
		action_user_id TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id1, user_id2),
		FOREIGN KEY (user_id1) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id2) REFERENCES users(id) ON DELETE CASCADE
	);
	`

	_, err = db.Exec(schema)
	if err != nil {
		db.Close()
		return nil, err
	}

	_, _ = db.Exec(`INSERT OR IGNORE INTO users (id, nickname, email, password) VALUES ('0', 'System', 'system@forum.com', 'none');`)
	_, _ = db.Exec(`INSERT OR IGNORE INTO servers (id, name, owner_id, color) VALUES ('1', 'Salon Général', '0', '#5865F2');`)
	_, _ = db.Exec(`INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES ('1', '0');`)

	return db, nil
}

func initPostgresDB(connectionURI string) (*sql.DB, error) {
	IsPostgres = true
	db, err := sql.Open("nube-postgres", connectionURI)
	if err != nil {
		return nil, err
	}

	if err = db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("impossible de ping Supabase : %v", err)
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
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at TIMESTAMP NOT NULL
	);

	CREATE TABLE IF NOT EXISTS servers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		color TEXT NOT NULL DEFAULT '#5865F2',
		avatar TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS server_members (
		server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		role TEXT DEFAULT 'member',
		muted_until TIMESTAMP,
		PRIMARY KEY (server_id, user_id)
	);

	CREATE TABLE IF NOT EXISTS server_bans (
		server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		reason TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (server_id, user_id)
	);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
		sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		content TEXT NOT NULL,
		message_type TEXT NOT NULL DEFAULT 'user',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS private_messages (
		id TEXT PRIMARY KEY,
		sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		content TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS private_read_receipts (
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		peer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, peer_id)
	);

	CREATE TABLE IF NOT EXISTS invites (
		token TEXT PRIMARY KEY,
		server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
		creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		expires_at TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS friends (
		user_id1 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		user_id2 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		status TEXT DEFAULT 'pending',
		action_user_id TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id1, user_id2)
	);
	`

	_, err = db.Exec(schema)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("impossible de créer le schéma PostgreSQL : %v", err)
	}

	_, _ = db.Exec(`INSERT INTO users (id, nickname, email, password) VALUES ('0', 'System', 'system@forum.com', 'none') ON CONFLICT (id) DO NOTHING;`)
	_, _ = db.Exec(`INSERT INTO servers (id, name, owner_id, color) VALUES ('1', 'Salon Général', '0', '#5865F2') ON CONFLICT (id) DO NOTHING;`)
	_, _ = db.Exec(`INSERT INTO server_members (server_id, user_id) VALUES ('1', '0') ON CONFLICT (server_id, user_id) DO NOTHING;`)

	log.Println("✅ [Database] Schéma PostgreSQL Supabase initialisé et prêt !")
	return db, nil
}
