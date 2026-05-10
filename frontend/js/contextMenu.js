// contextMenu.js
import { loadComponent } from './utils.js';
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

        const settingsBtn = e.target.closest('#serverMenuSettings');


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

        if (settingsBtn && serverMenu) {
            e.preventDefault();
            console.log("BOUTON PARAMÈTRES CLIQUÉ !"); // 👈 AJOUTE ÇA

            const targetServerId = serverMenu.dataset.serverId;
            const targetServerName = serverMenu.dataset.serverName || "Serveur inconnu";

            if (targetServerId) {
                console.log("ID du serveur trouvé :", targetServerId); // 👈 ET ÇA
                openServerSettings(targetServerId, targetServerName);
            } else {
                console.error("Aïe, aucun ID de serveur trouvé dans le dataset !");
            }

            serverMenu.style.display = 'none';
            return;
        }

        // Si on clique n'importe où ailleurs, on ferme les menus
        if (serverMenu) serverMenu.style.display = 'none';
        if (userMenu) userMenu.style.display = 'none';
    });
}

// contextMenu.js

export async function showServerContextMenu(e, serverId, serverName) {
    e.preventDefault(); 
    const serverMenu = document.getElementById('serverContextMenu');
    const settingsBtn = document.getElementById('serverMenuSettings'); // Vérifie bien cet ID dans ton HTML

    if (!serverMenu) return;

    // Affiche le menu là où on a cliqué
    serverMenu.style.display = 'flex';
    serverMenu.style.left = `${e.pageX}px`;
    serverMenu.style.top = `${e.pageY}px`;
    serverMenu.dataset.serverId = serverId;
    serverMenu.dataset.serverName = serverName;

    // On cache le bouton par défaut le temps de vérifier
    if (settingsBtn) settingsBtn.style.display = 'none';

    try {
        const res = await fetch(`/api/servers/role?server_id=${serverId}`);
        const data = await res.json();

        console.log("Droits reçus :", data); // Vérifie ta console F12 !

        if (data.role === 'admin') {
            if (settingsBtn) settingsBtn.style.display = 'block';
        }

        // Si tu as la fonction de mute, on l'appelle
        if (window.setChatMutedState) {
            window.setChatMutedState(data.is_muted);
        }

    } catch (err) {
        console.error("Erreur droits :", err);
    }
}