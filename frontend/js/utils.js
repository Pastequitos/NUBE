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

export async function loadComponent(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error("Composant introuvable");
        return await response.text();
    } catch (err) {
        console.error(err);
        return `<p style="color:red">Erreur de chargement du composant.</p>`;
    }
}

export function appendMessage(msg) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;

    // --- 1. GESTION DES MESSAGES SYSTÈME (Bienvenue, etc.) ---
    if (msg.message_type === 'system') {
        const systemElement = document.createElement('div');
        systemElement.classList.add('message-item', 'system-join-message');
        
        // On utilise un format plus compact pour la bienvenue (style Discord)
        systemElement.innerHTML = `
            <div class="system-icon">✨</div>
            <div class="message-body">
                <span class="system-content">${msg.content}</span>
                <span class="message-time">${formatTime(msg.created_at)}</span>
            </div>
        `;

        chatContainer.appendChild(systemElement);
        
        // IMPORTANT : On réinitialise lastMessageInfo pour que le prochain message 
        // d'utilisateur ne tente pas de se grouper avec un message système.
        lastMessageInfo = { sender: null, date: null, bodyElement: null };
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return; // On s'arrête ici pour les messages système
    }

    // --- 2. GESTION DES MESSAGES UTILISATEURS (Ton code existant) ---
    if (chatContainer.children.length === 0) {
        lastMessageInfo = { sender: null, date: null, bodyElement: null };
    }

    const senderName = msg.sender ? msg.sender : 'Anonyme';
    const currentDate = msg.created_at ? new Date(msg.created_at) : new Date();
    const isSameSender = (lastMessageInfo.sender === senderName);

    let isWithin10Mins = false;
    if (lastMessageInfo.date) {
        const diffMs = currentDate.getTime() - lastMessageInfo.date.getTime();
        const diffMins = diffMs / (1000 * 60);
        isWithin10Mins = (diffMins <= 10);
    }

    if (isSameSender && isWithin10Mins && lastMessageInfo.bodyElement) {
        const newTextElement = document.createElement('div');
        newTextElement.classList.add('message-text');
        newTextElement.innerHTML = msg.content;
        newTextElement.style.marginTop = "4px";

        lastMessageInfo.bodyElement.appendChild(newTextElement);
        lastMessageInfo.date = currentDate;
    } else {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message-item');

        const time = formatTime(msg.created_at);

        messageElement.innerHTML = `
            <div class="message-avatar"></div>
            <div class="message-body">
                <div class="message-header">
                    <span class="message-sender">${senderName}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">
                    ${msg.content}
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

    // Nettoyage visuel immédiat
    chatContainer.innerHTML = '';

    try {
        const response = await fetch(`/api/messages?server_id=${serverId}`);
        if (response.ok) {
            const messages = await response.json();
            
            if (messages && messages.length > 0) {
                messages.forEach(msg => appendMessage(msg));
                // Petit scroll auto vers le bas après le chargement
                chatContainer.scrollTop = chatContainer.scrollHeight;
            } else {
                chatContainer.innerHTML = '<div class="chat-welcome">C\'est le début du serveur !</div>';
            }
        }
    } catch (err) {
        console.error("Erreur lors du chargement de l'historique :", err);
    }
}