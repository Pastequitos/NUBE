const app = document.getElementById('app');

// État global de l'application
let currentUser = null;

checkAuth();

// Le "Routeur" de ta SPA
function router(page) {
    switch (page) {
        case 'home': renderHome(); break;
        case 'login': renderLogin(); break;
        case 'register': renderRegister(); break;
    }
}

function renderHome() {
    if (currentUser) {
        app.innerHTML = `
            <h1>Ravi de vous revoir, ${currentUser} !</h1>
            <p>Le forum est à vous. Bientôt, vous pourrez créer des posts ici.</p>
            <button onclick="handleLogout()">Se déconnecter</button>
        `;
    } else {
        app.innerHTML = `
            <h1>Bienvenue sur le Forum</h1>
            <p>Ceci est l'accueil. Connecte-toi pour discuter en temps réel !</p>
        `;
    }
}

function renderRegister() {
    app.innerHTML = `
        <h1>Inscription</h1>
        <form id="regForm">
            <input type="text" id="nickname" placeholder="Pseudo" required><br>
            <input type="email" id="email" placeholder="Email" required><br>
            <input type="password" id="password" placeholder="Mot de passe" required><br>
            <button type="submit">Créer mon compte</button>
        </form>
        <p id="regMessage" style="color:red"></p>
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
                document.getElementById('regMessage').innerText = result.message || "Erreur lors de l'inscription";
            }
        } catch (err) { console.error(err); }
    };
}

function renderLogin() {
    app.innerHTML = `
        <h1>Connexion</h1>
        <form id="loginForm">
            <input type="text" id="loginInput" placeholder="Email ou Pseudo" required><br>
            <input type="password" id="passInput" placeholder="Mot de passe" required><br>
            <button type="submit">Se connecter</button>
        </form>
        <p id="loginMessage" style="color:red"></p>
    `;

    document.getElementById('loginForm').onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            login: document.getElementById('loginInput').value,
            password: document.getElementById('passInput').value
        };

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (response.ok) {
                currentUser = result.nickname;
                router('home');
            } else {
                document.getElementById('loginMessage').innerText = "Identifiants incorrects";
            }
        } catch (err) { console.error(err); }
    };
}

async function handleLogout() {
    try {
        // 1. On appelle le serveur pour détruire la session (côté Go)
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        if (response.ok) {
            currentUser = null;
            alert("Déconnexion réussie !");
            router('home');
        } else {
            console.error("Erreur lors de la déconnexion côté serveur");
        }
    } catch (err) {
        console.error("Erreur réseau :", err);
    }
}

async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.nickname;
            console.log("Session restaurée pour :", currentUser);
            router('home');
        }
    } catch (err) {
        console.log("Pas de session active.");
    }
}

router('home');