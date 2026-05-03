// modals.js
import { loadComponent } from './utils.js';
import { loadServers } from './server.js';

export function setupModalListeners() {
    const openBtn = document.getElementById('openModalBtn');
    const modal = document.getElementById('modalContainer');

    if (openBtn && modal) {
        openBtn.onclick = async () => {
            modal.innerHTML = await loadComponent('/frontend/components/modalContainer/createServer.html');
            modal.style.display = 'flex';

            const form = document.getElementById('createServerForm');
            const serverNameInput = document.getElementById('serverNameInput');
            const joinInput = document.getElementById('joinServerInput');
            const joinBtn = document.getElementById('joinServerSubmitBtn');
            const closeModalBtn = document.getElementById('closeModalBtn');

            const closeModal = () => {
                modal.style.display = 'none';
                if (serverNameInput) serverNameInput.value = '';
                if (joinInput) joinInput.value = '';
            };

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

                    try {
                        const res = await fetch('/api/servers', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: serverName, color: selectedColor })
                        });

                        if (res.ok) {
                            closeModal();
                            await loadServers();
                        } else {
                            alert("Erreur lors de la création du salon.");
                        }
                    } catch (err) {}
                };
            }

            if (joinBtn && joinInput) {
                joinBtn.onclick = async (e) => {
                    e.preventDefault();
                    const token = joinInput.value.trim();
                    if (!token) {
                        alert("Veuillez entrer un lien ou un code d'invitation.");
                        return;
                    }

                    try {
                        const res = await fetch('/api/join', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: token })
                        });

                        if (res.ok) {
                            const data = await res.json();
                            alert(`✅ Vous avez rejoint le serveur : ${data.server_name}`);
                            closeModal();
                            await loadServers();
                        } else {
                            const errText = await res.text();
                            alert(`❌ Impossible de rejoindre : ${errText}`);
                        }
                    } catch (err) {}
                };
            }
        };
    }
}

export async function openInviteModal(serverId) {
    const modalContainer = document.getElementById('modalContainer');
    if (!modalContainer) return;

    try {
        const modalHTML = await loadComponent('/frontend/components/modalContainer/inviteServer.html');
        modalContainer.innerHTML = modalHTML;
        modalContainer.style.display = 'flex';

        const closeModal = () => {
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
        };

        modalContainer.onclick = (e) => {
            if (e.target === modalContainer || e.target.closest('#closeInviteModalBtn') || e.target.closest('#closeModalBtn')) {
                closeModal();
            }
        };

        const inputLink = document.getElementById('inviteLinkInput');
        if (inputLink) {
            inputLink.value = "Génération du lien..."; 

            const response = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ server_id: serverId })
            });

            if (response.ok) {
                const data = await response.json();
                inputLink.value = `${window.location.origin}/join/${data.token}`;
            } else {
                inputLink.value = "Erreur de génération.";
            }
        }

        const copyBtn = document.getElementById('copyInviteBtn');
        if (copyBtn && inputLink) {
            copyBtn.onclick = () => {
                inputLink.select();
                document.execCommand('copy');
                copyBtn.innerText = 'Copié !';
                copyBtn.style.backgroundColor = '#23a559';
                setTimeout(() => {
                    copyBtn.innerText = 'Copier';
                    copyBtn.style.backgroundColor = '';
                }, 2000);
            };
        }
    } catch (err) {}
}