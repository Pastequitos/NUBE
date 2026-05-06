import { state } from './state.js';
import { DEFAULT_AVATAR, loadComponent } from './utils.js';
import { connectWS } from './websocket.js';
import { loadServers } from './server.js';
import { setupModalListeners } from './modals.js';
import { setupChatListeners } from './chat.js';
import { router, checkAuth } from './auth.js';
import { loadFriendsList } from './users.js';
import { initCursorFollower } from './background.js';
import { openSettings } from './settings.js';

export const app = document.getElementById('app');

async function initGlobalComponents() {
    const globalDiv = document.createElement('div');
    globalDiv.id = 'global-components';
    document.body.appendChild(globalDiv);

    globalDiv.innerHTML = await loadComponent('/frontend/components/notif.html');
}

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

    const usernameDisplay = document.getElementById('currentUserName');
    if (usernameDisplay) usernameDisplay.innerText = state.currentUser;

    const userAvatarDisplay = document.getElementById('currentUserAvatar');
    if (userAvatarDisplay) {
        userAvatarDisplay.src = state.userAvatar && state.userAvatar !== "" ? state.userAvatar : DEFAULT_AVATAR;
        userAvatarDisplay.setAttribute('data-user-id', state.userId);
    }

    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) connectWS();
}

async function initApp() {
    const appHTML = await loadComponent('/frontend/components/main.html');
    app.innerHTML = appHTML;

    await loadServers();
    await loadFriendsList();
    setupChatListeners();
    setupModalListeners();

    const btnSettings = document.getElementById('btnOpenSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            openSettings();
        });
    }
}

initGlobalComponents();
checkAuth();
initCursorFollower();