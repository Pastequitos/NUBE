import { state } from './state.js';
import { initContextMenus } from './contextMenu.js';
import { loadComponent } from './utils.js';
import { loadServerHistory } from './messages.js';
import { loadServerMembers } from './users.js';


export const loadServers = async () => {
    try {
        const response = await fetch('/api/my-servers');
        if (!response.ok) return;
        const servers = await response.json();
        const serverList = document.getElementById('serverList');
        if (!serverList) return;

        serverList.innerHTML = '';
        await initContextMenus();

        const iconTemplate = await loadComponent('/frontend/components/serversContainer/serverIcon.html');

        if (servers && servers.length > 0) {
            servers.forEach(server => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = iconTemplate;
                const iconElement = tempDiv.firstElementChild;

                iconElement.querySelector('.server-initials').innerText = server.name.charAt(0).toUpperCase();
                iconElement.querySelector('.server-bg').style.backgroundColor = server.color;
                iconElement.dataset.id = server.id;

                const s = server.member_count > 1 ? "s" : "";
                iconElement.querySelector('.server-tooltip').innerText = `${server.name} (${server.member_count} membre${s})`;

                iconElement.addEventListener('click', () => selectServer(server.id, server.name));

                iconElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const menu = document.getElementById('serverContextMenu');
                    if (menu) {
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
        console.error(err);
    }
};

export async function selectServer(serverId, serverName) {
    state.activeServerId = serverId;
    const header = document.getElementById('currentServerName');
    if (header) header.innerText = `${serverName}`;
    await loadServerHistory(serverId);
    await loadServerMembers(serverId);
}

window.selectServer = selectServer;