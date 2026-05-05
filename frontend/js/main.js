import { state } from './state.js';
import { loadComponent } from './utils.js';
import { connectWS } from './websocket.js';
import { loadServers } from './server.js';
import { setupModalListeners } from './modals.js';
import { setupChatListeners } from './chat.js';
import { router, checkAuth } from './auth.js';
import { loadFriendsList } from './users.js';
import { initCursorFollower } from './background.js';



export const app = document.getElementById('app');

export async function renderHome() {
    if (!state.currentUser) {
        router('login');
        return;
    }

    if (!document.getElementById('serverList')) {
        await initApp();
    } else {
        await loadServers();
        await loadFriendsList();
    }

    const usernameDisplay = document.getElementById('current-username');
    if (usernameDisplay) usernameDisplay.innerText = state.currentUser;

    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) connectWS();
}

async function initApp() {
    const appHTML = await loadComponent('/frontend/components/main.html');
    app.innerHTML = appHTML;

    await loadServers();
    await loadFriendsList();
    setupChatListeners();
    setupModalListeners();
    initCursorFollower();
}

checkAuth();

