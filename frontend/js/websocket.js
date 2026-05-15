import { state } from './state.js';
import { appendMessage, blockChatTemporarily } from './messages.js';
import { loadFriendsList, loadServerMembers } from './users.js';
import { updateAllAvatarsInDOM } from './utils.js';
import { notify } from './notifications.js';

export function connectWS() {
    // 🛡️ BARRIÈRE 1 : Si l'utilisateur n'est pas loggé dans le state, on ne fait rien
    if (!state.userId) {
        console.log("🔌 WS : En attente d'authentification pour se connecter...");
        return;
    }

    // Évite d'ouvrir plusieurs sockets si un est déjà en cours d'ouverture
    if (state.socket && (state.socket.readyState === WebSocket.CONNECTING || state.socket.readyState === WebSocket.OPEN)) {
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    state.socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    state.socket.onopen = () => {
        console.log("✅ WebSocket : Connecté avec succès");
    };

    state.socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        // console.log("📩 WebSocket received:", data); // Optionnel : à commenter pour une console encore plus propre

        switch (data.type) {
            case 'system':
                if (data.content && data.content.includes("réduit au silence")) {
                    blockChatTemporarily(true);
                    return;
                }
                appendMessage(data);
                break;

            case 'mute_update':
                if (data.server_id === state.activeServerId) {
                    blockChatTemporarily(data.is_muted, data.until);
                }
                if (data.is_muted) {
                    notify.error("🔇 Vous avez été réduit au silence par un modérateur.", 6000);
                } else {
                    notify.success("🔊 Votre parole a été restaurée.", 5000);
                }
                break;

            case 'public':
                if (data.server_id === state.activeServerId) {
                    appendMessage(data);
                } else {
                    const serverIcon = document.querySelector(`.server-icon[data-id="${data.server_id}"]`);
                    if (serverIcon) {
                        let badge = serverIcon.querySelector('.unread-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'unread-badge';
                            badge.innerText = '1';
                            serverIcon.appendChild(badge);
                        } else {
                            const current = parseInt(badge.innerText);
                            badge.innerText = isNaN(current) ? '1' : current + 1;
                        }
                    }
                }
                break;

            case 'private':
                const isCurrentConversation = (String(state.activeDmUserId) === String(data.sender_id)) || (String(state.activeDmUserId) === String(data.receiver_id));
                if (isCurrentConversation) {
                    appendMessage(data);
                } else if (String(data.sender_id) !== String(state.userId)) {
                    const friendIcon = document.querySelector(`.friend-item[data-id="${data.sender_id}"]`);
                    if (friendIcon) {
                        let badge = friendIcon.querySelector('.unread-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'unread-badge';
                            badge.innerText = '1';
                            friendIcon.appendChild(badge);
                        } else {
                            const current = parseInt(badge.innerText);
                            badge.innerText = isNaN(current) ? '1' : current + 1;
                        }
                    } else {
                        loadFriendsList();
                    }
                }
                break;

            case 'user_status':
                if (data.user_id === state.userId) return;
                const contactItems = document.querySelectorAll(`[data-id="${data.user_id}"]`);
                contactItems.forEach(item => {
                    if (data.status === 'online') {
                        item.classList.replace('offline', 'online');
                    } else {
                        item.classList.replace('online', 'offline');
                    }
                });
                break;

            case 'member_join':
                if (data.server_id === state.activeServerId) {
                    await loadServerMembers(data.server_id);
                }
                break;

            case 'friend_request':
                if (String(data.target_id) === String(state.userId)) {
                    await loadFriendsList();
                    const btnHome = document.getElementById('btnHome');
                    if (btnHome) btnHome.classList.add('has-notification');
                }
                break;

            case 'friend_accept':
                if (String(data.sender_id) === String(state.userId) || String(data.target_id) === String(state.userId)) {
                    await loadFriendsList();
                }
                break;

            case 'avatar_update':
                updateAllAvatarsInDOM(data.user_id, data.avatar);
                break;

            default:
                console.log("⚠️ Type inconnu:", data.type);
                break;
        }
    };

    state.socket.onclose = (event) => {
        // 🛡️ BARRIÈRE 2 : On ne reconnecte QUE si l'utilisateur est toujours censé être là
        // Si le code est 1000, c'est une déconnexion volontaire (logout)
        if (state.userId && event.code !== 1000) {
            console.log("🔄 WS : Connexion perdue. Tentative de reconnexion dans 3s...");
            setTimeout(connectWS, 3000);
        } else {
            console.log("🔌 WS : Déconnecté (normal ou non loggé).");
        }
    };

    state.socket.onerror = () => {
        // On ne fait rien ici, on laisse le onclose gérer la suite sans polluer la console
        state.socket.close();
    };
}