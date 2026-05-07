// frontend/js/settings.js
import { loadComponent, updateAllAvatarsInDOM } from './utils.js';
import { notify } from './notifications.js';
import { openCropper } from './cropper.js';
import { state } from './state.js';

export async function openSettings() {
    const settingsContainer = document.getElementById('settings');
    if (!settingsContainer) return;

    // 🌟 1. LOGIQUE DE TOGGLE (Fermeture)
    if (settingsContainer.classList.contains('open')) {
        settingsContainer.classList.remove('open');
        settingsContainer.classList.add('close');
        
/*         setTimeout(() => {
            settingsContainer.style.display = 'none';
            settingsContainer.innerHTML = ''; 
        }, 300);  */
        
        return; // On arrête la fonction ici car on vient de fermer
    }

    // 🌟 2. LOGIQUE D'OUVERTURE
    settingsContainer.classList.remove('close');
    settingsContainer.classList.add('open');
    settingsContainer.innerHTML = await loadComponent('/frontend/components/settings.html');
    settingsContainer.style.display = 'block';

    // --- Initialisation des éléments ---
    const avatarInput = document.getElementById('settingsAvatarInput');
    const avatarPreview = document.getElementById('settingsAvatarPreview');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const bioInput = document.getElementById('settingsBioInput'); 
    
    let avatarBase64 = null;

    if (state.userAvatar && avatarPreview) {
        avatarPreview.src = state.userAvatar;
        avatarBase64 = state.userAvatar;
    }

    // On récupère ta bio pour pré-remplir le champ
    if (bioInput) {
        try {
            const res = await fetch(`/api/user-profile?user_id=${state.userId}`);
            if (res.ok) {
                const data = await res.json();
                bioInput.value = data.bio || "";
            }
        } catch (e) {
            console.error("Erreur de chargement de la bio :", e);
        }
    }

    // Gestion du changement d'avatar
    avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            notify.error("L'image est trop lourde (Max 2Mo).");
            avatarInput.value = "";
            return;
        }

        openCropper(file, async (resultBase64) => {
            avatarInput.value = ""; 

            if (resultBase64) {
                avatarPreview.src = resultBase64;
                avatarBase64 = resultBase64; 

                try {
                    const response = await fetch('/api/avatar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ avatar: resultBase64 })
                    });

                    if (response.ok) {
                        notify.success("Photo de profil mise à jour !");
                        
                        state.userAvatar = resultBase64;
                        
                        const currentUserAvatar = document.getElementById('currentUserAvatar');
                        if (currentUserAvatar) {
                            currentUserAvatar.src = resultBase64;
                        }

                        updateAllAvatarsInDOM(state.userId, resultBase64);

                    } else {
                        notify.error("Erreur lors de la sauvegarde de la photo.");
                    }
                } catch (err) {
                    notify.error("Impossible de joindre le serveur.");
                }
            }
        });
    });

    // Gestion du bouton enregistrer
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const bioText = bioInput ? bioInput.value.trim() : "";

            const payload = {
                bio: bioText,
                avatar: avatarBase64
            };

            saveBtn.innerText = "Sauvegarde en cours...";
            saveBtn.disabled = true;

            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    notify.success("Profil mis à jour avec succès !");
                    
                    // Optionnel : Fermer automatiquement les paramètres après la sauvegarde
                    // openSettings(); 
                    
                } else {
                    const err = await res.json();
                    notify.error(err.message || "Erreur lors de la mise à jour.");
                }
            } catch (err) {
                notify.error("Impossible de joindre le serveur.");
            } finally {
                saveBtn.innerText = "Enregistrer";
                saveBtn.disabled = false;
            }
        });
    }
}