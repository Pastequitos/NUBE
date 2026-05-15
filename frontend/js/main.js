// main.js
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

const appBackgroundImage = "https://photos.peopleimages.com/picture/202404/3047549-bright-fluid-and-liquid-with-neon-for-wallpaper-or-abstract-texture-water-or-design-or-futuristic.-vivid-pattern-and-energy-or-matter-with-fractal-for-background-creative-or-art-with-technology-zoom_90.jpg";

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
    // 1. Charger la structure principale
    const appHTML = await loadComponent('/frontend/components/main.html');
    app.innerHTML = appHTML;

    // 2. Charger spécifiquement le conteneur de message dans son wrapper
    const chatWrapper = document.getElementById('chatGlassWrapper');
    if (chatWrapper) {
        chatWrapper.innerHTML = await loadComponent('/frontend/components/messageContainer.html');
    }

    // 3. Charger les données
    await Promise.all([
        loadServers(),
        loadFriendsList()
    ]);

    // 4. Listeners
    setupChatListeners();
    setupModalListeners();

    const btnSettings = document.getElementById('btnOpenSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', () => openSettings());
    }

    // 5. Appliquer le Liquid Glass avec un délai de sécurité
    setTimeout(() => {
        const elements = [
            { id: 'chatGlassWrapper', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7 } },
            { id: 'userPanel', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7 } },
            { id: 'contactContainer', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7 } },
            { id: 'userContainer', config: { radius: 38.0, bezel: 38.0, thickness: 40.0, ior: 3.0, brightness: 0.7 } },
            { id: 'messageInputWrapper', config: { radius: 38.0, bezel: 38.0, thickness: 20.0, ior: 2.0, brightness: 0.6, interactive: true } },
            { id: 'sendBtnWrapper', config: { radius: 38.0, bezel: 38.0, thickness: 15.0, ior: 1.5, brightness: 0.8, interactive: true } }
        ];

        elements.forEach(el => {
            if (document.getElementById(el.id)) {
                addLiquidGlassElement(el.id, el.config);
            }
        });
    }, 150);
}

// 1. Initialise le moteur 3D immédiatement (pour le fond fluide)
initLiquidGlassEngine(appBackgroundImage);

// 2. Initialise les notifications puis vérifie l'Auth
initGlobalComponents().then(() => {
    checkAuth();
});