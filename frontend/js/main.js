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

// URL du fond d'écran global
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
    // Cette fonction ne se lance QUE si on est connecté (depuis renderHome)
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

    // 🌟 2. On applique le verre aux divs du CHAT uniquement car elles viennent d'apparaître !
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

    addLiquidGlassElement('messageInputWrapper', {
        radius: 38.0, bezel: 38.0, thickness: 20.0, ior: 2.0, brightness: 0.6, interactive: true
    });

    addLiquidGlassElement('sendBtnWrapper', {
        radius:38.0, bezel: 38.0, thickness: 15.0, ior: 1.5, brightness: 0.8, interactive: true
    });
}

// =====================================================================
// 🚀 DÉMARRAGE GLOBAL DE L'APPLICATION (S'exécute tout de suite !)
// =====================================================================

// 1. Initialise le moteur de rendu 3D DES LE DEBUT, même sur la page de login !
initLiquidGlassEngine(appBackgroundImage);

// 2. Initialise les notifications
initGlobalComponents().then(() => {
    // 3. Vérifie l'authentification (qui redirigera vers login ou home)
    checkAuth();
});

/* initCursorFollower(); */