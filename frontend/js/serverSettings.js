import { loadComponent } from './utils.js';
import { state } from './state.js';
import { openCropper } from './cropper.js';
import { notify } from './notifications.js';

let currentAvatarBase64 = "";

export async function openServerSettings(serverId, serverName, serverAvatar) {
    currentAvatarBase64 = "";

    const modalContainer = document.getElementById('modalContainer');

    const html = await loadComponent('/frontend/components/contexts/serverSettings.html');
    modalContainer.innerHTML = html;
    modalContainer.style.display = 'flex';

    document.getElementById('settingsServerNameTitle').innerText = serverName;
    document.getElementById('settingsServerNameInput').value = serverName;

    const initials = document.querySelector('.settings-avatar-initials');
    const avatarWrapper = document.getElementById('settingsAvatarPreview');

    if (serverAvatar && serverAvatar.trim() !== "") {
        if (initials) initials.style.display = 'none';
        if (avatarWrapper) {
            avatarWrapper.style.backgroundImage = `url(${serverAvatar})`;
            avatarWrapper.style.backgroundSize = 'cover';
            avatarWrapper.style.backgroundPosition = 'center';
            avatarWrapper.style.backgroundColor = 'transparent';
        }
    } else {
        if (initials) initials.innerText = serverName.charAt(0).toUpperCase();
    }

    setupCloseButton(modalContainer);

    setupTabs(serverId);

    setupOverviewActions(serverId, serverName);
}

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

            if (tab.dataset.tab === 'members') loadMembersSettings(serverId);
            if (tab.dataset.tab === 'moderation') loadModerationSettings(serverId);
        };
    });
}

function setupOverviewActions(serverId, oldName) {
    const avatarWrapper = document.getElementById('settingsAvatarPreview');
    const fileInput = document.getElementById('serverAvatarInput');
    const initials = avatarWrapper?.querySelector('.settings-avatar-initials');

    if (avatarWrapper && fileInput) {
        avatarWrapper.onclick = () => fileInput.click();

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                notify.error("L'image de base est trop lourde ! (Max 5Mo)");
                return;
            }

            openCropper(file, (croppedBase64) => {

                currentAvatarBase64 = croppedBase64;

                avatarWrapper.style.backgroundImage = `url(${currentAvatarBase64})`;
                avatarWrapper.style.backgroundSize = 'cover';
                avatarWrapper.style.backgroundPosition = 'center';
                if (initials) initials.style.display = 'none';

            });

            fileInput.value = '';
        };
    }

    const saveBtn = document.getElementById('saveOverviewBtn');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const newName = document.getElementById('settingsServerNameInput').value.trim();

            if (!newName) {
                notify.error("Le nom du serveur ne peut pas être vide.");
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
                    notify.success("Serveur mis à jour avec succès !");

                    const { loadServers, selectServer } = await import('./server.js');
                    await loadServers();

                    if (state.activeServerId === serverId) {
                        await selectServer(serverId);
                    }

                    document.getElementById('closeServerSettings').click();
                } else {
                    const errText = await response.text();
                    notify.error("Erreur : " + errText);
                }
            } catch (err) {
                
                notify.error("Erreur de connexion avec le serveur.");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerText = "Enregistrer les modifications";
            }
        };
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
                        notify.success("Serveur supprimé.");
                        setTimeout(() => window.location.reload(), 1500); 
                    } else {
                        const errText = await res.text();
                        notify.error("Erreur : " + errText);
                    }
                } catch (err) { notify.error("Erreur lors de la suppression"); }
            } else if (confirmName !== null) {
                notify.info("Le nom ne correspond pas. Suppression annulée.");
            }
        };
    }
}

async function loadMembersSettings(serverId) {
    const list = document.getElementById('settingsMembersList');
    if (!list) return;

    list.innerHTML = "<p>Chargement des membres...</p>";

    try {
        const response = await fetch(`/api/server-members?server_id=${serverId}`);
        if (!response.ok) throw new Error("Erreur");

        const members = await response.json();
        list.innerHTML = '';

        members.forEach(member => {
            const avatarSrc = member.avatar || '/frontend/assets/img/default_avatar.png';
            const isAdmin = member.role === 'admin' ? 'selected' : '';
            const isMember = member.role === 'member' ? 'selected' : '';

            const item = document.createElement('div');
            item.className = 'settings-member-item';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${avatarSrc}" width="32" height="32" style="border-radius: 50%; object-fit: cover;">
                    <span style="font-weight: bold;">${member.nickname}</span>
                </div>
                <select class="discord-select" id="role-select-${member.id}">
                    <option value="member" ${isMember}>Membre</option>
                    <option value="admin" ${isAdmin}>Administrateur</option>
                </select>
            `;
            list.appendChild(item);

            const selectEl = document.getElementById(`role-select-${member.id}`);
            selectEl.onchange = async () => {
                const newRole = selectEl.value;
                try {
                    const res = await fetch('/api/servers/update-role', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            server_id: serverId,
                            target_id: member.id,
                            role: newRole
                        })
                    });

                    if (res.ok) {
                        notify.success("Rôle mis à jour avec succès.");
                    } else {
                        const err = await res.text();
                        notify.error("Erreur : " + err);
                        selectEl.value = member.role; 
                    }
                } catch (e) {
                    notify.error("Erreur de connexion.");
                    selectEl.value = member.role; 
                }
            };
        });

    } catch (e) {
        list.innerHTML = "<p>Erreur lors du chargement des membres.</p>";
    }
}

async function loadModerationSettings(serverId) {
    const list = document.getElementById('settingsModerationList');
    if (!list) return;

    list.innerHTML = "<p>Chargement des membres...</p>";

    try {
        
        const response = await fetch(`/api/server-members?server_id=${serverId}`);
        if (!response.ok) throw new Error("Erreur");

        const members = await response.json();
        list.innerHTML = ''; 

        members.forEach(member => {
            
            if (String(member.id) === String(state.userId)) return;

            const avatarSrc = member.avatar || '/frontend/assets/img/default_avatar.png';

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

            document.getElementById(`mute-btn-${member.id}`).onclick = async () => {
                const duration = document.getElementById(`mute-duration-${member.id}`).value;
                await moderateUser('/api/servers/mute', serverId, member.id, { duration });
                notify.success(`${member.nickname} a été rendu muet pour ${duration}.`);
            };

            document.getElementById(`ban-btn-${member.id}`).onclick = async () => {
                if (!confirm(`Voulez-vous vraiment bannir ${member.nickname} ?`)) return;
                await moderateUser('/api/servers/ban', serverId, member.id, {});
                item.remove(); 
                notify.success(`${member.nickname} a été banni définitivement.`);
            };
        });

    } catch (e) {
        list.innerHTML = "<p>Erreur lors du chargement des membres.</p>";
    }
}

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
            notify.error("Erreur de modération : " + err);
        }
    } catch (e) {
        notify.error("Erreur de connexion");
    }
}
