const app = document.getElementById('app');

// Le "Routeur" de ta SPA
function router(page) {
    switch (page) {
        case 'home':
            renderHome();
            break;
        case 'login':
            renderLogin();
            break;
        case 'register':
            renderRegister();
            break;
        default:
            app.innerHTML = "<h1>404 - Page non trouvée</h1>";
    }
}

function renderHome() {
    app.innerHTML = `
        <h1>Bienvenue sur le Forum</h1>
        <p>Ceci est l'accueil. Connecte-toi pour discuter en temps réel !</p>
    `;
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
    `;
    
    // On écoute la soumission du formulaire
    document.getElementById('regForm').onsubmit = async (e) => {
        e.preventDefault();
        console.log("Tentative d'inscription...");
    };
}

function renderLogin() {
    app.innerHTML = `
        <h1>Connexion</h1>
        <form id="loginForm">
            <input type="text" placeholder="Email ou Pseudo" required><br>
            <input type="password" placeholder="Mot de passe" required><br>
            <button type="submit">Se connecter</button>
        </form>
    `;
}

// Au chargement initial, on affiche l'accueil
router('home');