// messages.js
import { state } from './state.js';
import { DEFAULT_AVATAR, escapeHTML } from './utils.js';
import { notify } from './notifications.js';

let lastMessageInfo = {
    sender: null,
    date: null,
    bodyElement: null
};

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

export function appendMessage(msg) {
    // 🌟 CIBLE TOUJOURS LE CONTENEUR INTERNE
    const chatZone = document.getElementById('chatContainer');
    if (!chatZone) return;

    if (msg.message_type === 'system') {
        if (msg.content.includes('Calmos')) {
            notify.error(msg.content);
            blockChatTemporarily(true, null); // Mute indéfini ou géré par serveur
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
        chatZone.appendChild(systemElement);
        lastMessageInfo = { sender: null, date: null, bodyElement: null };
        chatZone.scrollTop = chatZone.scrollHeight;
        return;
    }

    const senderName = msg.sender ? escapeHTML(msg.sender) : 'Anonyme';
    const currentDate = msg.created_at ? new Date(msg.created_at) : new Date();
    const isSameSender = (lastMessageInfo.sender === senderName);
    const avatarSrc = msg.avatar && msg.avatar !== "" ? msg.avatar : DEFAULT_AVATAR;
    const senderId = msg.sender_id || "";

    let isWithin10Mins = false;
    if (lastMessageInfo.date) {
        const diffMs = currentDate.getTime() - lastMessageInfo.date.getTime();
        isWithin10Mins = (diffMs / (1000 * 60) <= 10);
    }

    if (isSameSender && isWithin10Mins && lastMessageInfo.bodyElement) {
        const newTextElement = document.createElement('div');
        newTextElement.classList.add('message-text');
        newTextElement.innerHTML = escapeHTML(msg.content);
        newTextElement.style.marginTop = "4px";
        lastMessageInfo.bodyElement.appendChild(newTextElement);
        lastMessageInfo.date = currentDate;
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
        chatZone.appendChild(messageElement);
        lastMessageInfo = {
            sender: senderName,
            date: currentDate,
            bodyElement: messageElement.querySelector('.message-body')
        };
    }
    chatZone.scrollTop = chatZone.scrollHeight;
}

export async function loadServerHistory(serverId) {
    // 🌟 CORRECTION : On vide chatContainer, pas messageContainer
    const chatZone = document.getElementById('chatContainer');
    if (!chatZone) return;

    chatZone.innerHTML = ''; 
    lastMessageInfo = { sender: null, date: null, bodyElement: null };

    try {
        const response = await fetch(`/api/messages?server_id=${serverId}`);
        const messages = await response.json();
        if (messages) messages.forEach(msg => appendMessage(msg));
    } catch (err) {
        console.error("Erreur chargement historique:", err);
    }
}

export async function loadPrivateHistory(userId, nickname, avatarSrc = null) {
    const chatZone = document.getElementById('chatContainer');
    const chatHeader = document.getElementById('currentServerName');

    if (!chatZone) return;

    state.activeServerId = null;
    state.activeDmUserId = userId;

    // 🌟 MISE À JOUR DU HEADER : Photo de profil + Pseudo
    if (chatHeader) {
        chatHeader.innerHTML = ''; // On vide le "@ Pseudo"
        chatHeader.style.display = 'flex';
        chatHeader.style.alignItems = 'center';
        chatHeader.style.gap = '10px';

        // Création de l'image de l'avatar
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

    try {
        const response = await fetch(`/api/messages/private?user_id=${userId}`);
        if (response.ok) {
            const messages = await response.json();
            if (messages && messages.length > 0) {
                messages.forEach(msg => appendMessage(msg));
            } else {
                chatZone.innerHTML = `<div class="chat-welcome">C'est le début de votre conversation avec ${escapeHTML(nickname)} !</div>`;
            }
        }
    } catch (err) {
        console.error("Erreur historique privé :", err);
    }
}

/**
 * Gère le blocage visuel de l'input (Mute ou Spam)
 */
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
        btn.innerHTML = ''; // L'icône est gérée par le CSS ou HTML initial
    }
}