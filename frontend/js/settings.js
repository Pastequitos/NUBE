
import { loadComponent, updateAllAvatarsInDOM, apiFetch, closeModalWithAnimation } from './utils.js';
import { notify } from './notifications.js';
import { openCropper } from './cropper.js';
import { state } from './state.js';
import { handleLogout } from './auth.js';

export async function openSettings() {
    const settingsContainer = document.getElementById('settings');
    if (!settingsContainer) return;

    if (settingsContainer.classList.contains('open')) {
        settingsContainer.classList.remove('open');
        settingsContainer.classList.add('close');
        
        setTimeout(() => {
            settingsContainer.style.display = 'none';
            settingsContainer.innerHTML = ''; 
        }, 300); 
        
        return; 
    }

    settingsContainer.classList.remove('close');
    settingsContainer.classList.add('open');
    settingsContainer.innerHTML = await loadComponent('/frontend/components/settings.html');
    settingsContainer.style.display = 'block';

    const avatarInput = document.getElementById('settingsAvatarInput');
    const avatarPreview = document.getElementById('settingsAvatarPreview');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const bioInput = document.getElementById('settingsBioInput');
    const logoutBtn = document.getElementById('logoutBtn');
    
    let avatarBase64 = null;

    if (state.userAvatar && avatarPreview) {
        avatarPreview.src = state.userAvatar;
        avatarBase64 = state.userAvatar;
    }

    if (bioInput) {
        const { ok, data } = await apiFetch(`/api/user-profile?user_id=${state.userId}`, {}, false);
        if (ok) {
            bioInput.value = data.bio || "";
        }
    }

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

                const { ok } = await apiFetch('/api/avatar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar: resultBase64 })
                });

                if (ok) {
                    notify.success("Photo de profil mise à jour !");
                    
                    state.userAvatar = resultBase64;
                    
                    const currentUserAvatar = document.getElementById('currentUserAvatar');
                    if (currentUserAvatar) {
                        currentUserAvatar.src = resultBase64;
                    }

                    updateAllAvatarsInDOM(state.userId, resultBase64);
                }
            }
        });
    });

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const bioText = bioInput ? bioInput.value.trim() : "";

            const payload = {
                bio: bioText,
                avatar: avatarBase64
            };

            saveBtn.innerText = "Sauvegarde en cours...";
            saveBtn.disabled = true;

            const { ok } = await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (ok) {
                notify.success("Profil mis à jour avec succès !");
            }

            saveBtn.innerText = "Enregistrer";
            saveBtn.disabled = false;
        });
    }

    // Gestion du choix de l'arrière-plan
    const currentBg = localStorage.getItem('nubeBackground') || "/frontend/assets/background/bg1.jpg";
    const bgOptions = settingsContainer.querySelectorAll('.bg-option');
    const bgUploadOpt = settingsContainer.querySelector('.bg-upload-option');
    const bgInput = document.getElementById('settingsBgInput');

    // Charger l'aperçu du background personnalisé si actif au chargement
    if (bgUploadOpt && currentBg.startsWith('/uploads/background/')) {
        const bgWithBuster = currentBg + `?t=${Date.now()}`;
        bgUploadOpt.style.backgroundImage = `url("${bgWithBuster}")`;
        bgUploadOpt.dataset.bg = currentBg;
    }

    bgOptions.forEach(opt => {
        if (opt.classList.contains('bg-upload-option')) return; // Géré séparément ci-dessous

        if (opt.dataset.bg === currentBg) {
            opt.classList.add('active');
        }

        opt.addEventListener('click', async () => {
            bgOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');

            const selectedBg = opt.dataset.bg;
            localStorage.setItem('nubeBackground', selectedBg);

            // Mise à jour de l'arrière-plan CSS avec cache buster si applicable
            const bgWithBuster = selectedBg + (selectedBg.startsWith('/uploads/') ? `?t=${Date.now()}` : '');
            document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${bgWithBuster}")`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundAttachment = "fixed";
            document.body.style.backgroundPosition = "center";

            // Mise à jour temps réel de l'effet de réfraction Liquid Glass
            const { changeLiquidGlassBackground } = await import('./liquidGlass.js');
            changeLiquidGlassBackground(bgWithBuster);

            // Synchronisation instantanée avec la base de données pour persister sur tous les appareils
            await apiFetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ background: selectedBg })
            });
        });
    });

    if (bgUploadOpt && bgInput) {
        if (bgUploadOpt.dataset.bg === currentBg) {
            bgUploadOpt.classList.add('active');
        }

        bgUploadOpt.addEventListener('click', () => {
            // Si l'utilisateur clique alors qu'il a déjà un fond personnalisé, on lui applique ou on lui permet d'en choisir un autre
            if (bgUploadOpt.dataset.bg && !bgUploadOpt.classList.contains('active')) {
                bgOptions.forEach(o => o.classList.remove('active'));
                bgUploadOpt.classList.add('active');
                
                const selectedBg = bgUploadOpt.dataset.bg;
                localStorage.setItem('nubeBackground', selectedBg);

                const bgWithBuster = selectedBg + `?t=${Date.now()}`;

                document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${bgWithBuster}")`;
                document.body.style.backgroundSize = "cover";
                document.body.style.backgroundAttachment = "fixed";
                document.body.style.backgroundPosition = "center";

                import('./liquidGlass.js').then(({ changeLiquidGlassBackground }) => {
                    changeLiquidGlassBackground(bgWithBuster);
                });

                apiFetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ background: selectedBg })
                });
            } else {
                bgInput.click();
            }
        });

        // Double-cliquer ou faire un long clic sur la case + permet de changer l'image même si elle est déjà active
        bgUploadOpt.addEventListener('dblclick', () => {
            bgInput.click();
        });

        bgInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                notify.error("Le fichier sélectionné n'est pas une image.");
                bgInput.value = "";
                return;
            }

            try {
                notify.info("Conversion et optimisation de l'arrière-plan...");
                const webpBase64 = await resizeAndCompressToWebP(file);

                notify.info("Téléversement...");

                const { ok, data } = await apiFetch('/api/background/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ background: webpBase64 })
                });

                if (ok && data.path) {
                    notify.success("Arrière-plan personnalisé activé !");
                    localStorage.setItem('nubeBackground', data.path);

                    const bgWithBuster = data.path + `?t=${Date.now()}`;

                    bgOptions.forEach(o => o.classList.remove('active'));
                    bgUploadOpt.classList.add('active');
                    bgUploadOpt.style.backgroundImage = `url("${bgWithBuster}")`;
                    bgUploadOpt.dataset.bg = data.path;

                    document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${bgWithBuster}")`;
                    document.body.style.backgroundSize = "cover";
                    document.body.style.backgroundAttachment = "fixed";
                    document.body.style.backgroundPosition = "center";

                    const { changeLiquidGlassBackground } = await import('./liquidGlass.js');
                    changeLiquidGlassBackground(bgWithBuster);
                } else {
                    notify.error("Erreur lors du téléversement.");
                }

            } catch (err) {
                console.error(err);
                notify.error(err.message || "Une erreur est survenue.");
            } finally {
                bgInput.value = "";
            }
        });
    }

    function resizeAndCompressToWebP(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_WIDTH = 1920;
                    const MAX_HEIGHT = 1080;

                    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Conversion WebP à 80% qualité (ultra léger et superbe définition)
                    const compressedBase64 = canvas.toDataURL('image/webp', 0.8);
                    resolve(compressedBase64);
                };
                img.onerror = () => reject(new Error("Image corrompue ou format non supporté."));
            };
            reader.onerror = () => reject(new Error("Erreur de lecture du fichier."));
        });
    }



    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            handleLogout(); 
        });
    }

    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
            const modalContainer = document.getElementById('modalContainer');
            if (!modalContainer) return;

            modalContainer.innerHTML = await loadComponent('/frontend/components/modalContainer/deleteAccount.html');
            modalContainer.style.display = 'flex';

            const modalContent = modalContainer.firstElementChild;
            if (modalContent) {
                const { applyLiquidGlass } = await import('./liquidGlass.js');
                applyLiquidGlass(modalContent, {
                    radius: 38.0,
                    bezel: 38.0,
                    thickness: 50.0,
                    ior: 2.2,
                    brightness: 1.2,
                    tint: 0.1,
                    interactive: false
                });
            }

            const cancelBtn = document.getElementById('cancelDeleteBtn');
            const confirmBtn = document.getElementById('confirmDeleteBtn');

            const closeModal = () => closeModalWithAnimation(modalContainer);

            if (cancelBtn) {
                cancelBtn.onclick = closeModal;
            }

            modalContainer.onclick = (e) => {
                if (e.target === modalContainer) {
                    closeModal();
                }
            };

            if (confirmBtn) {
                confirmBtn.onclick = async () => {
                    confirmBtn.innerText = "Suppression...";
                    confirmBtn.disabled = true;

                    const { ok } = await apiFetch('/api/users/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (ok) {
                        closeModal();
                        
                        // Close settings panel
                        const settingsContainer = document.getElementById('settings');
                        if (settingsContainer) {
                            settingsContainer.classList.remove('open');
                            settingsContainer.style.display = 'none';
                            settingsContainer.innerHTML = '';
                        }

                        // Remove custom background local storage
                        localStorage.removeItem('nubeBackground');

                        // Reset background body to default
                        document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("/frontend/assets/background/bg1.jpg")`;
                        document.body.style.backgroundSize = "cover";
                        document.body.style.backgroundAttachment = "fixed";
                        document.body.style.backgroundPosition = "center";

                        // Update WebGL refraction LERP
                        import('./liquidGlass.js').then(({ changeLiquidGlassBackground }) => {
                            changeLiquidGlassBackground("/frontend/assets/background/bg1.jpg");
                        }).catch(err => console.error(err));

                        state.currentUser = null;
                        state.userId = null;
                        if (state.socket) state.socket.close();

                        notify.success("Ton compte a été supprimé définitivement.");

                        // Import router dynamically to avoid circular import issues
                        import('./auth.js').then(({ router }) => {
                            router('login');
                        });
                    } else {
                        confirmBtn.innerText = "Confirmer";
                        confirmBtn.disabled = false;
                        notify.error("Impossible de supprimer le compte. Réessaie plus tard.");
                    }
                };
            }
        });
    }
}