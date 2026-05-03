import { state } from './state.js';
import { appendMessage } from './messages.js';
import { loadFriendsList, loadServerMembers } from './users.js';


export function connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    state.socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    state.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("📩 WebSocket received:", data);

        if (data.type === "public") {
            if (data.server_id === state.activeServerId) {
                appendMessage(data);
            }
        }

        // websocket.js
        if (data.type === 'user_status') {
            if (data.user_id === state.userId) return;

            const contactItems = document.querySelectorAll(`[data-id="${data.user_id}"]`);

            if (contactItems.length > 0) {
                console.log(`🎯 Update visuel pour ${data.user_id} (${contactItems.length} élément(s) trouvé(s))`);

                contactItems.forEach(item => {
                    if (data.status === 'online') {
                        item.classList.replace('offline', 'online');
                    } else {
                        item.classList.replace('online', 'offline');
                    }
                });
            } else {
                console.log(`ℹ️ Aucun élément trouvé pour l'ID: ${data.user_id}`);
            }
        }


        if (data.type === "member_join") {
            if (data.server_id === state.activeServerId) {
                loadServerMembers(data.server_id);
            }
        }

        if (data.type === "friend_request") {
            if (data.target_id === state.myId) {
                if (!state.activeServerId) {
                    loadFriendsList();
                } else {
                    document.getElementById('btnHome').classList.add('has-notification');
                }
            }
        }

        if (data.type === "friend_accept") {
            // Est-ce que JE suis concerné par ce message ?
            if (data.sender_id === state.userId || data.target_id === state.userId) {
                console.log("🔄 C'est pour moi ! Refresh de la liste d'amis.");
                loadFriendsList();
            }
        }
    };

    state.socket.onclose = () => {
        /* console.log("❌ WebSocket déconnecté. Tentative de reconnexion..."); */
        setTimeout(connectWS, 3000); // Reconnexion auto après 3 secondes
    };

    state.socket.onerror = (error) => {
        console.error("⚠️ Erreur WebSocket:", error);
    };
}