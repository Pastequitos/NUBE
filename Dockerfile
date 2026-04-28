# --- Étape 1 : Build du binaire ---
FROM golang:1.21-alpine AS builder

# On installe les outils nécessaires pour compiler SQLite (CGO)
RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

# Copie des fichiers de dépendances
COPY go.mod go.sum ./
RUN go mod download

# Copie de tout le code
COPY . .

# Compilation du binaire (CGO_ENABLED=1 est obligatoire pour SQLite)
RUN CGO_ENABLED=1 GOOS=linux go build -o forum-server ./backend/main.go

# --- Étape 2 : Image d'exécution ---
FROM alpine:latest
RUN apk add --no-cache ca-certificates sqlite

WORKDIR /root/

# On récupère le binaire et le dossier frontend depuis le builder
COPY --from=builder /app/forum-server .
COPY --from=builder /app/frontend ./frontend

# On expose le port 8080 (celui par défaut)
EXPOSE 8080

# Lancement du serveur
CMD ["./forum-server"]