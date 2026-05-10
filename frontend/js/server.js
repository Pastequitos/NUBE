// server.js
import { state } from './state.js';
import { initContextMenus, showServerContextMenu } from './contextMenu.js';
import { loadComponent } from './utils.js';
// 🌟 On importe blockChatTemporarily à la place de l'ancienne fonction
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

        // On va chercher les compteurs de messages non lus pour les serveurs
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

                iconElement.querySelector('.server-initials').innerText = server.name.charAt(0).toUpperCase();
                iconElement.querySelector('.server-bg').style.backgroundColor = server.color;
                iconElement.dataset.id = server.id;

                const s = server.member_count > 1 ? "s" : "";
                iconElement.querySelector('.server-tooltip').innerText = `${server.name} (${server.member_count} membre${s})`;

                // Ajout de la pastille si besoin
                if (unreadCounts[server.id] && unreadCounts[server.id] > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'unread-badge';
                    badge.innerText = unreadCounts[server.id] > 9 ? '9+' : unreadCounts[server.id];
                    iconElement.appendChild(badge);
                }

                iconElement.addEventListener('click', () => selectServer(server.id, server.name));

                // Menu contextuel au clic droit
                iconElement.addEventListener('contextmenu', (e) => {
                    showServerContextMenu(e, server.id, server.name);
                });

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

    let finalName = serverName;
    if (!finalName && state.servers) {
        const found = state.servers.find(s => String(s.id) === String(serverId));
        finalName = found ? found.name : "Serveur inconnu";
    }

    state.activeServerId = serverId;
    state.activeDmUserId = null;

    const header = document.getElementById('currentServerName');
    if (header) header.innerText = `# ${finalName}`;

    // On supprime visuellement la pastille sur le serveur cliqué
    const serverIcon = document.querySelector(`.server-icon[data-id="${serverId}"]`);
    if (serverIcon) {
        const badge = serverIcon.querySelector('.unread-badge');
        if (badge) badge.remove();
    }

    await loadServerHistory(serverId);
    await loadServerMembers(serverId);

    // 🌟 SYNC MUTE ET RÔLE AU CHARGEMENT / REFRESH
    try {
        const res = await fetch(`/api/servers/role?server_id=${serverId}`);
        if (res.ok) {
            const data = await res.json();
            
            // 🌟 On utilise ta fonction de blocage avec l'état is_muted et la date until
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