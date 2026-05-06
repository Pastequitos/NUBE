// users.js
import { state } from './state.js';
import { loadComponent, DEFAULT_AVATAR} from './utils.js';

let isLoadingFriends = false;

export async function loadServerMembers(serverId) {
    const userContainer = document.getElementById('userContainer');
    if (!userContainer) return;

    const container = userContainer.querySelector('.glassContainer');
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

                userItem.id = `member-${member.id}`;
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

                container.appendChild(userItem);
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

    // 1. Données de base immédiates (passées en arguments)
    document.getElementById('profileNickname').innerText = nickname;

    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
        // Met la bonne photo de profil passée en argument ou celle par défaut
        profileAvatar.src = avatarSrc || DEFAULT_AVATAR;
        profileAvatar.setAttribute('data-user-id', userId);
    }

    // Ciblage des nouveaux éléments
    const bioTextElement = document.getElementById('profileBioText');
    const creationDateElement = document.getElementById('profileCreationDate');
    const statusBadge = document.getElementById('profileStatusBadge');
    const statusText = document.getElementById('profileStatusText');

    // 2. 🌟 NOUVEAU : Fetch des données complètes (Bio, Date, Statut réel)
    try {
        const res = await fetch(`/api/user-profile?user_id=${userId}`);
        if (res.ok) {
            const data = await res.json();

            console.log(data);

            // -- Gestion de la Bio --
            if (bioTextElement) {
                bioTextElement.innerText = data.bio && data.bio.trim() !== ""
                    ? data.bio
                    : "Aucune biographie pour le moment.";
            }

            // -- Gestion de la Date de créatin --
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
            console.error("Erreur API lors du fetch profil");
        }
    } catch (e) {
        if (bioTextElement) bioTextElement.innerText = "Erreur de connexion.";
        console.error("Erreur de chargement profil:", e);
    }

    // 3. Gestion des boutons (Logique existante)
    const addBtn = document.getElementById('addFriendBtn');

    if (state.userId === String(userId)) {
        addBtn.style.display = 'none';
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
            // On recharge la liste d'amis derrière pour que l'interface reste synchronisée
            loadFriendsList();

            // On met à jour l'apparence du bouton selon l'action qu'on vient de faire
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
    // 🌟 Sécurité anti-doublon
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

        // On vide proprement avant de remplir
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

                item.dataset.id = friend.id;
                item.querySelector('.contact-nickname').innerText = friend.nickname;

                const avatarSrc = friend.avatar && friend.avatar !== "" ? friend.avatar : DEFAULT_AVATAR;
                const imgElement = item.querySelector('.user-avatar-small');
                if (imgElement) {
                    imgElement.src = avatarSrc;
                    imgElement.setAttribute('data-user-id', friend.id);
                }

                item.onclick = () => openUserProfile(friend.id, friend.nickname, avatarSrc);

                if (friend.online === true) {
                    item.classList.add('online');
                    item.classList.remove('offline');
                } else {
                    item.classList.add('offline');
                    item.classList.remove('online');
                }

                container.appendChild(item);
            });
        }

    } catch (err) {
        console.error("❌ Erreur loadFriendsList:", err);
    } finally {
        // 🌟 On libère le verrou quoi qu'il arrive
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