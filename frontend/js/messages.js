
import { state } from './state.js';
import { DEFAULT_AVATAR, escapeHTML } from './utils.js';
import { notify } from './notifications.js';

let lastMessageInfo = {
    sender: null,
    date: null,
    bodyElement: null
};

let currentOffset = 0;
let hasMoreMessages = true;
let isFetching = false;

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
                <div class="message-avatar"><img src="${avatarSrc}" data-user-id="${senderId}"></div>
                <div class="message-body">
                    <div class="message-header">
                        <span class="message-sender">${senderName}</span>
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

export async function loadServerHistory(serverId, isLoadMore = false) {
    const chatZone = document.getElementById('chatContainer');
    if (!chatZone) return;

    if (!isLoadMore) {
        chatZone.innerHTML = '';
        lastMessageInfo = { sender: null, date: null, bodyElement: null };
        currentOffset = 0;
        hasMoreMessages = true;
        chatZone.onscroll = () => {
            if (chatZone.scrollTop === 0) {
                loadServerHistory(serverId, true);
            }
        };
    }

    if (!hasMoreMessages || isFetching) return;
    isFetching = true;

    try {
        const response = await fetch(`/api/messages?server_id=${serverId}&offset=${currentOffset}`);
        const messages = await response.json();

        if (!messages || messages.length < 20) {
            hasMoreMessages = false;
        }

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
        }
    } catch (err) {
        
    }

    isFetching = false;
}

export async function loadPrivateHistory(userId, nickname, avatarSrc = null, isLoadMore = false) {
    const chatZone = document.getElementById('chatContainer');
    const chatHeader = document.getElementById('currentServerName');

    if (!chatZone) return;

    if (!isLoadMore) {
        state.activeServerId = null;
        state.activeDmUserId = userId;

        if (chatHeader) {
            chatHeader.innerHTML = '';
            chatHeader.style.display = 'flex';
            chatHeader.style.alignItems = 'center';
            chatHeader.style.gap = '10px';

            const img = document.createElement('img');
            img.src = avatarSrc || DEFAULT_AVATAR;
            img.style.width = '24px';
            img.style.height = '24px';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';
            img.style.flexShrink = '0';

            const nameSpan = document.createElement('span');
            nameSpan.innerText = nickname;

            chatHeader.appendChild(img);
            chatHeader.appendChild(nameSpan);
        }

        chatZone.innerHTML = '';
        lastMessageInfo = { sender: null, date: null, bodyElement: null };
        currentOffset = 0;
        hasMoreMessages = true;
        chatZone.onscroll = () => {
            if (chatZone.scrollTop === 0) {
                loadPrivateHistory(userId, nickname, avatarSrc, true);
            }
        };
    }

    if (!hasMoreMessages || isFetching) return;
    isFetching = true;

    try {
        const response = await fetch(`/api/messages/private?user_id=${userId}&offset=${currentOffset}`);
        if (response.ok) {
            const messages = await response.json();

            if (!messages || messages.length < 20) {
                hasMoreMessages = false;
            }

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
            } else if (!isLoadMore) {
                chatZone.innerHTML = `<div class="chat-welcome">C'est le début de votre conversation avec ${escapeHTML(nickname)} !</div>`;
            }
        }
    } catch (err) {
        
    }

    isFetching = false;
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