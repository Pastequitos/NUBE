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

// 🌟 Importation du nouveau moteur optimisé
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

    const appBackgroundImage = "https://photos.peopleimages.com/picture/202404/3047549-bright-fluid-and-liquid-with-neon-for-wallpaper-or-abstract-texture-water-or-design-or-futuristic.-vivid-pattern-and-energy-or-matter-with-fractal-for-background-creative-or-art-with-technology-zoom_90.jpg";

    if (appBackgroundImage) {
        // 1. Initialise le moteur global une seule fois
        initLiquidGlassEngine(appBackgroundImage);

        // 2. On déclare les divs à transformer en verre, avec leurs paramètres propres

        addLiquidGlassElement('chatGlassWrapper', {
            radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7
        });

        addLiquidGlassElement('userPanel', {
            radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7
        });

        addLiquidGlassElement('contactContainer', {
            radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7
        });

        addLiquidGlassElement('userContainer', {
            radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7
        });

        // L'input (on réduit un peu le rayon vu que c'est plus petit)
        addLiquidGlassElement('messageInputWrapper', {
            radius: 38.0, bezel: 12.0, thickness: 20.0, ior: 2.0, brightness: 0.6, interactive: true
        });

        // Le bouton send
        addLiquidGlassElement('sendBtnWrapper', {
            radius: 38.0, bezel: 8.0, thickness: 15.0, ior: 1.5, brightness: 0.8, interactive: true
        });
    }
}

initGlobalComponents();
checkAuth();
/* initCursorFollower(); */