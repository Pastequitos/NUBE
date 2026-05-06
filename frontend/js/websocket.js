import { state } from './state.js';
import { appendMessage } from './messages.js';
import { loadFriendsList, loadServerMembers } from './users.js';
import { updateAllAvatarsInDOM } from './utils.js'; // 🌟 Import manquant ajouté !

export function connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    state.socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    state.socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log("📩 WebSocket received:", data);

        // 🌟 Utilisation du switch pour un code plus propre et rapide
        switch (data.type) {
            
            case 'public':
                if (data.server_id === state.activeServerId) {
                    appendMessage(data);
                }
                break;

            case 'user_status':
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
                break;

            case 'member_join':
                if (data.server_id === state.activeServerId) {
                    await loadServerMembers(data.server_id);
                }
                break;

            case 'friend_request':
                console.log('in');
                console.log('senderID', data.sender_id);
                console.log('userID', state.userId);
                console.log('targetID', data.target_id);
                console.log('state', state);
                
                if (String(data.target_id) === String(state.userId)) {
                    console.log("🔄 Actualisation de la liste d'amis !");
                    await loadFriendsList();

                    const btnHome = document.getElementById('btnHome');
                    if (btnHome) btnHome.classList.add('has-notification');
                }
                break;

            case 'friend_accept':
                if (String(data.sender_id) === String(state.userId) || String(data.target_id) === String(state.userId)) {
                    console.log("🤝 Demande acceptée, actualisation !");
                    await loadFriendsList();
                }
                break;

            case 'friend_remove':
                console.log("💔 Ami supprimé, actualisation !");
                if (String(data.sender_id) === String(state.userId) || String(data.target_id) === String(state.userId)) {
                    console.log("💔 Ami supprimé, actualisation !");
                    await loadFriendsList();

                    const modal = document.getElementById('modalContainer');
                    if (modal && modal.style.display === 'flex') {
                        modal.style.display = 'none';
                    }
                }
                break;

            case 'avatar_update':
                console.log("🖼️ Notification d'un changement de PP reçue via WebSocket !");
                updateAllAvatarsInDOM(data.user_id, data.avatar);
                break;

            default:
                console.log("⚠️ Type de message WebSocket non reconnu :", data.type);
                break;
        }
    };

    state.socket.onclose = () => {
        setTimeout(connectWS, 3000);
    };

    state.socket.onerror = (error) => {
        console.error("⚠️ Erreur WebSocket:", error);
    };
}