import { state } from './state.js';
import { loadComponent, appendMessage } from './utils.js';
import { connectWS } from './websocket.js';

const app = document.getElementById('app');

export function router(page) {
    switch (page) {
        case 'home': renderHome(); break;
        case 'login': renderLogin(); break;
        case 'register': renderRegister(); break;
    }
}
window.router = router;
window.handleLogout = handleLogout;

async function renderHome() {
    if (!state.currentUser) {
        router('login');
        return;
    }

    app.innerHTML = await loadComponent('/frontend/components/main.html');

    const usernameDisplay = document.getElementById('current-username');
    if (usernameDisplay) usernameDisplay.innerText = state.currentUser;

    // --- 1. CHARGEMENT DES SALONS ---
    const loadServers = async () => {
        try {
            const response = await fetch('/api/my-servers');
            if (!response.ok) return;
            const servers = await response.json();
            const serverList = document.getElementById('serverList');
            if (!serverList) return;

            serverList.innerHTML = '';

            // On charge le template d'icône une seule fois
            const iconTemplate = await loadComponent('/frontend/components/serversContainer/serverIcon.html');

            if (servers && servers.length > 0) {
                servers.forEach(server => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = iconTemplate;
                    const iconElement = tempDiv.firstElementChild;

                    // On applique l'initiale
                    const initial = server.name.charAt(0).toUpperCase();
                    iconElement.querySelector('.server-initials').innerText = initial;

                    // On applique la couleur stockée en BDD
                    iconElement.querySelector('.server-bg').style.backgroundColor = server.color;
                    iconElement.dataset.id = server.id;

                    // --- NOUVEAU CODE ICI ---
                    const s = server.member_count > 1 ? "s" : "";
                    const tooltipText = `${server.name}`;

                    // On injecte le texte dans notre nouvelle div
                    iconElement.querySelector('.server-tooltip').innerText = tooltipText;
                    iconElement.removeAttribute('title');
                    // ------------------------

                    // Événement clic
                    iconElement.addEventListener('click', () => {
                        console.log("Salon sélectionné :", server.name);
                    });
                    // Événement clic
                    iconElement.addEventListener('click', () => {
                        console.log("Salon sélectionné :", server.name);
                    });

                    serverList.appendChild(iconElement);
                });
            }
        } catch (err) {
            console.error("Erreur chargement serveurs :", err);
        }
    };

    await loadServers();

    // --- 2. HISTORIQUE MESSAGES ---
    const loadHistory = async () => {
        try {
            const response = await fetch('/api/messages');
            if (response.ok) {
                const messages = await response.json();
                const chatContainer = document.getElementById('chatContainer');
                if (chatContainer) chatContainer.innerHTML = '';

                if (messages && messages.length > 0) {
                    messages.forEach(msg => appendMessage(msg));
                }
            }
        } catch (err) { console.error(err); }
    };

    await loadHistory();

    // --- 3. WEBSOCKET ET MESSAGES ---
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) connectWS();

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendMessage');

    const sendMessage = () => {
        if (!messageInput) return;
        const text = messageInput.value.trim();
        if (text === "") return;
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;

        const msg = {
            type: "public",
            sender: state.currentUser,
            content: text,
            channel_id: "1"
        };

        state.socket.send(JSON.stringify(msg));
        messageInput.value = "";
    };

    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
        });
    }
    if (sendButton) {
        sendButton.addEventListener('click', (e) => { e.preventDefault(); sendMessage(); });
    }

    // --- 4. GESTION DE LA MODALE ---
    const modalContainer = document.getElementById('modalContainer');
    const openModalBtn = document.getElementById('openModalBtn');

    if (openModalBtn && modalContainer) {
        openModalBtn.addEventListener('click', async () => {
            if (modalContainer.innerHTML.trim() === "") {
                modalContainer.innerHTML = await loadComponent('/frontend/components/modalContainer/createServer.html');
                setupModalEvents();
            }
            modalContainer.style.display = 'flex';
            setTimeout(() => {
                const input = document.getElementById('serverNameInput');
                if (input) input.focus();
            }, 50);
        });
    }

    function setupModalEvents() {
        const closeModalBtn = document.getElementById('closeModalBtn');
        const createServerForm = document.getElementById('createServerForm');
        const serverNameInput = document.getElementById('serverNameInput');

        const closeModal = () => {
            modalContainer.style.display = 'none';
            if (serverNameInput) serverNameInput.value = '';
        };

        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => {
            if (e.target === modalContainer) closeModal();
        });

        if (createServerForm) {
            createServerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const serverName = serverNameInput.value.trim();
                if (!serverName) return;

                // On récupère la couleur cochée
                const checkedColorInput = document.querySelector('input[name="serverColor"]:checked');
                const selectedColor = checkedColorInput ? checkedColorInput.value : "#5865F2";

                try {
                    const response = await fetch('/api/servers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: serverName, color: selectedColor })
                    });

                    if (response.ok) {
                        closeModal();
                        await loadServers(); // On rafraîchit les bulles !
                    } else {
                        alert("Erreur lors de la création du salon.");
                    }
                } catch (err) {
                    console.error("Erreur réseau :", err);
                }
            });
        }
    }
}

// --- PAGES INSCRIPTION / LOGIN ---
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
        <button onclick="router('login')">Déjà un compte ? Connectez-vous</button>
    `;

    document.getElementById('regForm').onsubmit = async (e) => {
        e.preventDefault();
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
            const result = await response.json();
            if (response.ok) {
                alert("Compte créé !");
                router('login');
            } else {
                document.getElementById('regMessage').innerText = result.message || "Erreur";
            }
        } catch (err) { console.error(err); }
    };
}

async function renderLogin() {
    app.innerHTML = await loadComponent('/frontend/components/login.html');
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
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
                state.currentUser = result.nickname;
                router('home');
            } else {
                const msgEl = document.getElementById('loginMessage');
                if (msgEl) msgEl.innerText = result.message || "Identifiants incorrects";
            }
        } catch (err) { console.error(err); }
    };
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            state.currentUser = null;
            if (state.socket) state.socket.close();
            alert("Déconnexion !");
            router('login');
        }
    } catch (err) { console.error(err); }
}

async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            state.currentUser = data.nickname;
            router('home');
        } else {
            router('login');
        }
    } catch (err) {
        router('login');
    }
}

// Démarrage de l'application
checkAuth();