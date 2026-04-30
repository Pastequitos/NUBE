import { state } from './state.js';
import { appendMessage, loadServerMembers } from './utils.js';

export function connectWS() {
    // On récupère le protocole (ws ou wss)
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    state.socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

/*     state.socket.onopen = () => {
        console.log("✅ Connecté au WebSocket");
    }; */

    state.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "public") {
            if (data.server_id === state.activeServerId) {
                appendMessage(data);
            }
        }

        if (data.type === "user_status") {
            const memberEl = document.getElementById(`member-${data.user_id}`);
            
            if (memberEl) {
                if (data.status === "online") {
                    memberEl.classList.remove("offline");
                    memberEl.classList.add("online");
                } else {
                    memberEl.classList.remove("online");
                    memberEl.classList.add("offline");
                }
            }
        }

        if (data.type === "member_join") {
            if (data.server_id === state.activeServerId) {
                loadServerMembers(data.server_id);
            }
        }
    };

    state.socket.onclose = () => {
        /* console.log("❌ WebSocket déconnecté. Tentative de reconnexion..."); */
        setTimeout(connectWS, 3000); // Reconnexion auto après 3 secondes
    };

    state.socket.onerror = (error) => {
        console.error("⚠️ Erreur WebSocket:", error);
    };
}