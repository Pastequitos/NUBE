# Real-Time Forum SPA (Golang & Vanilla JS)

## 📌 Présentation
Développement d'un forum en Single Page Application (SPA) avec messagerie instantanée en temps réel.
**Stack :** Golang, SQLite3, Vanilla JS, WebSockets.

🗺️ Road Map du Projet
✅ Phase 1 : Architecture & Fondations
[x] Initialisation go mod et structure de dossiers (Back/Front).
[x] Configuration de SQLite3 avec gestion des clés étrangères.
[x] Système d'UUID (Google UUID) pour des identifiants uniques et sécurisés.
[x] Injection automatique des données système (Utilisateur "System" et "Salon Général").

✅ Phase 2 : Authentification & Sécurité
[x] Hashage des mots de passe avec Bcrypt.
[x] Gestion des sessions via cookies HTTP-only et table sessions en BDD.
[x] API d'authentification complète (/api/register, /api/login, /api/logout, /api/me).
[x] Routeur Frontend gérant les vues Login/Register/Home.

✅ Phase 3 : Serveurs & Salons (Channels)
[x] Création de serveurs en BDD avec attribution d'un propriétaire.
[x] Système de couleurs persistantes : choix d'une couleur à la création, stockée en BDD.
[x] Composants modulaires : Chargement "Lazy-loading" des modales et icônes via fichiers HTML séparés.
[x] Calcul dynamique du nombre de membres par serveur via SQL (COUNT).
[x] Tooltips personnalisés au survol des icônes.

✅ Phase 4 : Messagerie Temps Réel (WebSockets)
[x] Infrastructure Hub avec ReadPump et WritePump pour une gestion robuste des connexions.
[x] Persistance des messages en BDD avec liaison aux serveurs.
[x] Récupération de l'historique (50 derniers messages) avec jointures SQL complexes.
[x] Logique de Chat Avancée :
[x] Message Grouping : Fusion des messages envoyés par le même utilisateur dans un intervalle de 10 min.
[x] Smart Timestamps : Formatage dynamique (Discord-like : "Aujourd'hui à...", "Hier à...").
[x] Design Flexbox moderne (Avatar, En-tête, Contenu).

🛠️ Plan d'Attaque (Demain)
🎟️ Phase 5 : Le Système d'Invitations
[ ] Création de la table invites (tokens uniques).
[ ] Logique de génération de liens d'invitation (Backend).
[ ] Interface pour rejoindre un serveur via un code.

👥 Phase 6 : Social & Privé
[ ] Système d'amis : Table friends, demandes d'amis et gestion des statuts (en attente/accepté).
[ ] Messages Privés (MP) : Routage des messages WebSocket point-à-point.
[ ] Visualisation des amis en ligne dans le contactContainer.

🔗 Phase 7 : La Fusion
[ ] Message Parsing : Détection automatique des liens d'invitation dans le chat.
[ ] Invite Cards : Remplacement des liens textuels par des cartes visuelles "Rejoindre le serveur".

🚀 Évolutions Futures (Backlog)
[ ] Gestion des Médias :
[ ] Upload et compression des images de profil.
[ ] Icônes de serveurs personnalisées (remplacement des initiales par des images 48x48px).
[ ] Envoi d'images dans le chat.
[ ] Paramètres Utilisateur : Interface pour modifier ses informations (Pseudo, Email, Password).
[ ] Rôles & Permissions : Gestion des droits (Administrateur du serveur vs Membre).
[ ] Optimisation UI : Scroll infini (pagination) pour les messages.

🛠️ Installation & Lancement
Préréquis : Avoir Go installé.

Installation :

Bash
go get github.com/mattn/go-sqlite3
go get github.com/google/uuid
go get golang.org/x/crypto/bcrypt
Lancement :

Bash
go run main.go
Accès : http://localhost:8080

💡 Note sur l'architecture Frontend
Le projet utilise une architecture modulaire pour éviter les fichiers JS trop lourds :

main.js : Routeur et logique de page.

websocket.js : Gestion de la connexion temps réel.

utils.js : Fonctions d'affichage et formatage (DRY).

state.js : État global de l'application.


creation du git
creation des dossiers back et front
init go mod
import go sqlite3 go get ("github.com/mattn/go-sqlite3")
creation de sqlite.go permettant de handle la creation de la db
creation du main.go permettant de handle toutes le fonctions et le serveur
lancement du main.go >> sqlite pour creer la db
verifier la localisation de la db et son arbo
creation d'un index.html pour verifier que go sert bien le fichier
creation d'une structure user
instalation de bcrypt pour crypter le mdp de l'utilisateur (go get golang.org/x/crypto/bcrypt)
creation d'une structure session
creation de auth.go pour handle les inscriptions et connexions
ajout de la route d'auth dans le main.go
test ajout user : curl -i -X POST http://localhost:8080/api/register \ -H "Content-Type: application/json" \ -d "{"nickname":"Tester01" "age":25,"gender":"M","firstName":"Jean","lastName":"Dupont","email":"test@example.com","password":"password123"}"
installation uuid de google pour eviter tout probleme d'id en cas de changement de pseudo ou les messages disparaissent etc... (go get github.com/google/uuid)
maintenant que chaque utilisateur a son id propre il est temps de pouvoir se log
ajout d'un debut d'interface modulaire via app.js en fonction de la route pour tester les log et register
creation de style.css pour le style principal
creation du hub.go afin de d'upgrader la connexion en websocket
mettre en place un write et une readpump
connexion du frontend au websocket via app.js (ciblage des inputs, envoi et réception de messages en JSON)
ajout de l'accès BDD (*sql.DB) directement dans la structure Client (Go) pour permettre la persistance
adaptation de la sauvegarde des messages (ReadPump) pour respecter ton schéma SQL strict avec clés étrangères (sender_id, server_id)
injection automatique d'un utilisateur "System" et d'un "Salon Général" (ID 1) au démarrage du serveur pour valider les insertions
création du handler GetMessagesHandler (/api/messages) pour récupérer l'historique
écriture d'une requête SQL avancée (sous-requête + JOIN) pour récupérer les 50 derniers messages avec leurs pseudos, et les trier dans le bon ordre chronologique
mise en place de la fonction loadHistory côté front pour afficher l'historique au chargement de la page
refactorisation du JavaScript en modules ES6 (main.js, state.js, utils.js, websocket.js) pour une architecture maintenable
création de la fonction réutilisable appendMessage (principe DRY) pour gérer l'affichage de l'historique ET du direct
refonte de la structure HTML injectée par le JS pour permettre un design Flexbox façon Discord (Avatar, En-tête, Contenu)
implémentation du "Message Grouping" (mémoire du dernier message pour empiler les textes d'un même utilisateur envoyés à moins de 10 minutes d'intervalle)
création d'un horodatage intelligent (formatTime) s'adaptant à la date actuelle ("14:30", "Hier à 14:30", "24 avril à 14:30")
mise a jour de la bdd pour ajouter la table servers avec gestion d'une couleur et la table server_members
creation des routes et handlers go pour la creation (POST) et la recuperation (GET) des serveurs de l'utilisateur
requete sql avec count() pour recuperer et envoyer au js le nombre de membres par serveur
mise en place d'une popup (modal) en lazy loading via loadComponent pour creer un serveur
ajout d'un selecteur de couleur personnalise via des boutons radio invisibles dans la modale
affichage dynamique de la liste des serveurs sous forme de bulles avec l'initiale du serveur
creation d'un fichier html dedie pour le composant serverIcon afin de le cloner en js
stylisation css facon discord (squircle) au survol des icones de serveurs
separation du background et du conteneur de l'icone pour animer un retrecissement (scale) fluide au survol
creation d'une info-bulle (tooltip) css personnalisee affichant le nom du serveur et ses membres qui pop sur la droite