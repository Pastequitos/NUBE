import { state } from './state.js';

export function setupChatListeners() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendMessage');

    const sendMessage = () => {

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

