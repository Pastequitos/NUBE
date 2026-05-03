import { state } from './state.js';
import { appendMessage } from './messages.js';
import { loadFriendsList, loadServerMembers } from './users.js';

export function connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    state.socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    state.socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log("📩 WebSocket received:", data);

        if (data.type === "public") {
            if (data.server_id === state.activeServerId) {
                appendMessage(data);
            }
        }

        if (data.type === 'user_status') {
            if (data.user_id === state.userId) return; // On ignore notre propre statut

            const contactItems = document.querySelectorAll(`[data-id="${data.user_id}"]`);

            if (contactItems.length > 0) {
                contactItems.forEach(item => {
                    if (data.status === 'online') {
                        item.classList.replace('offline', 'online');
                    } else {
                        item.classList.replace('online', 'offline');
                    }
                });
            }
        }

        if (data.type === "member_join") {
            if (data.server_id === state.activeServerId) {
                await loadServerMembers(data.server_id);
            }
        }

        if (data.type === "friend_request") {
            console.log('in')
            console.log('senderID', data.sender_id)
            console.log('userID', state.userId)
            console.log('targetID', data.target_id)
            console.log('state', state)
            if (String(data.target_id) === String(state.userId)) {
                console.log("🔄 Actualisation de la liste d'amis !");

                await loadFriendsList();

                const btnHome = document.getElementById('btnHome');
                if (btnHome) btnHome.classList.add('has-notification');
            }
        }

        if (data.type === "friend_accept") {
            if (String(data.sender_id) === String(state.userId) || String(data.target_id) === String(state.userId)) {
                console.log("🤝 Demande acceptée, actualisation !");
                await loadFriendsList();
            }
        }
    };

    state.socket.onclose = () => {
        setTimeout(connectWS, 3000);
    };

    state.socket.onerror = (error) => {
        console.error("⚠️ Erreur WebSocket:", error);
    };
}