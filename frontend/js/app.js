const app = document.getElementById('app');

// État global de l'application
let currentUser = null;
let socket;

function connectWS() {
    // 1. Détecter si on est en HTTP (ws) ou HTTPS (wss)
    // C'est crucial car Koyeb utilise le HTTPS/WSS par défaut
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // 2. Récupérer l'adresse actuelle (ex: localhost:8080 ou forum.koyeb.app)
    const host = window.location.host;

    // 3. Assembler l'URL complète
    const wsUrl = `${protocol}//${host}/ws`;

    console.log("🔗 Tentative de connexion WebSocket vers :", wsUrl);

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("🚀 WebSocket : Connecté avec succès !");
    };

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const list = document.getElementById('message-list');
        if (list) {
            list.innerHTML += `<p><strong>${msg.sender}:</strong> ${msg.content}</p>`;
            list.scrollTop = list.scrollHeight;
        }
    };

    socket.onerror = (error) => {
        console.error("⚠️ Erreur WebSocket :", error);
    };

    socket.onclose = () => {
        console.log("❌ WebSocket déconnecté.");
    };
}

checkAuth();

// Le "Routeur" de ta SPA
function router(page) {
    switch (page) {
        case 'home': renderHome(); break;
        case 'login': renderLogin(); break;
        case 'register': renderRegister(); break;
    }
}

// Fonction pour charger un fichier HTML externe
async function loadComponent(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error("Composant introuvable");
        return await response.text();
    } catch (err) {
        console.error(err);
        return `<p style="color:red">Erreur de chargement du composant.</p>`;
    }
}

async function renderHome() {
    // 1. Si pas connecté, on l'envoie sur la page de connexion
    if (!currentUser) {
        router('login'); 
        return;
    }

    // 2. Si connecté, on charge le layout principal
    app.innerHTML = await loadComponent('/frontend/components/main.html');

    // 3. On met à jour l'interface avec les données de l'utilisateur
    const usernameDisplay = document.getElementById('current-username');
    if (usernameDisplay) {
        usernameDisplay.innerText = currentUser;
    }

    // 4. Lancement du WebSocket
    if (!socket || socket.readyState !== WebSocket.OPEN) connectWS();

    // 5. Gestion de l'envoi de message
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.onsubmit = (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const msg = {
                type: "public",
                sender: currentUser,
                content: input.value,
                channel_id: "1" // En attendant de gérer les vrais serveurs
            };
            socket.send(JSON.stringify(msg));
            input.value = "";
        };
    }
}

function renderRegister() {
    app.innerHTML = `
        <h1>Inscription</h1>
        <form id="regForm">
            <input type="text" id="nickname" placeholder="Pseudo" required><br>
            <input type="email" id="email" placeholder="Email" required><br>
            <input type="password" id="password" placeholder="Mot de passe" required><br>
            <button type="submit">Créer mon compte</button>
        </form>
        <p id="regMessage" style="color:red"></p>
    `;

    document.getElementById('regForm').onsubmit = async (e) => {
        e.preventDefault();
        
        // On nettoie le message d'erreur précédent au cas où
        document.getElementById('regMessage').innerText = "";

        const data = {
            nickname: document.getElementById('nickname').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        };

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            // ⚠️ LE SECRET EST ICI : On lit le JSON UNE SEULE FOIS,
            // que la requête soit un succès (201) ou une erreur (409)
            const result = await response.json();

            if (response.ok) {
                // Si c'est OK (Status 200-299)
                alert("Compte créé avec succès !");
                router('login');
            } else {
                // Si c'est une erreur (Ex: 409 Conflict)
                // On affiche le message renvoyé par ton backend Go
                document.getElementById('regMessage').innerText = result.message || "Erreur d'inscription";
            }
        } catch (err) {
            console.error("Erreur Fetch:", err);
            document.getElementById('regMessage').innerText = "Erreur de connexion au serveur.";
        }
    };
}
async function renderLogin() {
    // 1. On injecte le HTML propre depuis notre fichier
    app.innerHTML = await loadComponent('/frontend/components/login.html');

    // 2. Maintenant que le HTML est dans la page, on peut attacher nos événements
    const loginForm = document.getElementById('loginForm');
    
    // Sécurité au cas où le composant n'a pas chargé
    if (!loginForm) return; 

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        document.getElementById('loginMessage').innerText = "";

        const data = {
            login: document.getElementById('loginInput').value,
            password: document.getElementById('passInput').value
        };

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                currentUser = result.nickname;
                router('home');
            } else {
                document.getElementById('loginMessage').innerText = result.message || "Identifiants incorrects";
            }
        } catch (err) { 
            console.error("Erreur:", err); 
        }
    };
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        if (response.ok) {
            currentUser = null;
            alert("Déconnexion réussie !");
            router('home');
        } else {
            console.error("Erreur lors de la déconnexion côté serveur");
        }
    } catch (err) {
        console.error("Erreur réseau :", err);
    }
}

async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.nickname;
            console.log("Session restaurée pour :", currentUser);
            router('home');
        }
    } catch (err) {
        console.log("Pas de session active.");
    }
}

router('home');