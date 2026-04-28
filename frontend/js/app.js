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

function renderHome() {
    if (!currentUser) {
        app.innerHTML = `<h1>Bienvenue</h1><p>Connecte-toi !</p>`;
        return;
    }

    app.innerHTML = `
        <div class="discord-container">
            <aside class="sidebar">
                <h3>Salons</h3>
                <div class="channel active"># général</div>
            </aside>
            
            <main class="chat-area">
                <div id="message-list"></div>
                <form id="chat-form">
                    <input type="text" id="chat-input" placeholder="Envoyer un message dans #général">
                </form>
            </main>
        </div>
    `;

    // Connecter le WebSocket si ce n'est pas déjà fait
    if (!socket || socket.readyState !== WebSocket.OPEN) connectWS();

    // Gérer l'envoi du message
    document.getElementById('chat-form').onsubmit = (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const msg = {
            type: "public",
            sender: currentUser,
            content: input.value,
            channel_id: "1" // ID du salon général
        };
        socket.send(JSON.stringify(msg)); // On envoie du JSON !
        input.value = "";
    };
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

function renderLogin() {
    app.innerHTML = `
        <h1>Connexion</h1>
        <form id="loginForm">
            <input type="text" id="loginInput" placeholder="Email ou Pseudo" required><br>
            <input type="password" id="passInput" placeholder="Mot de passe" required><br>
            <button type="submit">Se connecter</button>
        </form>
        <p id="loginMessage" style="color:red"></p>
    `;

    document.getElementById('loginForm').onsubmit = async (e) => {
        e.preventDefault();
        
        // On efface les anciens messages d'erreur
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

            // On lit le JSON UNE SEULE FOIS !
            const result = await response.json();

            if (response.ok) {
                // Succès 200
                currentUser = result.nickname;
                router('home');
            } else {
                // Erreur 401, on affiche le message du backend Go
                document.getElementById('loginMessage').innerText = result.message || "Identifiants incorrects";
            }
        } catch (err) { 
            console.error("Erreur Fetch:", err); 
            document.getElementById('loginMessage').innerText = "Erreur de connexion au serveur.";
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