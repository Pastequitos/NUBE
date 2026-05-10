// users.js
import { addLiquidGlassElement } from './liquidGlass.js';
import { loadPrivateHistory } from './messages.js';
import { state } from './state.js';
import { loadComponent, DEFAULT_AVATAR } from './utils.js';

let isLoadingFriends = false;

export async function loadServerMembers(serverId) {
    const userContainer = document.getElementById('userContainer');
    if (!userContainer) return;

    const container = userContainer.querySelector('.glassContainer');

    // 🌟 1. On casse le "Mur" parent pour voir le WebGL au fond
    container.style.background = 'transparent';
    container.style.boxShadow = 'none';
    container.style.border = 'none';

    container.innerHTML = '';
    container.innerHTML = '<div class="user-list-header sectionTitle">Membres</div>';

    try {
        const templateHtml = await loadComponent('/frontend/components/userContainer/userList.html');
        const parser = new DOMParser();

        const response = await fetch(`/api/server-members?server_id=${serverId}`);
        if (response.ok) {
            const members = await response.json();

            members.sort((a, b) => (a.status === 'online' ? -1 : 1));

            members.forEach(member => {
                const doc = parser.parseFromString(templateHtml, 'text/html');
                const userItem = doc.querySelector('.user-item');

                // 🌟 2. ID Unique pour le WebGL
                const uniqueId = `member-glass-${member.id}`;
                userItem.id = uniqueId;
                userItem.dataset.id = member.id;

                userItem.classList.remove('online', 'offline');
                userItem.classList.add(member.status);

                userItem.querySelector('.user-nickname').innerText = member.nickname;

                const avatarSrc = member.avatar && member.avatar !== "" ? member.avatar : DEFAULT_AVATAR;
                const imgElement = userItem.querySelector('.user-avatar-small');
                if (imgElement) {
                    imgElement.src = avatarSrc;
                    imgElement.setAttribute('data-user-id', member.id);
                }

                userItem.onclick = () => openUserProfile(member.id, member.nickname, avatarSrc);

                // 🌟 4. Forcer le contour physique pour détacher l'item du fond
                userItem.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                userItem.style.position = 'relative';

                // On s'assure que l'avatar et le texte passent DEVANT le verre
                Array.from(userItem.children).forEach(child => {
                    child.style.position = 'relative';
                    child.style.zIndex = '1';
                });

                // 🌟 5. Insertion dans le DOM
                container.appendChild(userItem);

                addLiquidGlassElement(uniqueId, {
                    radius: 28.0,
                    bezel: 28.0,
                    thickness: 25.0,
                    ior: 1.8,
                    interactive: true
                });
            });
        }
    } catch (err) {
        console.error("Erreur chargement membres :", err);
    }
}

// frontend/js/users.js (partie openUserProfile)
export async function openUserProfile(userId, nickname, avatarSrc) {
    const modalContainer = document.getElementById('modalContainer');

    const html = await loadComponent('/frontend/components/contexts/userProfile.html');
    modalContainer.innerHTML = html;
    modalContainer.style.display = 'flex';

    // 🌟 L'ARME ABSOLUE POUR LA MODALE 🌟
    const profileCard = modalContainer.querySelector('.profile-card');

    if (profileCard) {
        const uniqueId = `profile-glass-${userId}`;
        profileCard.id = uniqueId;

        profileCard.style.backdropFilter = 'blur(3px)';

        Array.from(profileCard.children).forEach(child => {
            child.style.position = 'relative';
            child.style.zIndex = '1';
        });

        setTimeout(() => {
            addLiquidGlassElement(uniqueId, {
                radius: 42.0,
                bezel: 42.0,
                thickness: 50.0, 
                ior: 2.2,
                brightness: 1.3, 
                tint: 0.1,
                interactive: false
            });
        }, 10);
    }

    document.getElementById('profileNickname').innerText = nickname;

    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
        profileAvatar.src = avatarSrc || DEFAULT_AVATAR;
        profileAvatar.setAttribute('data-user-id', userId);
    }

    const bioTextElement = document.getElementById('profileBioText');
    const creationDateElement = document.getElementById('profileCreationDate');
    const statusBadge = document.getElementById('profileStatusBadge');
    const statusText = document.getElementById('profileStatusText');

    try {
        const res = await fetch(`/api/user-profile?user_id=${userId}`);
        if (res.ok) {
            const data = await res.json();

            if (bioTextElement) {
                bioTextElement.innerText = data.bio && data.bio.trim() !== ""
                    ? data.bio
                    : "Aucune biographie pour le moment.";
            }

            if (creationDateElement && data.created_at) {
                const date = new Date(data.created_at);
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                creationDateElement.innerText = date.toLocaleDateString('fr-FR', options);
            }

            if (statusBadge && statusText) {
                if (data.is_online) {
                    statusBadge.classList.remove('offline');
                    statusBadge.classList.add('online');
                    statusText.innerText = "En ligne";
                    statusText.classList.remove('offline');
                    statusText.classList.add('online');
                } else {
                    statusBadge.classList.remove('online');
                    statusBadge.classList.add('offline');
                    statusText.innerText = "Hors ligne";
                    statusText.classList.remove('online');
                    statusText.classList.add('offline');
                }
            }
        } else {
            if (bioTextElement) bioTextElement.innerText = "Erreur lors du chargement du profil.";
        }
    } catch (e) {
        if (bioTextElement) bioTextElement.innerText = "Erreur de connexion.";
    }

    // 🌟 3. Gestion des boutons
    const addBtn = document.getElementById('addFriendBtn');
    const dmBtn = document.getElementById('dmBtn'); // 🌟 On cible le bouton Message privé

    // 🌟 Clic sur le bouton Message Privé
    if (dmBtn) {
        dmBtn.onclick = () => {
            modalContainer.style.display = 'none'; // Ferme la modale
            loadPrivateHistory(userId, nickname); // Ouvre la conversation
        };
    }

    // Clic sur Ajouter / Supprimer en ami
    if (state.userId === String(userId)) {
        addBtn.style.display = 'none';
        if (dmBtn) dmBtn.style.display = 'none'; // On cache aussi le bouton MP si c'est nous-même
    } else {
        addBtn.innerText = "Vérification...";
        addBtn.disabled = true;

        try {
            const response = await fetch('/api/friends/list');
            if (response.ok) {
                const friends = await response.json();
                const relation = friends.find(f => f.id === userId);

                addBtn.disabled = false;

                if (relation) {
                    if (relation.status === 'accepted') {
                        addBtn.innerText = "Supprimer l'ami";
                        addBtn.className = "removeFriendBtn";
                        addBtn.onclick = () => handleProfileFriendAction(userId, 'decline', addBtn);
                    } else if (relation.status === 'pending') {
                        if (relation.is_requester) {
                            addBtn.innerText = "Demande en attente";
                            addBtn.style.backgroundColor = "#80848e";
                            addBtn.disabled = true;
                        } else {
                            addBtn.innerText = "Accepter la demande";
                            addBtn.style.backgroundColor = "#23a559";
                            addBtn.onclick = () => handleProfileFriendAction(userId, 'accept', addBtn);
                        }
                    }
                } else {
                    addBtn.innerText = "Ajouter en ami";
                    addBtn.style.backgroundColor = "#5865F2";
                    addBtn.onclick = () => handleProfileFriendAction(userId, 'add', addBtn);
                }
            }
        } catch (err) {
            console.error("Erreur check statut ami:", err);
            addBtn.innerText = "Ajouter en ami";
            addBtn.disabled = false;
        }
    }

    // Gestion fermeture modale
    modalContainer.onclick = (e) => {
        if (e.target === modalContainer || e.target.closest('.close-modal-btn')) {
            modalContainer.style.display = 'none';
        }
    };
}

// 🌟 Nouvelle fonction pour gérer les clics depuis le profil dynamiquement
async function handleProfileFriendAction(targetId, action, btn) {
    btn.innerText = "Chargement...";
    btn.disabled = true;

    try {
        const response = await fetch(`/api/friends/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_id: targetId })
        });

        if (response.ok) {
            loadFriendsList();

            if (action === 'add') {
                btn.innerText = "Demande en attente";
                btn.style.backgroundColor = "#80848e";
            } else if (action === 'accept') {
                btn.innerText = "Supprimer l'ami";
                btn.style.backgroundColor = "#da373c";
                btn.onclick = () => handleProfileFriendAction(targetId, 'decline', btn);
                btn.disabled = false;
            } else if (action === 'decline') {
                btn.innerText = "Ajouter en ami";
                btn.style.backgroundColor = "#5865F2";
                btn.onclick = () => handleProfileFriendAction(targetId, 'add', btn);
                btn.disabled = false;
            }
        } else {
            btn.innerText = "Erreur !";
            btn.disabled = false;
        }
    } catch (err) {
        console.error("Erreur action profil:", err);
        btn.disabled = false;
    }
}

export async function loadFriendsList() {
    if (isLoadingFriends) return;
    isLoadingFriends = true;

    const contactContainer = document.getElementById('contactContainer');
    if (!contactContainer) {
        isLoadingFriends = false;
        return;
    }

    const container = contactContainer.querySelector('.glassContainer');

    try {
        const response = await fetch('/api/friends/list');
        if (!response.ok) throw new Error("Erreur lors du fetch des amis");

        const allRelations = await response.json();

        container.innerHTML = '';

        const pendingRequests = allRelations.filter(f => f.status === 'pending' && !f.is_requester);

        if (pendingRequests.length > 0) {
            const titlePending = document.createElement('div');
            titlePending.className = 'pending-section-title sectionTitle';
            titlePending.innerText = `Demandes en attente — ${pendingRequests.length}`;
            container.appendChild(titlePending);

            const pendingTemplate = await loadComponent('/frontend/components/contactContainer/pendingItem.html');

            pendingRequests.forEach(req => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = pendingTemplate;
                const item = tempDiv.firstElementChild;

                const uniqueId = `pending-glass-${req.id}`;
                item.id = uniqueId;

                item.querySelector('.contact-nickname').innerText = req.nickname;

                const avatarSrc = req.avatar && req.avatar !== "" ? req.avatar : DEFAULT_AVATAR;
                const imgElement = item.querySelector('.user-avatar-small');
                if (imgElement) {
                    imgElement.src = avatarSrc;
                    imgElement.setAttribute('data-user-id', req.id);
                }

                const acceptBtn = item.querySelector('.accept-btn');
                const declineBtn = item.querySelector('.decline-btn');

                if (acceptBtn) {
                    acceptBtn.onclick = (e) => {
                        e.preventDefault();
                        handleFriendAction(req.id, 'accept');
                    };
                }
                if (declineBtn) {
                    declineBtn.onclick = (e) => {
                        e.preventDefault();
                        handleFriendAction(req.id, 'decline');
                    };
                }

                container.appendChild(item);

                addLiquidGlassElement(uniqueId, {
                    radius: 28.0,
                    bezel: 28.0,
                    thickness: 15.0,
                    ior: 1.5,
                    brightness: 0.8,
                    interactive: true
                });
            });
        }

        const titleAmis = document.createElement('div');
        titleAmis.className = 'pending-section-title sectionTitle';
        titleAmis.innerText = "Messages privés";
        container.appendChild(titleAmis);

        const friends = allRelations.filter(f => f.status === 'accepted');

        if (friends.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'contact-empty-state';
            emptyMsg.innerText = "Aucun ami pour le moment.";
            container.appendChild(emptyMsg);
        } else {
            const contactTemplate = await loadComponent('/frontend/components/contactContainer/contactItem.html');

            friends.forEach(friend => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = contactTemplate;
                const item = tempDiv.firstElementChild;

                const uniqueId = `contact-glass-${friend.id}`;
                item.id = uniqueId;
                item.dataset.id = friend.id;

                item.querySelector('.contact-nickname').innerText = friend.nickname;

                const avatarSrc = friend.avatar && friend.avatar !== "" ? friend.avatar : DEFAULT_AVATAR;
                const imgElement = item.querySelector('.user-avatar-small');
                if (imgElement) {
                    imgElement.src = avatarSrc;
                    imgElement.setAttribute('data-user-id', friend.id);
                }

                item.onclick = () => {
                    loadPrivateHistory(friend.id, friend.nickname);
                };
                
                item.oncontextmenu = (e) => {
                    e.preventDefault(); 
                    openUserProfile(friend.id, friend.nickname, avatarSrc);
                };

                if (friend.online === true) {
                    item.classList.add('online');
                    item.classList.remove('offline');
                } else {
                    item.classList.add('offline');
                    item.classList.remove('online');
                }

                container.appendChild(item);

                addLiquidGlassElement(uniqueId, {
                    radius: 28.0,
                    bezel: 28.0,
                    thickness: 15.0,
                    ior: 1.5,
                    brightness: 0.8,
                    interactive: true
                });
            });
        }

        console.log("✅ Chargement des amis terminé");

    } catch (err) {
        console.error("❌ Erreur loadFriendsList:", err);
    } finally {
        isLoadingFriends = false;
    }
}

export async function handleFriendAction(targetId, action) {
    try {
        const response = await fetch(`/api/friends/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_id: targetId })
        });

        if (!response.ok) {
            console.error(`Erreur serveur lors de l'action: ${action}`);
        }

    } catch (err) {
        console.error("Erreur réseau lors de l'action ami:", err);
    }
}