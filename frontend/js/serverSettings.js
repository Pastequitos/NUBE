import { loadComponent, apiFetch, closeModalWithAnimation } from './utils.js';
import { addLiquidGlassElement } from './liquidGlass.js';
import { state } from './state.js';
import { openCropper } from './cropper.js';
import { notify } from './notifications.js';
import { createMemberElement } from './users.js';

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

    setupSettingsDelegation(serverId, serverName);

    setupOverviewActions(serverId, serverName);

    // Initialisation du Liquid Glass sur la modale
    const wrapper = modalContainer.querySelector('.settings-modal-wrapper');
    if (wrapper) {
        const uniqueId = `settings-glass-${serverId}`;
        wrapper.id = uniqueId;
        setTimeout(() => {
            addLiquidGlassElement(uniqueId, {
                radius: 42.0,
                bezel: 42.0,
                thickness: 50.0,
                ior: 2.2,
                brightness: 1.2,
                tint: 0.1,
                interactive: false,
                order: 100 // On le force tout en haut du canvas
            });
        }, 10);
    }
}

function setupCloseButton(modalContainer) {
    const closeBtn = document.getElementById('closeServerSettings');
    if (closeBtn) {
        closeBtn.onclick = () => closeModalWithAnimation(modalContainer);
    }
}

export function setupSettingsDelegation(serverId, oldName) {
    const modalContainer = document.getElementById('modalContainer');
    if (!modalContainer) return;

    modalContainer.addEventListener('click', async (e) => {
        const target = e.target;

        // Tabs
        const tab = target.closest('.settings-tab');
        if (tab) {
            const tabs = modalContainer.querySelectorAll('.settings-tab');
            const panes = modalContainer.querySelectorAll('.settings-pane');
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
            if (targetPane) targetPane.classList.add('active');

            if (tab.dataset.tab === 'members') loadMembersSettings(serverId);
            if (tab.dataset.tab === 'moderation') loadModerationSettings(serverId);
            return;
        }

        // Close Modal
        if (target.closest('#closeServerSettings')) {
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
            return;
        }

        // Mute member
        const muteBtn = target.closest('[data-action="mute-member"]');
        if (muteBtn) {
            const memberId = muteBtn.dataset.id;
            const duration = document.getElementById(`mute-duration-${memberId}`).value;
            await moderateUser('/api/servers/mute', serverId, memberId, { duration });
            notify.success(`Action de mute effectuée.`);
            return;
        }

        // Ban member
        const banBtn = target.closest('[data-action="ban-member"]');
        if (banBtn) {
            const memberId = banBtn.dataset.id;
            if (!confirm(`Voulez-vous vraiment bannir ce membre ?`)) return;
            await moderateUser('/api/servers/ban', serverId, memberId, {});
            banBtn.closest('.settings-member-item').remove();
            notify.success(`Membre banni.`);
            return;
        }
    });

    modalContainer.addEventListener('change', async (e) => {
        if (e.target.dataset.action === 'change-role') {
            const memberId = e.target.dataset.id;
            const newRole = e.target.value;
            const { ok } = await apiFetch('/api/servers/update-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server_id: serverId, target_id: memberId, role: newRole })
            });
            if (ok) notify.success("Rôle mis à jour.");
        }
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

            const { ok, data } = await apiFetch('/api/servers/update-overview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server_id: serverId,
                    name: newName,
                    avatar: currentAvatarBase64
                })
            });

            if (ok) {
                notify.success("Serveur mis à jour avec succès !");

                const { loadServers, selectServer } = await import('./server.js');
                await loadServers();

                if (state.activeServerId === serverId) {
                    await selectServer(serverId);
                }

                document.getElementById('closeServerSettings').click();
            }

            saveBtn.disabled = false;
            saveBtn.innerText = "Enregistrer les modifications";
        };
    }

    const deleteBtn = document.getElementById('deleteServerBtn');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            const confirmName = prompt(`Tapez le nom du serveur "${oldName}" pour confirmer la suppression :`);

            if (confirmName === oldName) {
                const { ok } = await apiFetch('/api/servers/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ server_id: serverId })
                });

                if (ok) {
                    notify.success("Serveur supprimé.");
                    setTimeout(() => window.location.reload(), 1500);
                }
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

    const { ok, data: members } = await apiFetch(`/api/server-members?server_id=${serverId}`, {}, false);
    if (!ok) {
        list.innerHTML = "<p>Erreur lors du chargement des membres.</p>";
        return;
    }

    list.innerHTML = '';

    members.forEach(member => {
        const { element } = createMemberElement(member, {
            className: 'settings-member-item',
            showStatus: false
        });

        const controls = document.createElement('select');
        controls.className = 'discord-select';
        controls.dataset.action = 'change-role';
        controls.dataset.id = member.id;

        const isAdmin = member.role === 'admin' ? 'selected' : '';
        const isMember = member.role === 'member' ? 'selected' : '';
        controls.innerHTML = `
                <option value="member" ${isMember}>Membre</option>
                <option value="admin" ${isAdmin}>Administrateur</option>
            `;

        element.appendChild(controls);
        list.appendChild(element);
    });
}

async function loadModerationSettings(serverId) {
    const list = document.getElementById('settingsModerationList');
    if (!list) return;

    list.innerHTML = "<p>Chargement des membres...</p>";

    const { ok, data: members } = await apiFetch(`/api/server-members?server_id=${serverId}`, {}, false);
    if (!ok) {
        list.innerHTML = "<p>Erreur lors du chargement des membres.</p>";
        return;
    }

    list.innerHTML = '';

    members.forEach(member => {
        if (String(member.id) === String(state.userId)) return;

        const { element } = createMemberElement(member, {
            className: 'settings-member-item',
            showStatus: false
        });

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.innerHTML = `
                <select class="discord-select" id="mute-duration-${member.id}">
                        <option value="10m">10 minutes</option>
                        <option value="1h">1 heure</option>
                        <option value="24h">24 heures</option>
                        <option value="infinite">Infini</option>
                    </select>
                    <button class="discord-btn warning" data-action="mute-member" data-id="${member.id}">Mute</button>
                    <button class="discord-btn danger" data-action="ban-member" data-id="${member.id}">Bannir</button>
                </div>
            `;

        element.appendChild(controls);
        list.appendChild(element);
    });
}


async function moderateUser(endpoint, serverId, targetId, extraBody) {
    await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            server_id: serverId,
            target_id: targetId,
            ...extraBody
        })
    });
}
