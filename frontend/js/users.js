// users.js
import { loadComponent } from './utils.js';

export async function loadServerMembers(serverId) {
    const userContainer = document.getElementById('userContainer');
    if (!userContainer) return;

    userContainer.innerHTML = '<div class="user-list-header">Membres</div>';

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
                userItem.onclick = () => openUserProfile(member.id, member.nickname);

                userContainer.appendChild(userItem);
            });
        }
    } catch (err) {
        console.error("Erreur chargement membres :", err);
    }
}

export async function openUserProfile(userId, nickname) {
    const modalContainer = document.getElementById('modalContainer');

    const html = await loadComponent('/frontend/components/contexts/userProfile.html');
    modalContainer.innerHTML = html;
    modalContainer.style.display = 'flex';

    document.getElementById('profileNickname').innerText = nickname;

    const addBtn = document.getElementById('addFriendBtn');
    addBtn.onclick = async () => {
        try {
            const response = await fetch('/api/friends/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: userId })
            });

            if (response.ok) {
                addBtn.innerText = "Demande envoyée !";
                addBtn.disabled = true;
                addBtn.style.backgroundColor = "#23a559";
            } else {
                alert("Erreur ou demande déjà existante");
            }
        } catch (err) {
            console.error("Erreur ajout ami:", err);
        }
    };

    modalContainer.onclick = (e) => {
        if (e.target === modalContainer || e.target.closest('.close-modal-btn')) {
            modalContainer.style.display = 'none';
        }
    };
}

export async function loadFriendsList() {
    const contactContainer = document.getElementById('contactContainer');
    if (!contactContainer) return;
    const container = contactContainer.querySelector('.glassContainer')

    try {
        const response = await fetch('/api/friends/list');
        if (!response.ok) throw new Error("Erreur lors du fetch des amis");

        const allRelations = await response.json();
        container.innerHTML = '';

        const pendingRequests = allRelations.filter(f => f.status === 'pending' && !f.is_requester);

        if (pendingRequests.length > 0) {
            const titlePending = document.createElement('div');
            titlePending.className = 'pending-section-title';
            titlePending.innerText = `Demandes en attente — ${pendingRequests.length}`;
            container.appendChild(titlePending);

            const pendingTemplate = await loadComponent('/frontend/components/contactContainer/pendingItem.html');

            pendingRequests.forEach(req => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = pendingTemplate;
                const item = tempDiv.firstElementChild;

                item.querySelector('.contact-nickname').innerText = req.nickname;

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
        titleAmis.className = 'pending-section-title';
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
    }
}

export async function handleFriendAction(targetId, action) {
    try {
        const response = await fetch(`/api/friends/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_id: targetId })
        });

        if (response.ok) {
        }
    } catch (err) { 
        console.error("Erreur action ami:", err); 
    }
}