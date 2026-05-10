import { loadComponent } from './utils.js';
import { state } from './state.js';
import { openCropper } from './cropper.js';

// Variable globale au fichier pour stocker l'image encodée
let currentAvatarBase64 = "";

export async function openServerSettings(serverId, serverName) {
    currentAvatarBase64 = ""; // On réinitialise à chaque ouverture

    const modalContainer = document.getElementById('modalContainer');
    
    // 1. Charger le HTML
    const html = await loadComponent('/frontend/components/contexts/serverSettings.html');
    modalContainer.innerHTML = html;
    modalContainer.style.display = 'flex';

    // 2. Initialisation des textes et de l'initiale
    document.getElementById('settingsServerNameTitle').innerText = serverName;
    document.getElementById('settingsServerNameInput').value = serverName;
    
    const initials = document.querySelector('.settings-avatar-initials');
    if (initials) initials.innerText = serverName.charAt(0).toUpperCase();
    
    // 3. Gestion de la fermeture
    setupCloseButton(modalContainer);

    // 4. Gestion de la navigation entre les onglets
    setupTabs(serverId);

    // 5. Initialisation des actions de l'onglet "Aperçu"
    setupOverviewActions(serverId, serverName);
}

// --- FONCTIONS UTILITAIRES INTERNES ---

function setupCloseButton(modalContainer) {
    const closeBtn = document.getElementById('closeServerSettings');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
        };
    }
}

function setupTabs(serverId) {
    const tabs = document.querySelectorAll('.settings-tab');
    const panes = document.querySelectorAll('.settings-pane');

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
            if (targetPane) targetPane.classList.add('active');

            if (tab.dataset.tab === 'members') loadMockMembersSettings(serverId);
            if (tab.dataset.tab === 'moderation') loadMockModerationSettings(serverId);
        };
    });
}

function setupOverviewActions(serverId, oldName) {
    const avatarWrapper = document.getElementById('settingsAvatarPreview');
    const fileInput = document.getElementById('serverAvatarInput');
    const initials = avatarWrapper?.querySelector('.settings-avatar-initials');
    
    // 🌟 GESTION DE LA PHOTO
    if (avatarWrapper && fileInput) {
        avatarWrapper.onclick = () => fileInput.click();
        
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                alert("L'image de base est trop lourde ! (Max 5Mo)");
                return;
            }

            // 🌟 CORRECTION : On envoie directement le Fichier (File) à ton cropper !
            // Plus besoin de FileReader ici, ton cropper s'en charge.
            openCropper(file, (croppedBase64) => {
                
                // Une fois recadrée, on stocke la vraie image finale
                currentAvatarBase64 = croppedBase64;
                
                // Et on met à jour l'aperçu visuel !
                avatarWrapper.style.backgroundImage = `url(${currentAvatarBase64})`;
                avatarWrapper.style.backgroundSize = 'cover';
                avatarWrapper.style.backgroundPosition = 'center';
                if (initials) initials.style.display = 'none';
                
            });
            
            // On réinitialise l'input
            fileInput.value = '';
        };
    }

    // 🌟 GESTION DE LA SAUVEGARDE
    const saveBtn = document.getElementById('saveOverviewBtn');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const newName = document.getElementById('settingsServerNameInput').value.trim();
            
            if (!newName) {
                alert("Le nom du serveur ne peut pas être vide.");
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerText = "Enregistrement...";

            try {
                const response = await fetch('/api/servers/update-overview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        server_id: serverId,
                        name: newName,
                        avatar: currentAvatarBase64
                    })
                });

                if (response.ok) {
                    alert("Serveur mis à jour avec succès !");
                    
                    // Mise à jour de l'interface en direct
                    const header = document.getElementById('currentServerName');
                    if (header && state.activeServerId === serverId) {
                        header.innerText = `# ${newName}`;
                    }

                    // On recharge la liste des serveurs à gauche
                    const { loadServers } = await import('./server.js');
                    await loadServers();

                    // Fermer la modale
                    document.getElementById('closeServerSettings').click();
                } else {
                    const errText = await response.text();
                    alert("Erreur : " + errText);
                }
            } catch (err) {
                console.error("Erreur réseau :", err);
                alert("Erreur de connexion avec le serveur.");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerText = "Enregistrer les modifications";
            }
        };
    }
}


function loadMockMembersSettings(serverId) {
    const list = document.getElementById('settingsMembersList');
    if (!list) return;

    // Faux HTML pour simuler la liste des membres et leurs rôles
    list.innerHTML = `
        <div class="settings-member-item">
            <div style="display: flex; align-items: center; gap: 10px;">
                <img src="/assets/default_avatar.png" width="32" height="32" style="border-radius: 50%; object-fit: cover;">
                <span style="font-weight: bold;">Un Utilisateur Test</span>
            </div>
            <select class="discord-select" onchange="alert('Rôle modifié (Simulation) !')">
                <option value="user" selected>Membre</option>
                <option value="admin">Administrateur</option>
            </select>
        </div>
    `;
}

async function loadMockModerationSettings(serverId) {
    const list = document.getElementById('settingsModerationList');
    if (!list) return;

    list.innerHTML = "<p>Chargement des membres...</p>";

    try {
        // On récupère la vraie liste des membres du serveur
        const response = await fetch(`/api/server-members?server_id=${serverId}`);
        if (!response.ok) throw new Error("Erreur");
        
        const members = await response.json();
        list.innerHTML = ''; // On vide

        members.forEach(member => {
            // On ne peut pas se modérer soi-même dans l'interface
            if (String(member.id) === String(state.userId)) return;

            const avatarSrc = member.avatar || '/assets/default_avatar.png';
            
            const item = document.createElement('div');
            item.className = 'settings-member-item';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${avatarSrc}" width="32" height="32" style="border-radius: 50%; object-fit: cover;">
                    <span style="font-weight: bold;">${member.nickname}</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <select class="discord-select" id="mute-duration-${member.id}">
                        <option value="10m">10 minutes</option>
                        <option value="1h">1 heure</option>
                        <option value="24h">24 heures</option>
                        <option value="infinite">Infini</option>
                    </select>
                    <button class="discord-btn warning" id="mute-btn-${member.id}">Mute</button>
                    <button class="discord-btn danger" id="ban-btn-${member.id}">Bannir</button>
                </div>
            `;
            list.appendChild(item);

            // Action : MUTE
            document.getElementById(`mute-btn-${member.id}`).onclick = async () => {
                const duration = document.getElementById(`mute-duration-${member.id}`).value;
                await moderateUser('/api/servers/mute', serverId, member.id, { duration });
                alert(`${member.nickname} a été muté pour ${duration}.`);
            };

            // Action : BAN
            document.getElementById(`ban-btn-${member.id}`).onclick = async () => {
                if (!confirm(`Voulez-vous vraiment bannir ${member.nickname} ?`)) return;
                await moderateUser('/api/servers/ban', serverId, member.id, {});
                item.remove(); // On enlève la ligne visuellement
                alert(`${member.nickname} a été banni définitivement.`);
            };
        });

    } catch (e) {
        list.innerHTML = "<p>Erreur lors du chargement des membres.</p>";
    }
}

// Petite fonction utilitaire pour envoyer les requêtes de modération
async function moderateUser(endpoint, serverId, targetId, extraBody) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                server_id: serverId,
                target_id: targetId,
                ...extraBody
            })
        });
        
        if (!response.ok) {
            const err = await response.text();
            alert("Erreur de modération : " + err);
        }
    } catch (e) {
        alert("Erreur de connexion");
    }
}

const deleteBtn = document.getElementById('deleteServerBtn');
if (deleteBtn) {
    deleteBtn.onclick = async () => {
        const confirmName = prompt(`Tapez le nom du serveur "${oldName}" pour confirmer la suppression :`);
        
        if (confirmName === oldName) {
            try {
                const res = await fetch('/api/servers/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ server_id: serverId })
                });

                if (res.ok) {
                    alert("Serveur supprimé.");
                    window.location.reload(); // On recharge pour tout rafraîchir
                }
            } catch (err) { alert("Erreur lors de la suppression"); }
        } else {
            alert("Le nom ne correspond pas. Suppression annulée.");
        }
    };
}