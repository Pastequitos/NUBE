// modals.js
import { loadComponent } from './utils.js';
import { loadServers } from './server.js';

import { notify } from './notifications.js';
import { addLiquidGlassElement } from './liquidGlass.js';

export function setupModalListeners() {
    const openBtn = document.getElementById('openModalBtn');
    const modal = document.getElementById('modalContainer');

    if (openBtn && modal) {
        openBtn.onclick = async () => {
            modal.innerHTML = await loadComponent('/frontend/components/modalContainer/createServer.html');
            modal.style.display = 'flex';

            // 🌟 ACTIVATION DU LIQUID GLASS SUR LA MODALE 🌟
            // On cible la div principale de la modale. 
            // `firstElementChild` prend automatiquement le premier bloc HTML de ton template (le conteneur de la carte)
            const serverCard = modal.firstElementChild; 

            if (serverCard) {
                // 1. On crée un ID unique (basé sur l'heure pour éviter tout doublon)
                const uniqueId = `create-server-glass-${Date.now()}`;
                serverCard.id = uniqueId;

                const modalRadius = 42.0; // L'arrondi de ta modale

                // 3. On force tous les enfants de la modale à passer DEVANT le verre
                Array.from(serverCard.children).forEach(child => {
                    child.style.position = 'relative';
                    child.style.zIndex = '1';
                });

                // 4. On appelle le WebGL avec un délai de 10ms pour laisser le DOM s'afficher
                setTimeout(() => {
                    addLiquidGlassElement(uniqueId, { 
                        radius: modalRadius, 
                        bezel: modalRadius, 
                        thickness: 50.0,    // Verre bien épais
                        ior: 2.2,           // Forte distorsion
                        brightness: 1.2,    // Assez clair pour "pop" à l'écran
                        tint: 0.1, 
                        interactive: false 
                    });
                }, 10);
            }

            // --- SUITE DE TON CODE (Logique des formulaires) ---
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
                            notify.success(`Le serveur "${serverName}" a été créé avec success !`);
                            await loadServers();
                        } else {
                            notify.error("Erreur lors de la création du salon.");
                        }
                    } catch (err) {
                        notify.error("Impossible de joindre le serveur.");
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

                    try {
                        const res = await fetch('/api/join', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: token })
                        });

                        if (res.ok) {
                            const data = await res.json();
                            notify.success(`Vous avez rejoint ${data.server_name} avec success !`);
                            closeModal();
                            await loadServers();
                        } else {
                            const errText = await res.text();
                            notify.error(`Impossible de rejoindre : ${errText}`);
                        }
                    } catch (err) {
                        notify.error("Erreur de connexion.");
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

        // 🌟 ACTIVATION DU LIQUID GLASS SUR LA MODALE 🌟
        // On cible la div principale de ta modale d'invitation
        const inviteCard = modalContainer.firstElementChild; 

        if (inviteCard) {
            // 1. On crée un ID unique
            const uniqueId = `invite-glass-${Date.now()}`;
            inviteCard.id = uniqueId;

            const modalRadius = 38.0; // Ajuste si ta modale est plus ou moins arrondie

            // 3. On passe le contenu (titre, input, boutons) DEVANT le verre
            Array.from(inviteCard.children).forEach(child => {
                child.style.position = 'relative';
                child.style.zIndex = '1';
            });

            // 4. On appelle le WebGL
            setTimeout(() => {
                addLiquidGlassElement(uniqueId, { 
                    radius: modalRadius, 
                    bezel: modalRadius, 
                    thickness: 50.0,    // Verre épais pour une modale
                    ior: 2.2,           // Forte déformation
                    brightness: 1.2,    // Bien lumineux
                    tint: 0.1, 
                    interactive: false 
                });
            }, 10);
        }

        // --- LOGIQUE EXISTANTE ---
        const serverNameEl = document.getElementById('inviteServerName');
        if (serverNameEl) {
            serverNameEl.innerText = serverName ? serverName : "ce serveur";
        }

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
        console.error("Erreur ouverture modale invitation:", err);
    }
}