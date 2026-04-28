# --- ÉTAPE 1 : Compilation ---
FROM golang:1.23-alpine AS builder

# Installation des outils nécessaires pour SQLite (CGO)
RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

# Copie des fichiers de dépendances en premier (optimise le cache)
COPY go.mod go.sum ./
RUN go mod download

# Copie tout le reste du projet
COPY . .

# Compilation du binaire Go avec support SQLite (CGO_ENABLED=1)
RUN CGO_ENABLED=1 GOOS=linux go build -o forum-server ./backend/main.go

# --- ÉTAPE 2 : Image finale ---
FROM alpine:latest
RUN apk add --no-cache ca-certificates sqlite

WORKDIR /root/

# On récupère le binaire compilé
COPY --from=builder /app/forum-server .

# On récupère TOUT le dossier frontend (indispensable pour le HTML/CSS/JS)
COPY --from=builder /app/frontend ./frontend

# Optionnel : On copie la base de données si tu veux des données de test
# COPY --from=builder /app/forum.db .

# On expose le port défini dans ton main.go
EXPOSE 8080

# Commande de lancement
CMD ["./forum-server"]