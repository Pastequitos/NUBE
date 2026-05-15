// server.js
import { state } from './state.js';
import { initContextMenus, showServerContextMenu } from './contextMenu.js';
import { loadComponent } from './utils.js';
import { loadServerHistory, blockChatTemporarily } from './messages.js'; 
import { loadServerMembers } from './users.js';

let isLoadingServers = false;

export const loadServers = async () => {
    if (isLoadingServers) return;

    const serverList = document.getElementById('serverList');
    if (!serverList) return;

    serverList.innerHTML = '';
    isLoadingServers = true;

    try {
        const response = await fetch('/api/my-servers');
        if (!response.ok) {
            isLoadingServers = false;
            return;
        }

        const servers = await response.json();
        state.servers = servers;

        const unreadRes = await fetch('/api/notifications/unread');
        let unreadCounts = {};
        if (unreadRes.ok) {
            unreadCounts = await unreadRes.json();
        }

        await initContextMenus();
        const iconTemplate = await loadComponent('/frontend/components/serversContainer/serverIcon.html');

        if (servers && servers.length > 0) {
            const fragment = document.createDocumentFragment();

            servers.forEach(server => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = iconTemplate;
                const iconElement = tempDiv.firstElementChild;
            
                const initialsEl = iconElement.querySelector('.server-initials');
                const bgEl = iconElement.querySelector('.server-bg');
                iconElement.dataset.id = server.id;
            
                if (server.avatar && server.avatar.trim() !== "") {
                    initialsEl.style.display = 'none';
                    bgEl.style.backgroundImage = `url(${server.avatar})`;
                    bgEl.style.backgroundSize = 'cover';
                    bgEl.style.backgroundPosition = 'center';
                    bgEl.style.backgroundColor = 'transparent';
                } else {
                    initialsEl.innerText = server.name.charAt(0).toUpperCase();
                    initialsEl.style.display = 'flex';
                    bgEl.style.backgroundColor = server.color || '#5865F2';
                    bgEl.style.backgroundImage = 'none';
                }

                const s = server.member_count > 1 ? "s" : "";
                iconElement.querySelector('.server-tooltip').innerText = `${server.name} (${server.member_count} membre${s})`;

                if (unreadCounts[server.id] && unreadCounts[server.id] > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'unread-badge';
                    badge.innerText = unreadCounts[server.id] > 9 ? '9+' : unreadCounts[server.id];
                    iconElement.appendChild(badge);
                }

                iconElement.addEventListener('click', () => selectServer(server.id, server.name));
                iconElement.addEventListener('contextmenu', (e) => showServerContextMenu(e, server.id, server.name));

                fragment.appendChild(iconElement);
            });

            serverList.appendChild(fragment);
        }
    } catch (err) {
        console.error("Erreur loadServers:", err);
    } finally {
        isLoadingServers = false;
    }
};

export async function selectServer(serverId, serverName = null) {
    if (!serverId) return;

    // Récupérer les infos complètes du serveur dans le state
    const server = state.servers ? state.servers.find(s => String(s.id) === String(serverId)) : null;
    const finalName = serverName || (server ? server.name : "Serveur inconnu");

    state.activeServerId = serverId;
    state.activeDmUserId = null;

    const header = document.getElementById('currentServerName');
    if (header) {
        // 🌟 NOUVELLE LOGIQUE DE HEADER : Icône + Nom
        header.innerHTML = ''; // On vide le "# Nom"
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '10px';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'header-server-icon';
        // Style de base pour l'icône dans le header
        iconDiv.style.width = '24px';
        iconDiv.style.height = '24px';
        iconDiv.style.borderRadius = '50%';
        iconDiv.style.display = 'flex';
        iconDiv.style.alignItems = 'center';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.fontSize = '12px';
        iconDiv.style.fontWeight = 'bold';
        iconDiv.style.color = 'white';
        iconDiv.style.flexShrink = '0';

        if (server && server.avatar && server.avatar.trim() !== "") {
            // Image si elle existe
            iconDiv.style.backgroundImage = `url(${server.avatar})`;
            iconDiv.style.backgroundSize = 'cover';
            iconDiv.style.backgroundPosition = 'center';
        } else {
            // Initiale + Couleur si pas d'image
            iconDiv.style.backgroundColor = server ? server.color : '#5865F2';
            iconDiv.innerText = finalName.charAt(0).toUpperCase();
        }

        const nameSpan = document.createElement('span');
        nameSpan.innerText = finalName;

        header.appendChild(iconDiv);
        header.appendChild(nameSpan);
    }

    const serverIcon = document.querySelector(`.server-icon[data-id="${serverId}"]`);
    if (serverIcon) {
        const badge = serverIcon.querySelector('.unread-badge');
        if (badge) badge.remove();
    }

    await loadServerHistory(serverId);
    await loadServerMembers(serverId);

    try {
        const res = await fetch(`/api/servers/role?server_id=${serverId}`);
        if (res.ok) {
            const data = await res.json();
            if (typeof blockChatTemporarily === 'function') {
                blockChatTemporarily(data.is_muted, data.until);
            }
        }
    } catch (err) {
        console.error("Erreur check role/mute:", err);
    }

    fetch('/api/users/last-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId })
    });
}

window.selectServer = selectServer;