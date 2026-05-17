
import { loadComponent, apiFetch, closeModalWithAnimation } from './utils.js';
import { loadServers } from './server.js';

import { notify } from './notifications.js';
import { addLiquidGlassElement, applyLiquidGlass } from './liquidGlass.js';
import { loadPrivateHistory } from './messages.js';

export function setupModalListeners() {
    const openBtn = document.getElementById('openModalBtn');
    const modal = document.getElementById('modalContainer');

    setupModalDelegation();

    if (openBtn && modal) {
        openBtn.onclick = async () => {
            modal.innerHTML = await loadComponent('/frontend/components/modalContainer/createServer.html');
            modal.style.display = 'flex';

            const serverCard = modal.firstElementChild;

            if (serverCard) {
                applyLiquidGlass(serverCard, {
                    radius: 42.0,
                    bezel: 42.0,
                    thickness: 50.0,
                    ior: 2.2,
                    brightness: 1.2,
                    tint: 0.1,
                    interactive: false
                });
            }

            const form = document.getElementById('createServerForm');
            const serverNameInput = document.getElementById('serverNameInput');
            const joinInput = document.getElementById('joinServerInput');
            const joinBtn = document.getElementById('joinServerSubmitBtn');
            const closeModalBtn = document.getElementById('closeModalBtn');

            const closeModal = () => closeModalWithAnimation(modal);

            if (closeModalBtn) closeModalBtn.onclick = closeModal;

            window.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });

            if (form) {
                form.onsubmit = async (e) => {
                    e.preventDefault();
                    const serverName = serverNameInput ? serverNameInput.value.trim() : "";
                    if (!serverName) return;

                    const checkedColorInput = document.querySelector('input[name="serverColor"]:checked');
                    const selectedColor = checkedColorInput ? checkedColorInput.value : "#5865F2";

                    const { ok } = await apiFetch('/api/servers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: serverName, color: selectedColor })
                    });

                    if (ok) {
                        closeModal();
                        notify.success(`Le serveur "${serverName}" a été créé avec success !`);
                        await loadServers();
                    }
                };
            }

            if (joinBtn && joinInput) {
                joinBtn.onclick = async (e) => {
                    e.preventDefault();
                    const token = joinInput.value.trim();
                    if (!token) {
                        notify.info("Veuillez entrer un lien ou un code d'invitation.");
                        return;
                    }

                    const { ok, data } = await apiFetch('/api/join', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: token })
                    });

                    if (ok) {
                        if (data.already_joined) {
                            notify.info(`Vous êtes déjà membre de ${data.server_name}. Redirection...`);
                        } else {
                            notify.success(`Vous avez rejoint ${data.server_name} avec succès !`);
                        }

                        closeModal();
                        await loadServers();
                    }
                };
            }
        };
    }
}

export async function openInviteModal(serverId, serverName) {
    const modalContainer = document.getElementById('modalContainer');
    if (!modalContainer) return;

    try {
        const modalHTML = await loadComponent('/frontend/components/modalContainer/inviteServer.html');
        modalContainer.innerHTML = modalHTML;
        modalContainer.style.display = 'flex';

        const inviteCard = modalContainer.firstElementChild;

        if (inviteCard) {
            applyLiquidGlass(inviteCard, {
                radius: 38.0,
                bezel: 38.0,
                thickness: 50.0,
                ior: 2.2,
                brightness: 1.2,
                tint: 0.1,
                interactive: false
            });
        }

        const serverNameEl = document.getElementById('inviteServerName');
        if (serverNameEl) {
            serverNameEl.innerText = serverName ? serverName : "ce serveur";
        }

        const closeModal = () => closeModalWithAnimation(modalContainer);

        modalContainer.onclick = (e) => {
            if (e.target === modalContainer || e.target.closest('#closeInviteModalBtn') || e.target.closest('#closeModalBtn')) {
                closeModal();
            }
        };

        const inputLink = document.getElementById('inviteLinkInput');
        if (inputLink) {
            inputLink.value = "Génération du lien...";

            const { ok, data } = await apiFetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server_id: serverId })
            }, false);

            if (ok) {
                inputLink.value = `${window.location.origin}/join/${data.token}`;
            } else {
                inputLink.value = "Erreur de génération.";
                notify.error("Impossible de générer un lien d'invitation.");
            }
        }

        const copyBtn = document.getElementById('copyInviteBtn');
        if (copyBtn && inputLink) {
            copyBtn.onclick = () => {
                inputLink.select();
                document.execCommand('copy');
                copyBtn.innerText = 'Copié !';
                copyBtn.style.backgroundColor = '#23a559';

                notify.success("Lien d'invitation copié dans le presse-papier !");

                setTimeout(() => {
                    copyBtn.innerText = 'Copier';
                    copyBtn.style.backgroundColor = '';
                }, 2000);
            };
        }
    } catch (err) {

    }
}

export function setupModalDelegation() {
    const modal = document.getElementById('modalContainer');
    if (!modal) return;

    modal.addEventListener('click', (e) => {
        const target = e.target;
        if (target === modal || target.closest('.close-modal-btn') || target.closest('#closeModalBtn') || target.closest('#closeServerSettings') || target.closest('#closeInviteModalBtn')) {
            closeModalWithAnimation(modal);
            return;
        }

        const dmBtn = target.closest('[data-action="dm-user"]');
        if (dmBtn) {
            const { id, nickname, avatar } = dmBtn.dataset;
            loadPrivateHistory(id, nickname, avatar);
            closeModalWithAnimation(modal);

            apiFetch('/api/users/mark-private-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: id })
            }, false);

            const friendItem = document.querySelector(`.friend-item[data-id="${id}"]`);
            if (friendItem) {
                const badge = friendItem.querySelector('.unread-badge');
                if (badge) badge.remove();
            }
        }
    });
}