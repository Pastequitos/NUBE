// auth.js
import { state } from './state.js';
import { loadComponent } from './utils.js';
import { renderHome } from './main.js';

export function router(page) {
    switch (page) {
        case 'home': renderHome(); break;
        case 'login': renderLogin(); break;
        case 'register': renderRegister(); break;
    }
}

// On expose ces fonctions globalement pour qu'elles marchent dans les "onclick" du HTML
window.router = router;
window.handleLogout = handleLogout;

export function renderRegister() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
        <h1>Inscription</h1>
        <form id="regForm">
            <input type="text" id="nickname" placeholder="Pseudo" required><br>
            <input type="email" id="email" placeholder="Email" required><br>
            <input type="password" id="password" placeholder="Mot de passe" required><br>
            <button type="submit">Créer mon compte</button>
        </form>
        <p id="regMessage" style="color:red"></p>
        <button onclick="router('login')">Déjà un compte ? Connectez-vous</button>
    `;

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
                alert("Compte créé !");
                router('login');
            } else {
                document.getElementById('regMessage').innerText = result.message || "Erreur";
            }
        } catch (err) {}
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
                    router('home');
                } else {
                    const msgEl = document.getElementById('loginMessage');
                    if (msgEl) msgEl.innerText = result.message || "Identifiants incorrects";
                }
            } catch (err) {}
        };
    }
}

export async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            state.currentUser = null;
            if (state.socket) state.socket.close();
            alert("Déconnexion !");
            router('login');
        }
    } catch (err) {}
}

export async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            state.currentUser = data.nickname;
            router('home');
        } else {
            router('login');
        }
    } catch { router('login'); }
}