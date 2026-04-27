# Real-Time Forum SPA (Golang & Vanilla JS)

## 📌 Présentation
Développement d'un forum en Single Page Application (SPA) avec messagerie instantanée en temps réel.
**Stack :** Golang, SQLite3, Vanilla JS, WebSockets.

---

## 🗺️ Road Map du Projet

### 🏗️ Phase 1 : Architecture & Fondations
- [ ] **Initialisation du projet**
    - [ ] `go mod init` et structure des dossiers.
    - [ ] Configuration de Git (Main, Develop).
- [ ] **Persistance des données (SQLite)**
    - [ ] Création du script d'initialisation `database/sqlite.go`.
    - [ ] Définition des tables (Users, Posts, Comments, Messages, Sessions).
    - [ ] Activation des clés étrangères (`PRAGMA`).

### 👤 Phase 2 : Authentification (Backend & Frontend)
- [ ] **Sécurité Backend**
    - [ ] Hashage des mots de passe avec `bcrypt`.
    - [ ] Génération d'UUID pour les IDs.
    - [ ] Gestion des sessions (Store en BDD + Cookie HTTP-Only).
- [ ] **Logique d'Auth (Routes API)**
    - [ ] Endpoint `/api/register`.
    - [ ] Endpoint `/api/login` (Nickname ou Email).
    - [ ] Endpoint `/api/logout`.
- [ ] **Interface SPA (JS)**
    - [ ] Routeur JS (changement de vue sans rechargement).
    - [ ] Formulaires d'inscription et de connexion.

### 📝 Phase 3 : Forum (Posts & Commentaires)
- [ ] **Gestion des Posts**
    - [ ] Création de post avec catégories.
    - [ ] Flux d'affichage des posts (Feed).
- [ ] **Gestion des Commentaires**
    - [ ] Système de commentaires par post.
    - [ ] Chargement dynamique au clic sur un post.

### 💬 Phase 4 : Temps Réel (WebSockets)
- [ ] **Infrastructure WebSocket (Go)**
    - [ ] Mise en place du Hub (gestion des clients).
    - [ ] Gestion des Go Routines et des Channels.
- [ ] **Liste d'utilisateurs**
    - [ ] Statut Online/Offline en temps réel.
    - [ ] Tri par dernier message / Alphabétique.
- [ ] **Messagerie Privée**
    - [ ] Envoi/Réception instantanée.
    - [ ] Historique (Chargement des 10 derniers messages).
    - [ ] Scroll infini avec Throttling/Debouncing (pagination).

### 🚀 Phase 5 : Déploiement & Qualité
- [ ] **Optimisation & UI**
    - [ ] Design CSS final (Single Page layout).
    - [ ] Gestion d'erreurs propre (Front & Back).
- [ ] **Déploiement**
    - [ ] Configuration du service de fichiers statiques en Go.
    - [ ] Dockerisation du projet (`Dockerfile`).
    - [ ] Mise en ligne (VPS ou PaaS).

---

## 🛠️ Installation & Lancement (Local)

1. Cloner le repo : `git clone [url-du-repo]`
2. Lancer le serveur : `go run backend/main.go`
3. Accéder à l'app : `http://localhost:8080`



creation du git
creation des dossiers back et front
init go mod
import go sqlite3 go get ("github.com/mattn/go-sqlite3")
creation de sqlite.go permettant de handle la creation de la db
creation du main.go permettant de handle toutes le fonctions et le serveur
lancement du main.go >> sqlite pour creer la db
verifier la localisation de la db et son arbo