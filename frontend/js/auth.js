// auth.js
import { state } from './state.js';
import { loadComponent } from './utils.js';
import { renderHome } from './main.js';

// 🌟 1. ON IMPORTE LE NOUVEAU SYSTÈME ICI
import { notify } from './notifications.js';

export function router(page) {
    switch (page) {
        case 'home': renderHome(); break;
        case 'login': renderLogin(); break;
        case 'register': renderRegister(); break;
    }
}

window.router = router;
window.handleLogout = handleLogout;

export async function renderRegister() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = await loadComponent('/frontend/components/register.html');

    document.getElementById('regForm').onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            nickname: document.getElementById('nickname').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        };

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (response.ok) {
                notify.success("Compte créé avec succès !");
                router('login');
            } else {
                notify.error(result.message || "Erreur lors de l'inscription");
            }
        } catch (err) {
            notify.error("Impossible de joindre le serveur.");
        }
    };
}

export async function renderLogin() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = await loadComponent('/frontend/components/login.html');

    const form = document.getElementById('loginForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                login: document.getElementById('loginInput').value,
                password: document.getElementById('passInput').value
            };
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();

                if (res.ok) {
                    state.currentUser = result.nickname;
                    state.userId = String(result.id);

                    notify.success(`Content de te revoir, ${result.nickname} !`);
                    router('home');
                } else {
                    notify.error(result.message || "Identifiants incorrects");
                }
            } catch (err) {
                notify.error("Erreur de connexion au serveur.");
            }
        };
    }
}

export async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            state.currentUser = null;
            state.userId = null;
            if (state.socket) state.socket.close();

            notify.info("Tu as bien été déconnecté.");
            router('login');
        }
    } catch (err) {
        notify.error("Erreur lors de la déconnexion.");
    }
}

export async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            state.currentUser = data.nickname;
            state.userId = String(data.id);

            state.userAvatar = data.avatar;

            console.log(data);
            console.log(state);

            router('home');
        } else {
            router('login');
        }
    } catch { router('login'); }
}