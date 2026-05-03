import { state } from './state.js';

export function setupChatListeners() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendMessage');

    const sendMessage = () => {
        const text = input.value.trim();
        if (text === "" || !state.activeServerId || !state.socket) return;
        
        state.socket.send(JSON.stringify({
            type: "public",
            sender: state.currentUser,
            content: text,
            server_id: state.activeServerId,
            message_type: "user"
        }));
        input.value = "";
    };

    if (input) input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    if (btn) btn.onclick = sendMessage;
}