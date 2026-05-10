import { state } from './state.js';

// 🌟 NOUVEAU : Fonction pour bloquer l'envoi en front
export function blockChatTemporarily(duration) {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendMessage');
    if (!input || !btn) return;

    const originalPlaceholder = input.placeholder;
    const originalBtnText = btn.innerHTML;

    // Désactive les éléments
    input.disabled = true;
    btn.disabled = true;
    input.classList.add('chat-blocked'); // Tu peux ajouter un style gris en CSS
    
    input.placeholder = "Trop de messages ! Attendez...";
    btn.innerHTML = "⏳";

    // Déblocage après X secondes
    setTimeout(() => {
        input.disabled = false;
        btn.disabled = false;
        input.classList.remove('chat-blocked');
        input.placeholder = originalPlaceholder;
        btn.innerHTML = originalBtnText;
        input.focus(); // Redonne le focus pour continuer à écrire
    }, duration);
}

export function setupChatListeners() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendMessage');

    const sendMessage = () => {
        // La vérification input.disabled empêche l'envoi même si l'utilisateur
        // essaie de forcer via la console ou le bouton
        if (!input || input.disabled) return; 

        const text = input.value.trim();
        if (text === "" || !state.socket) {
            input.value = "";
            return;
        }
        
        if (state.activeServerId) {
            state.socket.send(JSON.stringify({
                type: "public",
                sender: state.currentUser,
                content: text,
                server_id: state.activeServerId,
                message_type: "user"
            }));
        } 
        else if (state.activeDmUserId) {
            state.socket.send(JSON.stringify({
                type: "private",
                sender: state.currentUser,
                content: text,
                receiver_id: state.activeDmUserId,
                message_type: "user"
            }));
        }

        input.value = "";
    };

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (btn) {
        btn.addEventListener('click', sendMessage);
    }
}