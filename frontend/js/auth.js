
import { state } from './state.js';
import { loadComponent, apiFetch } from './utils.js';
import { renderHome } from './main.js';

import { notify } from './notifications.js';
import { addLiquidGlassElement, applyLiquidGlass } from './liquidGlass.js';
import { loadFriendsList } from './users.js';

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

    applyLiquidGlass(document.getElementById('registerGlassBox'), {
        radius: 38.0,
        bezel: 38.0,
        thickness: 50.0,
        ior: 2.2,
        brightness: 1.0,
        tint: 0.05,
        interactive: false
    });

    applyLiquidGlass(document.getElementById('nickname'), {
        radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.0, tint: 0.05, interactive: true
    });
    applyLiquidGlass(document.getElementById('email'), {
        radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.0, tint: 0.05, interactive: true
    });
    applyLiquidGlass(document.getElementById('password'), {
        radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.0, tint: 0.05, interactive: true
    });

    applyLiquidGlass(document.getElementById('registerBtn'), {
        radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.0, tint: 0.05, interactive: true
    });

    applyLiquidGlass(document.getElementById('goToLogin'), {
        radius: 25.0, bezel: 25.0, thickness: 20.0, ior: 2.2, brightness: 1.0, tint: 0.05, interactive: true
    });

    document.getElementById('regForm').onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            nickname: document.getElementById('nickname').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        };

        const { ok } = await apiFetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (ok) {
            notify.success("Compte créé avec succès !");
            router('login');
        }
    };
}

export async function renderLogin() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = await loadComponent('/frontend/components/login.html');

    applyLiquidGlass(document.getElementById('loginGlassBox'), {
        radius: 38.0,
        bezel: 38.0,
        thickness: 50.0,
        ior: 2.2,
        brightness: 1.0,
        tint: 0.05,
        interactive: false
    });

    applyLiquidGlass(document.getElementById('loginInput'), {
        radius: 26.0,
        bezel: 26.0,
        thickness: 20.0,
        ior: 2.2,
        brightness: 1.0,
        tint: 0.05,
        interactive: true
    });
    applyLiquidGlass(document.getElementById('passInput'), {
        radius: 26.0,
        bezel: 26.0,
        thickness: 20.0,
        ior: 2.2,
        brightness: 1.0,
        tint: 0.05,
        interactive: true
    });
    applyLiquidGlass(document.getElementById('loginBtn'), {
        radius: 26.0,
        bezel: 26.0,
        thickness: 20.0,
        ior: 2.2,
        brightness: 1.0,
        tint: 0.05,
        interactive: true
    });
    applyLiquidGlass(document.getElementById('newAccount'), {
        radius: 25.0,
        bezel: 25.0,
        thickness: 20.0,
        ior: 2.2,
        brightness: 1.0,
        tint: 0.05,
        interactive: true
    });

    const form = document.getElementById('loginForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                login: document.getElementById('loginInput').value,
                password: document.getElementById('passInput').value
            };
            const { ok, data: result, error } = await apiFetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (ok) {
                state.currentUser = result.nickname;
                state.userId = String(result.id);

                notify.success(`Content de te revoir, ${result.nickname} !`);
                router('home');
            }
        };
    }
}

export async function handleLogout() {
    const { ok } = await apiFetch('/api/logout', { method: 'POST' });
    if (ok) {
        state.currentUser = null;
        state.userId = null;
        if (state.socket) state.socket.close();

        notify.info("Tu as bien été déconnecté.");
        router('login');
    }
}

export async function checkAuth() {
    const { ok, data } = await apiFetch('/api/me', {}, false); // false to not show error notification
    if (ok) {
        state.currentUser = data.nickname;
        state.userId = String(data.id);
        state.userAvatar = data.avatar;

        if (data.background) {
            localStorage.setItem('nubeBackground', data.background);
            const bgWithBuster = data.background + (data.background.startsWith('/uploads/') ? `?t=${Date.now()}` : '');
            document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${bgWithBuster}")`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundAttachment = "fixed";
            document.body.style.backgroundPosition = "center";

            // Mise à jour de la réfraction WebGL du Liquid Glass
            import('./liquidGlass.js').then(({ changeLiquidGlassBackground }) => {
                changeLiquidGlassBackground(bgWithBuster);
            }).catch(err => console.error("Erreur de mise à jour Liquid Glass:", err));
        }


        await router('home');

        const { loadServers, selectServer } = await import('./server.js');

        await Promise.all([
            loadServers(),
            loadFriendsList()
        ]);

        if (data.last_server_id) {
            setTimeout(() => {
                selectServer(data.last_server_id);
            }, 50);
        }
    } else {
        router('login');
    }
}