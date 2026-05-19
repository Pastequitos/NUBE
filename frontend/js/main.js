{ }
import { state } from './state.js';
import { DEFAULT_AVATAR, loadComponent } from './utils.js';
import { connectWS } from './websocket.js';
import { loadServers, setupServerListDelegation } from './server.js';
import { setupModalListeners } from './modals.js';
import { setupChatListeners } from './chat.js';
import { router, checkAuth } from './auth.js';
import { loadFriendsList, setupUserContainerDelegation, setupContactContainerDelegation } from './users.js';
import { setupChatDelegation } from './messages.js';
import { initCursorFollower } from './background.js';
import { openSettings } from './settings.js';

import { initLiquidGlassEngine, addLiquidGlassElement } from './liquidGlass.js';

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

    const chatWrapper = document.getElementById('chatGlassWrapper');
    if (chatWrapper) {
        chatWrapper.innerHTML = await loadComponent('/frontend/components/messageContainer.html');
    }

    await Promise.all([
        loadServers(),
        loadFriendsList()
    ]);

    setupChatListeners();
    setupChatDelegation();
    setupModalListeners();
    setupUserContainerDelegation();
    setupContactContainerDelegation();
    setupServerListDelegation();

    const btnSettings = document.getElementById('btnOpenSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', () => openSettings());
    }

    const backBtn = document.getElementById('chatBackButton');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            const appEl = document.getElementById('app');
            if (appEl) {
                appEl.classList.remove('is-chat-active');
            }
        });
    }


    setTimeout(() => {
        const elements = [
            { id: 'chatHeader', config: { radius: 28.0, bezel: 28.0, thickness: 30.0, ior: 2.2, brightness: 0.8 } },
            { id: 'chatGlassWrapper', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7 } },
            { id: 'userPanel', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7, order: 2 } },
            { id: 'contactContainer', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7 } },
            { id: 'userContainer', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7 } },
            { id: 'messageInputWrapper', config: { radius: 38.0, bezel: 38.0, thickness: 20.0, ior: 2.0, brightness: 0.6, interactive: true } },
            { id: 'sendBtnWrapper', config: { radius: 38.0, bezel: 38.0, thickness: 15.0, ior: 1.5, brightness: 0.8, interactive: true } },
            { id: 'openModalBtn', config: { radius: 23.0, bezel: 23.0, thickness: 15.0, ior: 1.8, brightness: 0.8, interactive: true } }
        ];

        elements.forEach(el => {
            if (document.getElementById(el.id)) {
                addLiquidGlassElement(el.id, el.config);
            }
        });

    }, 150);
}

export const DEFAULT_BG = "/frontend/assets/background/bg1.jpg";
const savedBg = localStorage.getItem('nubeBackground') || DEFAULT_BG;
const bgWithBuster = savedBg + (savedBg.startsWith('/uploads/') ? `?t=${Date.now()}` : '');
document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${bgWithBuster}")`;
document.body.style.backgroundSize = "cover";
document.body.style.backgroundAttachment = "fixed";
document.body.style.backgroundPosition = "center";

initLiquidGlassEngine(bgWithBuster);


initGlobalComponents().then(() => {
    checkAuth();
});