// messages.js
import { state } from './state.js';
import { DEFAULT_AVATAR, escapeHTML } from './utils.js';
import { notify } from './notifications.js';
import { blockChatTemporarily } from './chat.js';

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

    if (dateToCompare.getTime() === today.getTime()) {
        return timeStr;
    } else if (dateToCompare.getTime() === yesterday.getTime()) {
        return `Hier à ${timeStr}`;
    } else {
        const dayStr = messageDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        return `${dayStr} à ${timeStr}`;
    }
}

export function appendMessage(msg) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;

    // --- 1. GESTION DES MESSAGES SYSTÈME ---
    if (msg.message_type === 'system') {

        // 🌟 NOUVEAU : Interception des messages Anti-Spam
        if (msg.message_type === 'system') {
            if (msg.content.includes('Calmos')) {
                notify.error(msg.content);
                blockChatTemporarily(10000); // 🌟 Bloque pendant 10 secondes (10000ms)
                return;
            }
        }

            const systemElement = document.createElement('div');
            systemElement.classList.add('message-item', 'system-join-message');

            // 🛡️ Sécurité : On échappe aussi les messages système
            systemElement.innerHTML = `
            <div class="system-icon">✨</div>
            <div class="message-body">
                <span class="system-content">${escapeHTML(msg.content)}</span>
                <span class="message-time">${formatTime(msg.created_at)}</span>
            </div>
        `;

            chatContainer.appendChild(systemElement);

            lastMessageInfo = { sender: null, date: null, bodyElement: null };
            chatContainer.scrollTop = chatContainer.scrollHeight;
            return;
        }

        // --- 2. GESTION DES MESSAGES UTILISATEURS ---
        if (chatContainer.children.length === 0) {
            lastMessageInfo = { sender: null, date: null, bodyElement: null };
        }

        // 🛡️ Sécurité : On échappe le pseudo
        const senderName = msg.sender ? escapeHTML(msg.sender) : 'Anonyme';
        const currentDate = msg.created_at ? new Date(msg.created_at) : new Date();
        const isSameSender = (lastMessageInfo.sender === senderName);

        const avatarSrc = msg.avatar && msg.avatar !== "" ? msg.avatar : DEFAULT_AVATAR;
        const senderId = msg.sender_id || "";

        let isWithin10Mins = false;
        if (lastMessageInfo.date) {
            const diffMs = currentDate.getTime() - lastMessageInfo.date.getTime();
            const diffMins = diffMs / (1000 * 60);
            isWithin10Mins = (diffMins <= 10);
        }

        if (isSameSender && isWithin10Mins && lastMessageInfo.bodyElement) {
            const newTextElement = document.createElement('div');
            newTextElement.classList.add('message-text');

            // 🛡️ Sécurité : On échappe le contenu du message ajouté
            newTextElement.innerHTML = escapeHTML(msg.content);
            newTextElement.style.marginTop = "4px";

            lastMessageInfo.bodyElement.appendChild(newTextElement);
            lastMessageInfo.date = currentDate;
        } else {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message-item');

            const time = formatTime(msg.created_at);

            // 🛡️ Sécurité : On échappe le contenu dans le bloc complet
            messageElement.innerHTML = `
            <div class="message-avatar">
                <img src="${avatarSrc}" data-user-id="${senderId}">
            </div>
            <div class="message-body">
                <div class="message-header">
                    <span class="message-sender">${senderName}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">
                    ${escapeHTML(msg.content)}
                </div>
            </div>
        `;

            chatContainer.appendChild(messageElement);

            lastMessageInfo = {
                sender: senderName,
                date: currentDate,
                bodyElement: messageElement.querySelector('.message-body')
            };
        }

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    export async function loadServerHistory(serverId) {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;

        chatContainer.innerHTML = '';

        try {
            const response = await fetch(`/api/messages?server_id=${serverId}`);
            if (response.ok) {
                const messages = await response.json();

                if (messages && messages.length > 0) {
                    messages.forEach(msg => appendMessage(msg));
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                } else {
                    chatContainer.innerHTML = '<div class="chat-welcome">C\'est le début du serveur !</div>';
                }
            }
        } catch (err) {
            console.error("Erreur lors du chargement de l'historique :", err);
        }
    }

    export async function loadPrivateHistory(userId, nickname) {
        const chatContainer = document.getElementById('chatContainer');
        const chatHeader = document.getElementById('currentServerName');

        if (!chatContainer) return;

        state.activeServerId = null;
        state.activeDmUserId = userId;

        if (chatHeader) {
            // 🛡️ Sécurité : Même le titre du chat est échappé au cas où le pseudo serait malveillant
            chatHeader.innerText = `@ ${escapeHTML(nickname)}`;
        }

        chatContainer.innerHTML = '';

        try {
            const response = await fetch(`/api/messages/private?user_id=${userId}`);
            if (response.ok) {
                const messages = await response.json();

                if (messages && messages.length > 0) {
                    messages.forEach(msg => appendMessage(msg));
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                } else {
                    // 🛡️ Sécurité : On échappe aussi le nickname dans le message de bienvenue
                    chatContainer.innerHTML = `<div class="chat-welcome">C'est le début de votre conversation avec ${escapeHTML(nickname)} !</div>`;
                }
            }
        } catch (err) {
            console.error("Erreur lors du chargement de l'historique privé :", err);
        }
    }