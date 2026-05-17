
import { loadComponent, apiFetch } from './utils.js';
import { openInviteModal } from './modals.js';

import { openServerSettings } from './serverSettings.js';

let listenersSetup = false;

export const initContextMenus = async () => {
    if (!document.getElementById('serverContextMenu')) {
        try {
            const menuHTML = await loadComponent('/frontend/components/contexts/serverContextMenu.html');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = menuHTML;
            document.body.appendChild(tempDiv.firstElementChild);
        } catch (e) {  }
    }

    if (!document.getElementById('userContextMenu')) {
        try {
            const userMenuHTML = await loadComponent('/frontend/components/contexts/userContextMenu.html');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = userMenuHTML;
            document.body.appendChild(tempDiv.firstElementChild);
        } catch (e) {  }
    }

    setupContextMenuListeners();
};

function setupContextMenuListeners() {
    if (listenersSetup) return;
    listenersSetup = true;

    document.addEventListener('click', (e) => {
        const serverMenu = document.getElementById('serverContextMenu');
        const userMenu = document.getElementById('userContextMenu');

        const inviteBtn = e.target.closest('#serverMenuInvite');

        const settingsBtn = e.target.closest('#serverMenuSettings');

        if (inviteBtn && serverMenu) {
            e.preventDefault();
            const targetServerId = serverMenu.dataset.serverId;
            
            const targetServerName = serverMenu.dataset.serverName || "ce serveur";

            if (targetServerId) {
                
                openInviteModal(targetServerId, targetServerName);
            }

            serverMenu.style.display = 'none';
            return;
        }

        if (settingsBtn && serverMenu) {
            e.preventDefault();

            const targetServerId = serverMenu.dataset.serverId;
            const targetServerName = serverMenu.dataset.serverName || "Serveur inconnu";
            const targetServerAvatar = serverMenu.dataset.serverAvatar || "";

            if (targetServerId) {
                 
                openServerSettings(targetServerId, targetServerName, targetServerAvatar);
            } else {
                
            }

            serverMenu.style.display = 'none';
            return;
        }

        if (serverMenu) serverMenu.style.display = 'none';
        if (userMenu) userMenu.style.display = 'none';
    });
}

export async function showServerContextMenu(e, serverId, serverName, serverAvatar) {
    e.preventDefault(); 
    const serverMenu = document.getElementById('serverContextMenu');
    const settingsBtn = document.getElementById('serverMenuSettings'); 

    if (!serverMenu) return;

    serverMenu.style.display = 'flex';
    serverMenu.style.left = `${e.pageX}px`;
    serverMenu.style.top = `${e.pageY}px`;
    serverMenu.dataset.serverId = serverId;
    serverMenu.dataset.serverName = serverName;
    serverMenu.dataset.serverAvatar = serverAvatar || '';

    if (settingsBtn) settingsBtn.style.display = 'none';

    const { ok, data } = await apiFetch(`/api/servers/role?server_id=${serverId}`, {}, false);
    if (ok) {
        if (data.role === 'admin') {
            if (settingsBtn) settingsBtn.style.display = 'block';
        }

        if (window.setChatMutedState) {
            window.setChatMutedState(data.is_muted);
        }
    }
}