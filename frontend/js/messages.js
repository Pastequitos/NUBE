
import { state } from './state.js';
import { DEFAULT_AVATAR, escapeHTML, apiFetch } from './utils.js';
import { notify } from './notifications.js';
import { loadRightPanelProfile } from './users.js';

let lastMessageInfo = {
    sender: null,
    date: null,
    bodyElement: null
};

let currentOffset = 0;
let hasMoreMessages = true;
let isFetching = false;
let currentChatContext = { type: null, id: null, nickname: null, avatar: null };

export function formatTime(dateString) {
    if (!dateString) return "";
    const messageDate = new Date(dateString);
    const now = new Date();
    const timeStr = messageDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const dateToCompare = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

    if (dateToCompare.getTime() === today.getTime()) return timeStr;
    if (dateToCompare.getTime() === yesterday.getTime()) return `Hier à ${timeStr}`;
    const dayStr = messageDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return `${dayStr} à ${timeStr}`;
}

export function createMessageElements(messages, trackGlobalLastMessage = false) {
    const fragment = document.createDocumentFragment();
    let localTracker = { sender: null, date: null, bodyElement: null };
    const tracker = trackGlobalLastMessage ? lastMessageInfo : localTracker;

    messages.forEach(msg => {
        if (msg.message_type === 'system') {
            if (msg.content.includes('Calmos')) {
                if (trackGlobalLastMessage) {
                    notify.error(msg.content);
                    blockChatTemporarily(true, null);
                }
                return;
            }

            const systemElement = document.createElement('div');
            systemElement.classList.add('message-item', 'system-join-message');
            systemElement.innerHTML = `
                <div class="system-icon">✨</div>
                <div class="message-body">
                    <span class="system-content">${escapeHTML(msg.content)}</span>
                    <span class="message-time">${formatTime(msg.created_at)}</span>
                </div>
            `;
            fragment.appendChild(systemElement);
            tracker.sender = null;
            tracker.date = null;
            tracker.bodyElement = null;
            return;
        }

        const senderName = msg.sender ? escapeHTML(msg.sender) : 'Anonyme';
        const currentDate = msg.created_at ? new Date(msg.created_at) : new Date();
        const isSameSender = (tracker.sender === senderName);
        const avatarSrc = msg.avatar && msg.avatar !== "" ? msg.avatar : DEFAULT_AVATAR;
        const senderId = msg.sender_id || "";

        let isWithin10Mins = false;
        if (tracker.date) {
            const diffMs = currentDate.getTime() - tracker.date.getTime();
            isWithin10Mins = (diffMs / (1000 * 60) <= 10);
        }

        if (isSameSender && isWithin10Mins && tracker.bodyElement) {
            const newTextElement = document.createElement('div');
            newTextElement.classList.add('message-text');
            newTextElement.innerHTML = escapeHTML(msg.content);
            newTextElement.style.marginTop = "4px";
            tracker.bodyElement.appendChild(newTextElement);
            tracker.date = currentDate;
        } else {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message-item');
            messageElement.innerHTML = `
                <div class="message-avatar" data-action="open-profile" data-id="${senderId}" data-nickname="${senderName}" style="cursor: pointer;">
                    <img src="${avatarSrc}" alt="${senderName}">
                </div>
                <div class="message-body">
                    <div class="message-header">
                        <span class="message-sender" data-action="open-profile" data-id="${senderId}" data-nickname="${senderName}" style="cursor: pointer;">${senderName}</span>
                        <span class="message-time">${formatTime(msg.created_at)}</span>
                    </div>
                    <div class="message-text">${escapeHTML(msg.content)}</div>
                </div>
            `;
            fragment.appendChild(messageElement);
            tracker.sender = senderName;
            tracker.date = currentDate;
            tracker.bodyElement = messageElement.querySelector('.message-body');
        }
    });

    return fragment;
}

export function appendMessage(msg) {
    const chatZone = document.getElementById('chatContainer');
    if (!chatZone) return;

    const fragment = createMessageElements([msg], true);
    if (fragment.childNodes.length > 0) {
        chatZone.appendChild(fragment);
        chatZone.scrollTop = chatZone.scrollHeight;
    }
}

export async function loadHistory(type, id, options = {}) {
    const { nickname = null, avatar = null, isLoadMore = false } = options;
    const chatZone = document.getElementById('chatContainer');
    const chatHeader = document.getElementById('currentServerName');

    if (!chatZone) return;

    if (!isLoadMore) {
        currentChatContext = { type, id, nickname, avatar };
        currentOffset = 0;
        hasMoreMessages = true;
        chatZone.innerHTML = '';
        lastMessageInfo = { sender: null, date: null, bodyElement: null };

        if (type === 'dm') {
            state.activeServerId = null;
            state.activeDmUserId = id;
            if (chatHeader) {
                chatHeader.innerHTML = `
                    <img src="${avatar || DEFAULT_AVATAR}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                    <span>${nickname}</span>
                `;
            }
        }
        
        if (type === 'dm') {
            loadRightPanelProfile(id, nickname, avatar);
        }
    }

    if (!hasMoreMessages || isFetching) return;
    isFetching = true;

    const endpoint = type === 'server' 
        ? `/api/messages?server_id=${id}&offset=${currentOffset}`
        : `/api/messages/private?user_id=${id}&offset=${currentOffset}`;

    const { ok, data: messages } = await apiFetch(endpoint, {}, false);

    if (ok) {
        if (!messages || messages.length < 50) hasMoreMessages = false;

        if (messages && messages.length > 0) {
            currentOffset += messages.length;
            const fragment = createMessageElements(messages, !isLoadMore);

            if (isLoadMore) {
                const oldScrollHeight = chatZone.scrollHeight;
                chatZone.insertBefore(fragment, chatZone.firstChild);
                chatZone.scrollTop = chatZone.scrollHeight - oldScrollHeight;
            } else {
                chatZone.appendChild(fragment);
                chatZone.scrollTop = chatZone.scrollHeight;
            }

            // Correction Bug Scroll : Si le conteneur n'est pas encore scrollable 
            // et qu'il reste des messages, on charge la page suivante automatiquement.
            if (chatZone.scrollHeight <= chatZone.clientHeight && hasMoreMessages) {
                isFetching = false; // On libère pour le prochain appel
                return loadHistory(type, id, { ...options, isLoadMore: true });
            }
        } else if (!isLoadMore && type === 'dm') {
            chatZone.innerHTML = `<div class="chat-welcome">C'est le début de votre conversation avec ${escapeHTML(nickname)} !</div>`;
        }
    }

    isFetching = false;
}

// Alias pour compatibilité descendante si nécessaire
export const loadServerHistory = (serverId, isLoadMore = false) => loadHistory('server', serverId, { isLoadMore });
export const loadPrivateHistory = (userId, nickname, avatarSrc, isLoadMore = false) => 
    loadHistory('dm', userId, { nickname, avatar: avatarSrc, isLoadMore });

export function setupChatDelegation() {
    const chatZone = document.getElementById('chatContainer');
    if (!chatZone) return;

    chatZone.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action="open-profile"]');
        if (target) {
            const { id, nickname } = target.dataset;
            const avatarSrc = target.querySelector('img')?.src || DEFAULT_AVATAR;
            const { openUserProfile } = await import('./users.js');
            openUserProfile(id, nickname, avatarSrc);
        }
    });

    chatZone.addEventListener('scroll', () => {
        if (chatZone.scrollTop === 0 && hasMoreMessages && !isFetching) {
            loadHistory(currentChatContext.type, currentChatContext.id, { 
                nickname: currentChatContext.nickname, 
                avatar: currentChatContext.avatar, 
                isLoadMore: true 
            });
        }
    });
}

export function blockChatTemporarily(isMuted, until = null) {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendMessage');
    if (!input || !btn) return;

    if (isMuted) {
        input.disabled = true;
        btn.disabled = true;
        input.classList.add('chat-blocked');
        btn.innerHTML = "⏳";

        if (until) {
            const time = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            input.placeholder = `Muet jusqu'à ${time}`;
        } else {
            input.placeholder = "🔇 réduit au silence...";
        }
    } else {
        input.disabled = false;
        btn.disabled = false;
        input.classList.remove('chat-blocked');
        input.placeholder = "Votre message";
        btn.innerHTML = ''; 
    }
}