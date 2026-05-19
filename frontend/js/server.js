
import { state } from './state.js';
import { initContextMenus, showServerContextMenu } from './contextMenu.js';
import { loadComponent, apiFetch } from './utils.js';
import { loadHistory, blockChatTemporarily } from './messages.js';
import { loadServerMembers } from './users.js';
import { addLiquidGlassElement } from './liquidGlass.js';


let isLoadingServers = false;

export const loadServers = async () => {
    if (isLoadingServers) return;

    const serverList = document.getElementById('serverList');
    if (!serverList) return;

    serverList.innerHTML = '';
    isLoadingServers = true;

    try {
        const { ok, data: servers } = await apiFetch('/api/my-servers', {}, false);
        if (!ok) {
            isLoadingServers = false;
            return;
        }

        state.servers = servers;

        const { ok: unreadOk, data: unreadData } = await apiFetch('/api/notifications/unread', {}, false);
        let unreadCounts = unreadOk ? unreadData : {};

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

                const uniqueId = `serverIcon_${server.id}`;
                iconElement.id = uniqueId;
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

                    const hex = server.color || '#5865F2';
                    const rgb = hexToRgb(hex);
                    bgEl.style.backgroundColor = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : 'rgba(88, 101, 242, 0.15)';
                    bgEl.style.backgroundImage = 'none';
                    bgEl.style.border = `1px solid ${hex}`;
                }

                const s = server.member_count > 1 ? "s" : "";
                iconElement.querySelector('.server-tooltip').innerText = `${server.name} (${server.member_count} membre${s})`;

                if (unreadCounts[server.id] && unreadCounts[server.id] > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'unread-badge';
                    badge.innerText = unreadCounts[server.id] > 9 ? '9+' : unreadCounts[server.id];
                    iconElement.appendChild(badge);
                }

                fragment.appendChild(iconElement);
            });

            serverList.appendChild(fragment);

            servers.forEach(server => {
                const uniqueId = `serverIcon_${server.id}`;
                addLiquidGlassElement(uniqueId, {
                    radius: 23.0,
                    bezel: 23.0,
                    thickness: 20.0,
                    ior: 1.5,
                    brightness: 0.8,
                    interactive: true,
                    order: 1
                });
            });
        }

    } catch (err) {

    } finally {
        isLoadingServers = false;
    }
};

export async function selectServer(serverId, serverName = null) {
    if (!serverId) return;

    const server = state.servers ? state.servers.find(s => String(s.id) === String(serverId)) : null;
    const finalName = serverName || (server ? server.name : "Serveur inconnu");

    state.activeServerId = serverId;
    state.activeDmUserId = null;

    const header = document.getElementById('currentServerName');
    if (header) {

        header.innerHTML = '';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '10px';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'header-server-icon';

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

            iconDiv.style.backgroundImage = `url(${server.avatar})`;
            iconDiv.style.backgroundSize = 'cover';
            iconDiv.style.backgroundPosition = 'center';
        } else {

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

    await loadHistory('server', serverId);
    await loadServerMembers(serverId);

    const { ok, data } = await apiFetch(`/api/servers/role?server_id=${serverId}`, {}, false);
    if (ok) {
        if (typeof blockChatTemporarily === 'function') {
            blockChatTemporarily(data.is_muted, data.until);
        }
    }

    apiFetch('/api/users/last-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId })
    }, false);

    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.add('is-chat-active');
}

export function setupServerListDelegation() {
    const serverList = document.getElementById('serverList');
    if (!serverList) return;

    serverList.addEventListener('click', (e) => {
        const icon = e.target.closest('.server-icon');
        if (icon) {
            const serverId = icon.dataset.id;
            selectServer(serverId);
        }
    });

    serverList.addEventListener('contextmenu', (e) => {
        const icon = e.target.closest('.server-icon');
        if (icon) {
            e.preventDefault();
            const serverId = icon.dataset.id;
            const server = state.servers ? state.servers.find(s => String(s.id) === String(serverId)) : null;
            if (server) {
                showServerContextMenu(e, server.id, server.name, server.avatar);
            }
        }
    });
}

window.selectServer = selectServer;

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}