
import { addLiquidGlassElement, applyLiquidGlass } from './liquidGlass.js';
import { loadHistory } from './messages.js';
import { state } from './state.js';
import { loadComponent, DEFAULT_AVATAR, apiFetch, extractBannerGradient } from './utils.js';

let isLoadingFriends = false;

let currentMembersRequestId = 0;

export function createMemberElement(member, options = {}) {
    const {
        template = null,
        action = null,
        glassOptions = null,
        showStatus = true
    } = options;

    let element;
    if (template) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = template.trim();
        element = tempDiv.firstElementChild;
    } else {
        element = document.createElement('div');
        element.className = 'contact-item';
        element.innerHTML = `
            <div class="member-identity" style="display: flex; align-items: center; gap: 10px;">
                <div class="avatar-container">
                    <img class="user-avatar-small" src="" data-user-id="" alt="Avatar" style="object-fit: cover;">
                    <div class="status-dot"></div>
                </div>
                <span class="contact-nickname"></span>
            </div>
        `;
    }

    element.id = `member-glass-${member.id}`;
    element.dataset.id = member.id;

    if (showStatus && member.status) {
        element.classList.remove('online', 'offline');
        element.classList.add(member.status);
    }

    const nicknameEl = element.querySelector('.contact-nickname') || element.querySelector('.user-nickname');
    if (nicknameEl) nicknameEl.innerText = member.nickname;

    const avatarSrc = (member.avatar && member.avatar !== "") ? member.avatar : DEFAULT_AVATAR;
    const imgElement = element.querySelector('.user-avatar-small');
    if (imgElement) {
        imgElement.src = avatarSrc;
        imgElement.setAttribute('data-user-id', member.id);
    }

    if (action) {
        element.dataset.action = action;
    }

    if (glassOptions) {
        applyLiquidGlass(element, glassOptions);
    }

    return { element, avatarSrc };
}

export async function loadServerMembers(serverId) {
    const userContainer = document.getElementById('userContainer');
    if (!userContainer) return;

    const container = userContainer.querySelector('.glassContainer');
    if (!container) return;

    const requestId = ++currentMembersRequestId;

    container.innerHTML = '<div class="user-list-header sectionTitle">Membres</div>';

    const templateHtml = await loadComponent('/frontend/components/userContainer/userList.html');

    const { ok, data: members } = await apiFetch(`/api/server-members?server_id=${serverId}`);
    if (ok) {
        if (requestId !== currentMembersRequestId) return;

        // Groupement par rôle
        const admins = members.filter(m => m.role === 'admin');
        const others = members.filter(m => m.role !== 'admin');

        container.innerHTML = ''; // On vide pour reconstruire

        const renderGroup = (title, list) => {
            if (list.length === 0) return;

            const header = document.createElement('div');
            header.className = 'user-group-header';
            header.innerText = `${title} — ${list.length}`;
            container.appendChild(header);

            list.sort((a, b) => (a.status === 'online' ? -1 : 1));

            list.forEach(member => {
                const { element } = createMemberElement(member, {
                    template: templateHtml,
                    action: 'open-profile',
                    glassOptions: {
                        radius: 28.0,
                        bezel: 28.0,
                        thickness: 25.0,
                        ior: 1.8,
                        interactive: true
                    }
                });
                container.appendChild(element);
            });
        };

        renderGroup('ADMIN', admins);
        renderGroup('MEMBRE', others);
    }
}

export async function loadRightPanelProfile(userId, nickname, avatarSrc) {
    const userContainer = document.getElementById('userContainer');
    if (!userContainer) return;

    const container = userContainer.querySelector('.glassContainer');
    if (!container) return;

    const html = await loadComponent('/frontend/components/userContainer/userCard.html');
    container.innerHTML = html;

    const card = container.querySelector('#userCard');
    if (!card) return;

    const pseudoEl = card.querySelector('.pseudo');
    const statusTextEl = card.querySelector('.status');
    const profilePicEl = card.querySelector('.profilePicture');
    const bioEl = card.querySelector('.bio');
    const dateEl = card.querySelector('.date');

    if (pseudoEl) pseudoEl.innerText = nickname;
    if (profilePicEl) {
        profilePicEl.style.backgroundImage = `url(${avatarSrc || DEFAULT_AVATAR})`;
        profilePicEl.style.backgroundSize = 'cover';
        profilePicEl.style.backgroundPosition = 'center';
    }

    const banner = card.querySelector('.banner');
    if (banner) {
        extractBannerGradient(avatarSrc || DEFAULT_AVATAR).then(gradient => {
            banner.style.background = gradient;
        });
    }

    const { ok, data } = await apiFetch(`/api/user-profile?user_id=${userId}`);
    if (ok) {
        if (bioEl) bioEl.innerText = data.bio || "Aucune bio";
        if (dateEl && data.created_at) {
            const date = new Date(data.created_at);
            dateEl.innerText = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        if (statusTextEl) {
            statusTextEl.innerText = data.is_online ? "en ligne" : "hors ligne";
        }

        const statusDot = card.querySelector('.status-dot') || card.querySelector('.status');
        if (statusDot) {
            card.classList.remove('online', 'offline');
            card.classList.add(data.is_online ? 'online' : 'offline');
            statusDot.className = 'status-dot'; // Ensure it has the class
        }
    }
}


export function setupUserContainerDelegation() {
    const container = document.getElementById('userContainer');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const item = e.target.closest('[data-action="open-profile"]');
        if (!item) return;

        const userId = item.dataset.id;
        const nickname = item.querySelector('.contact-nickname').innerText;
        const avatarSrc = item.querySelector('.user-avatar-small').src;
        openUserProfile(userId, nickname, avatarSrc);
    });
}

export async function openUserProfile(userId, nickname, avatarSrc) {
    const modalContainer = document.getElementById('modalContainer');

    const html = await loadComponent('/frontend/components/contexts/userProfile.html');
    modalContainer.innerHTML = html;
    modalContainer.style.display = 'flex';

    const profileCard = modalContainer.querySelector('.profile-card');

    if (profileCard) {
        const uniqueId = `profile-glass-${userId}`;
        profileCard.id = uniqueId;

        profileCard.style.backdropFilter = 'blur(3px)';

        applyLiquidGlass(profileCard, {
            radius: 42.0,
            bezel: 42.0,
            thickness: 50.0,
            ior: 2.2,
            brightness: 1.3,
            tint: 0.1,
            interactive: false
        });
    }

    const profileBanner = modalContainer.querySelector('.profile-banner');
    if (profileBanner) {
        extractBannerGradient(avatarSrc || DEFAULT_AVATAR).then(gradient => {
            profileBanner.style.background = gradient;
        });
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

    const { ok, data } = await apiFetch(`/api/user-profile?user_id=${userId}`, {}, false);
    if (ok) {

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


        const addBtn = document.getElementById('addFriendBtn');
        const dmBtn = document.getElementById('dmBtn');

        if (dmBtn) {
            dmBtn.dataset.id = userId;
            dmBtn.dataset.nickname = nickname;
            dmBtn.dataset.avatar = avatarSrc;
            dmBtn.dataset.action = 'dm-user';
        }

        if (state.userId === String(userId)) {
            const profileBody = document.querySelector('.profile-body');
            if (profileBody) profileBody.style.display = 'none';
        } else {
            addBtn.innerText = "Vérification...";
            addBtn.disabled = true;

            const { ok, data: friends } = await apiFetch('/api/friends/list', {}, false);
            if (ok) {
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
        }
    }
}

async function handleProfileFriendAction(targetId, action, btn) {
    btn.innerText = "Chargement...";
    btn.disabled = true;

    const { ok } = await apiFetch(`/api/friends/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId })
    });

    if (ok) {
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
}

export function setupContactContainerDelegation() {
    const container = document.getElementById('contactContainer');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const target = e.target;

        // Action: Ouvrir le chat privé
        const friendItem = target.closest('[data-action="open-chat"]');
        if (friendItem) {
            const userId = friendItem.dataset.id;
            const nickname = friendItem.querySelector('.contact-nickname').innerText;
            const avatarSrc = friendItem.querySelector('.user-avatar-small').src;
            loadHistory('dm', userId, { nickname, avatar: avatarSrc });

            const badge = friendItem.querySelector('.unread-badge');
            if (badge) badge.remove();

            apiFetch('/api/users/mark-private-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: userId })
            }, false);
            return;
        }

        // Action: Accepter demande d'ami
        const acceptBtn = target.closest('[data-action="accept-friend"]');
        if (acceptBtn) {
            const userId = acceptBtn.closest('[data-id]').dataset.id;
            handleFriendAction(userId, 'accept');
            acceptBtn.closest('.pending-item').remove();
            return;
        }

        // Action: Refuser demande d'ami
        const declineBtn = target.closest('[data-action="decline-friend"]');
        if (declineBtn) {
            const userId = declineBtn.closest('[data-id]').dataset.id;
            handleFriendAction(userId, 'decline');
            declineBtn.closest('.pending-item').remove();
            return;
        }
    });

    // Context Menu: Ouvrir Profil
    container.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.friend-item');
        if (item) {
            e.preventDefault();
            const userId = item.dataset.id;
            const nickname = item.querySelector('.contact-nickname').innerText;
            const avatarSrc = item.querySelector('.user-avatar-small').src;
            openUserProfile(userId, nickname, avatarSrc);
        }
    });
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

    const { ok, data: allRelations } = await apiFetch('/api/friends/list', {}, false);
    if (ok) {
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

                item.dataset.id = req.id;
                item.querySelector('.contact-nickname').innerText = req.nickname;

                const avatarSrc = req.avatar && req.avatar !== "" ? req.avatar : DEFAULT_AVATAR;
                const imgElement = item.querySelector('.user-avatar-small');
                if (imgElement) {
                    imgElement.src = avatarSrc;
                    imgElement.setAttribute('data-user-id', req.id);
                }

                const acceptBtn = item.querySelector('.accept-btn');
                const declineBtn = item.querySelector('.decline-btn');
                if (acceptBtn) acceptBtn.dataset.action = 'accept-friend';
                if (declineBtn) declineBtn.dataset.action = 'decline-friend';

                container.appendChild(item);


                applyLiquidGlass(item, {
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

                item.dataset.id = friend.id;
                item.dataset.action = 'open-chat';

                item.querySelector('.contact-nickname').innerText = friend.nickname;

                const avatarSrc = friend.avatar && friend.avatar !== "" ? friend.avatar : DEFAULT_AVATAR;
                const imgElement = item.querySelector('.user-avatar-small');
                if (imgElement) {
                    imgElement.src = avatarSrc;
                    imgElement.setAttribute('data-user-id', friend.id);
                }

                if (friend.unread_count && friend.unread_count > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'unread-badge';
                    badge.innerText = friend.unread_count > 9 ? '9+' : friend.unread_count;
                    item.appendChild(badge);
                }

                if (friend.online === true) {
                    item.classList.add('online');
                    item.classList.remove('offline');
                } else {
                    item.classList.add('offline');
                    item.classList.remove('online');
                }

                container.appendChild(item);


                applyLiquidGlass(item, {
                    radius: 28.0,
                    bezel: 28.0,
                    thickness: 15.0,
                    ior: 1.5,
                    brightness: 0.8,
                    interactive: true
                });
            });
        }
    }
    isLoadingFriends = false;
}

export async function handleFriendAction(targetId, action) {
    await apiFetch(`/api/friends/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: targetId })
    }, false);
}