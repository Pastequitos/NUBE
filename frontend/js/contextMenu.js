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
        const serverMenu = document.getElementById('serverContextMenu');
        const userMenu = document.getElementById('userContextMenu');
        
        const inviteBtn = e.target.closest('#serverMenuInvite');

        // Si on clique sur le bouton "Inviter" du menu contextuel
        if (inviteBtn && serverMenu) {
            e.preventDefault();
            const targetServerId = serverMenu.dataset.serverId;
            // 🌟 On récupère le nom du serveur stocké dans le dataset
            const targetServerName = serverMenu.dataset.serverName || "ce serveur";

            if (targetServerId) {
                // 🌟 On passe bien l'ID et le NOM à ta modale !
                openInviteModal(targetServerId, targetServerName);
            }

            serverMenu.style.display = 'none';
            return;
        }

        // Si on clique n'importe où ailleurs, on ferme les menus
        if (serverMenu) serverMenu.style.display = 'none';
        if (userMenu) userMenu.style.display = 'none';
    });
}

export function showServerContextMenu(e, serverId, serverName) {
    e.preventDefault(); 

    const serverMenu = document.getElementById('serverContextMenu');
    if (!serverMenu) return;

    serverMenu.style.display = 'block';
    serverMenu.style.left = `${e.pageX}px`;
    serverMenu.style.top = `${e.pageY}px`;

    serverMenu.dataset.serverId = serverId;
    serverMenu.dataset.serverName = serverName;
}