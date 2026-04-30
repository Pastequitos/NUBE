import { state } from './state.js';
import { loadComponent, appendMessage, loadServerHistory, loadServerMembers } from './utils.js';
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

    // --- 1. ÉCOUTEUR GLOBAL POUR LE MENU CONTEXTUEL (INFAILLIBLE) ---
    if (!window.menuListenerAttached) {
        document.addEventListener('click', async (e) => {
            const menu = document.getElementById('serverContextMenu');

            // A. ACTION : INVITER DES AMIS
            if (e.target && (e.target.id === 'serverMenuInvite' || e.target.id === 'menuInvite')) {
                if (!menu) return;
                const targetId = menu.dataset.serverId;
                const targetName = menu.dataset.serverName;

                menu.style.display = 'none';

                if (!targetId) {
                    alert("Erreur interne : ID du salon introuvable.");
                    return;
                }

                try {
                    const res = await fetch('/api/invites', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ server_id: targetId })
                    });

                    if (res.ok) {
                        const data = await res.json();

                        // Chargement de la jolie modale d'invitation
                        const modalContainer = document.getElementById('modalContainer');
                        modalContainer.innerHTML = await loadComponent('/frontend/components/modalContainer/inviteServer.html');

                        // Injection du nom du serveur
                        document.getElementById('inviteServerName').innerText = targetName;

                        // Génération du lien complet
                        const inviteLink = `${window.location.origin}/join/${data.token}`;
                        const inputElement = document.getElementById('inviteLinkInput');
                        inputElement.value = inviteLink;

                        // Affichage
                        modalContainer.style.display = 'flex';

                        // Événement : Fermer la modale
                        const closeModal = () => {
                            modalContainer.style.display = 'none';
                            modalContainer.innerHTML = ''; // Nettoyage
                        };
                        document.getElementById('closeInviteModalBtn').addEventListener('click', closeModal);

                        // Événement : Clic dans le vide pour fermer
                        const outsideClickListener = (evt) => {
                            if (evt.target === modalContainer) {
                                closeModal();
                                window.removeEventListener('click', outsideClickListener);
                            }
                        };
                        window.addEventListener('click', outsideClickListener);

                        // Événement : Bouton Copier
                        const copyBtn = document.getElementById('copyInviteBtn');
                        copyBtn.addEventListener('click', async () => {
                            try {
                                await navigator.clipboard.writeText(inviteLink);
                                copyBtn.innerText = 'Copié !';
                                copyBtn.style.backgroundColor = '#23a559'; // Vert succès

                                setTimeout(() => {
                                    if (document.body.contains(copyBtn)) {
                                        copyBtn.innerText = 'Copier';
                                        copyBtn.style.backgroundColor = '#5865F2'; // Retour au bleu
                                    }
                                }, 2000);
                            } catch (err) {
                                console.error('Erreur de copie via presse-papier', err);
                                inputElement.select(); // Plan B
                            }
                        });

                    } else {
                        alert("Erreur lors de la création de l'invitation.");
                    }
                } catch (err) {
                    console.error("Erreur réseau :", err);
                }
                return;
            }

            // B. ACTION : SUPPRIMER LE SERVEUR
            if (e.target && (e.target.id === 'serverMenuDelete' || e.target.id === 'menuDelete')) {
                if (!menu) return;
                const targetName = menu.dataset.serverName;
                alert(`Fonctionnalité à venir : Suppression du serveur ${targetName}`);
                menu.style.display = 'none';
                return;
            }

            // C. FERMER LE MENU SI CLIC AILLEURS
            if (menu && !e.target.closest('.context-menu')) {
                menu.style.display = 'none';
            }
        });

        window.menuListenerAttached = true; // On verrouille pour éviter les doublons
    }

    // --- 2. INITIALISATION DU MENU HTML ---
    const initServerContextMenu = async () => {
        if (!document.getElementById('serverContextMenu')) {
            const menuHTML = await loadComponent('/frontend/components/contexts/serverContextMenu.html');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = menuHTML;
            document.body.appendChild(tempDiv.firstElementChild);
        }
    };

    // --- 3. CHARGEMENT DES SALONS ---
    const loadServers = async () => {
        try {
            const response = await fetch('/api/my-servers');
            if (!response.ok) return;
            const servers = await response.json();
            const serverList = document.getElementById('serverList');
            if (!serverList) return;

            serverList.innerHTML = '';

            // S'assurer que le menu HTML est chargé
            await initServerContextMenu();
            const menu = document.getElementById('serverContextMenu');

            const iconTemplate = await loadComponent('/frontend/components/serversContainer/serverIcon.html');

            if (servers && servers.length > 0) {
                servers.forEach(server => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = iconTemplate;
                    const iconElement = tempDiv.firstElementChild;

                    const initial = server.name.charAt(0).toUpperCase();
                    iconElement.querySelector('.server-initials').innerText = initial;

                    iconElement.querySelector('.server-bg').style.backgroundColor = server.color;
                    iconElement.dataset.id = server.id;

                    const s = server.member_count > 1 ? "s" : "";
                    const tooltipText = `${server.name} (${server.member_count} membre${s})`;
                    iconElement.querySelector('.server-tooltip').innerText = tooltipText;
                    iconElement.removeAttribute('title');

                    // CLIC GAUCHE (Entrer dans le salon)
                    iconElement.addEventListener('click', () => {
                        selectServer(server.id, server.name);
                    });

                    // CLIC DROIT (Ouvrir le menu)
                    iconElement.addEventListener('contextmenu', (e) => {
                        e.preventDefault();

                        if (menu) {
                            // On attache l'ID et le nom dynamiquement
                            menu.dataset.serverId = server.id;
                            menu.dataset.serverName = server.name;

                            menu.style.display = 'flex';
                            menu.style.left = `${e.pageX}px`;
                            menu.style.top = `${e.pageY}px`;
                        }
                    });

                    serverList.appendChild(iconElement);
                });
            }
        } catch (err) {
            console.error("Erreur chargement serveurs :", err);
        }
    };

    await loadServers();

    // --- 4. HISTORIQUE MESSAGES ---
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

    // --- 5. WEBSOCKET ET MESSAGES ---
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) connectWS();

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendMessage');

    const sendMessage = () => {
        const text = messageInput.value.trim();

        // On vérifie le state au lieu d'une variable locale
        if (text === "" || !state.activeServerId || !state.socket) return;

        const msg = {
            type: "public",
            sender: state.currentUser,
            content: text,
            server_id: state.activeServerId, // On utilise le state !
            message_type: "user"
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

    // --- 6. GESTION DE LA MODALE DE CRÉATION DE SERVEUR ---
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
        const modalContainer = document.getElementById('modalContainer');

        const closeModal = () => {
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
        };

        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

        // --- ACTION : CRÉER ---
        if (createServerForm) {
            createServerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const serverName = serverNameInput.value.trim();
                if (!serverName) return;

                try {
                    const response = await fetch('/api/servers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: serverName, color: "#5865F2" }) // Couleur par défaut
                    });

                    if (response.ok) {
                        const newServer = await response.json();
                        closeModal();
                        await loadServers();

                        selectServer(newServer.id, newServer.name);
                    }
                } catch (err) {
                    console.error("Erreur création :", err);
                }
            });
        }

        // --- ACTION : REJOINDRE ---
        const joinBtn = document.getElementById('joinServerSubmitBtn');
        const joinInput = document.getElementById('joinServerInput');

        if (joinBtn && joinInput) {
            joinBtn.addEventListener('click', async () => {
                const tokenOrLink = joinInput.value.trim();
                if (!tokenOrLink) return;

                try {
                    const response = await fetch('/api/join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: tokenOrLink })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        closeModal();
                        await loadServers();

                        selectServer(data.server_id, "Nouveau serveur rejoint");
                    } else {
                        alert("Invitation invalide ou déjà membre.");
                    }
                } catch (err) {
                    console.error("Erreur join :", err);
                }
            });
        }
    }
}

// --- AUTHENTIFICATION ---
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

checkAuth();

const handleDirectLink = () => {
    const path = window.location.pathname;
    if (path.startsWith('/join/')) {
        const token = path.split('/')[2];
        // On stocke le token temporairement pour l'utiliser après la connexion
        sessionStorage.setItem('pendingInvite', token);
        // On nettoie l'URL pour revenir au propre
        window.history.replaceState({}, document.title, "/");
    }
}
handleDirectLink();

async function selectServer(serverId, serverName) {
    state.activeServerId = serverId;

    const header = document.getElementById('currentServerName');
    if (header) header.innerText = `💬 ${serverName}`;

    await loadServerHistory(serverId);
    await loadServerMembers(serverId);
}

window.selectServer = selectServer;