import { state } from './state.js';
import { appendMessage } from './utils.js';

export function connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    state.socket = new WebSocket(wsUrl);

    state.socket.onopen = () => console.log("🚀 WebSocket : Connecté !");

    state.socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        appendMessage(msg); 
    };

    state.socket.onerror = (error) => console.error("⚠️ Erreur WS :", error);
    state.socket.onclose = () => console.log("❌ WS déconnecté.");
}