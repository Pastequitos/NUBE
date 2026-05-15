import { state } from './state.js';
import { appendMessage, blockChatTemporarily } from './messages.js';
import { loadFriendsList, loadServerMembers } from './users.js';
import { updateAllAvatarsInDOM } from './utils.js';
import { notify } from './notifications.js';

export function connectWS() {
    if (!state.userId) {
        
        return;
    }

    if (state.socket && (state.socket.readyState === WebSocket.CONNECTING || state.socket.readyState === WebSocket.OPEN)) {
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    state.socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    state.socket.onopen = () => {
        
    };

    state.socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

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
                    const serverName = document.querySelector(`.server-icon[data-id="${data.server_id}"]`)?.title || "un serveur";
                    if (data.message_type !== 'system') {
                        notify.info(`💬 Nouveau message sur ${serverName}`);
                    }

                    const serverIcon = document.querySelector(`.server-icon[data-id="${data.server_id}"]`);
                    if (serverIcon) {
                        let badge = serverIcon.querySelector('.unread-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'unread-badge';
                            badge.innerText = '1';
                            serverIcon.appendChild(badge);
                        } else {
                            badge.innerText = parseInt(badge.innerText) + 1;
                        }
                    }
                }
                break;

            case 'private':
                const isCurrentDM = (String(state.activeDmUserId) === String(data.sender_id)) || (String(state.activeDmUserId) === String(data.receiver_id));
                
                if (isCurrentDM) {
                    appendMessage(data);
                } else if (String(data.sender_id) !== String(state.userId)) {
                    notify.info(`📩 Nouveau message de ${data.sender}`);

                    const friendIcon = document.querySelector(`.friend-item[data-id="${data.sender_id}"]`);
                    if (friendIcon) {
                        let badge = friendIcon.querySelector('.unread-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'unread-badge';
                            badge.innerText = '1';
                            friendIcon.appendChild(badge);
                        } else {
                            badge.innerText = parseInt(badge.innerText) + 1;
                        }
                    } else {
                        loadFriendsList();
                    }
                }
                break;

            case 'member_join':
                if (data.server_id === state.activeServerId) {
                    await loadServerMembers(data.server_id);
                    
                    notify.info(`👤 ${data.nickname} vient de rejoindre le serveur !`);
                }
                break;

            case 'friend_request':
                if (String(data.target_id) === String(state.userId)) {
                    await loadFriendsList();
                    
                    notify.success("🤝 Vous avez reçu une nouvelle demande d'ami !");
                    
                    const btnHome = document.getElementById('btnHome');
                    if (btnHome) btnHome.classList.add('has-notification');
                }
                break;

            case 'friend_accept':
                if (String(data.sender_id) === String(state.userId)) {
                    
                    notify.success(`✅ Vous êtes maintenant ami avec un nouvel utilisateur !`);
                    await loadFriendsList();
                } else if (String(data.target_id) === String(state.userId)) {
                    
                    await loadFriendsList();
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

            case 'avatar_update':
                updateAllAvatarsInDOM(data.user_id, data.avatar);
                break;

            default:
                
                break;
        }
    };

    state.socket.onclose = (event) => {
        if (state.userId && event.code !== 1000) {
            
            setTimeout(connectWS, 3000);
        }
    };

    state.socket.onerror = () => state.socket.close();
}