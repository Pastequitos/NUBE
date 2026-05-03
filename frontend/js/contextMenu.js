// contextMenu.js
import { loadComponent } from './utils.js';
import { openInviteModal } from './modals.js';

let listenersSetup = false;

export const initContextMenus = async () => {
    if (!document.getElementById('serverContextMenu')) {
        try {
            const menuHTML = await loadComponent('/frontend/components/contexts/serverContextMenu.html');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = menuHTML;
            document.body.appendChild(tempDiv.firstElementChild);
        } catch (e) { console.warn("Menu contextuel serveur introuvable"); }
    }

    if (!document.getElementById('userContextMenu')) {
        try {
            const userMenuHTML = await loadComponent('/frontend/components/contexts/userContextMenu.html');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = userMenuHTML;
            document.body.appendChild(tempDiv.firstElementChild);
        } catch (e) { console.warn("Menu contextuel utilisateur introuvable"); }
    }

    setupContextMenuListeners();
};

function setupContextMenuListeners() {
    if (listenersSetup) return;
    listenersSetup = true;

    document.addEventListener('click', (e) => {
        const inviteBtn = e.target.closest('#serverMenuInvite');

        if (inviteBtn) {
            e.preventDefault();
            const serverMenu = document.getElementById('serverContextMenu');
            const targetServerId = serverMenu ? serverMenu.dataset.serverId : null;

            if (targetServerId) {
                openInviteModal(targetServerId);
            }

            if (serverMenu) serverMenu.style.display = 'none';
            return;
        }

        const serverMenu = document.getElementById('serverContextMenu');
        const userMenu = document.getElementById('userContextMenu');
        if (serverMenu) serverMenu.style.display = 'none';
        if (userMenu) userMenu.style.display = 'none';
    });
}