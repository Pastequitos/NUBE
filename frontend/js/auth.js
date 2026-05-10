// auth.js
import { state } from './state.js';
import { loadComponent } from './utils.js';
import { renderHome } from './main.js';

// 🌟 1. ON IMPORTE LE NOUVEAU SYSTÈME ICI
import { notify } from './notifications.js';
import { addLiquidGlassElement } from './liquidGlass.js';
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

    // 🌟 LE NOUVEAU CODE MAGIQUE POUR LE REGISTER 🌟
    setTimeout(() => {
        // La grande boîte principale
        addLiquidGlassElement('registerGlassBox', {
            radius: 38.0,
            bezel: 38.0,
            thickness: 50.0,
            ior: 2.2,
            brightness: 1.1,
            tint: 0.05,
            interactive: false
        });

        // Les 3 inputs
        addLiquidGlassElement("nickname", {
            radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.1, tint: 0.05, interactive: true
        });
        addLiquidGlassElement("email", {
            radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.1, tint: 0.05, interactive: true
        });
        addLiquidGlassElement("password", {
            radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.1, tint: 0.05, interactive: true
        });

        // Le bouton de validation
        addLiquidGlassElement("registerBtn", {
            radius: 26.0, bezel: 26.0, thickness: 20.0, ior: 2.2, brightness: 1.1, tint: 0.05, interactive: true
        });

        // Le lien de retour
        addLiquidGlassElement("goToLogin", {
            radius: 25.0, bezel: 25.0, thickness: 20.0, ior: 2.2, brightness: 1.1, tint: 0.05, interactive: true
        });
    }, 10);

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

    setTimeout(() => {
        addLiquidGlassElement('loginGlassBox', {
            radius: 38.0,       // Des bords bien arrondis
            bezel: 38.0,
            thickness: 50.0,    // Un beau bloc de verre épais
            ior: 2.2,           // Une bonne distorsion
            brightness: 1.1,
            tint: 0.05,
            interactive: false  // Et hop, interactif au survol !
        });

        addLiquidGlassElement("loginInput", {
            radius: 26.0,
            bezel: 26.0,
            thickness: 20.0,
            ior: 2.2,
            brightness: 1.1,
            tint: 0.05,
            interactive: true
        })
        addLiquidGlassElement("passInput", {
            radius: 26.0,
            bezel: 26.0,
            thickness: 20.0,
            ior: 2.2,
            brightness: 1.1,
            tint: 0.05,
            interactive: true
        })
        addLiquidGlassElement("loginBtn", {
            radius: 26.0,
            bezel: 26.0,
            thickness: 20.0,
            ior: 2.2,
            brightness: 1.1,
            tint: 0.05,
            interactive: true
        })
        addLiquidGlassElement("newAccount", {
            radius: 25.0,
            bezel: 25.0,
            thickness: 20.0,
            ior: 2.2,
            brightness: 1.1,
            tint: 0.05,
            interactive: true
        })
    }, 10);

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
            
            // 1. On remplit l'état global
            state.currentUser = data.nickname;
            state.userId = String(data.id);
            state.userAvatar = data.avatar;

            // 2. On affiche la structure de la page Home
            await router('home'); 

            // 🌟 3. ON CHARGE LES DONNÉES AVANT DE SÉLECTIONNER LE SALON
            // On importe dynamiquement pour éviter les dépendances circulaires
            const { loadServers, selectServer } = await import('./server.js');

            // On attend que les listes soient chargées et affichées dans le DOM
            await Promise.all([
                loadServers(),
                loadFriendsList()
            ]);

            // 🌟 4. MAINTENANT ON RECONNECTE LE DERNIER SALON
            if (data.last_server_id) {
                console.log(`🔄 Reconnexion à : ${data.last_server_id}`);
                // Un petit délai pour s'assurer que le DOM est bien rendu par loadServers
                setTimeout(() => {
                    selectServer(data.last_server_id);
                }, 50);
            }

        } else {
            router('login');
        }
    } catch (err) { 
        console.error("Erreur checkAuth:", err);
        router('login'); 
    }
}