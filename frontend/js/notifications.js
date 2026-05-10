// frontend/js/notifications.js
import { addLiquidGlassElement } from './liquidGlass.js'; // 🌟 N'oublie pas l'import !

const DEFAULT_DURATION = 4000;

function createNotification(type, message, duration = DEFAULT_DURATION) {
    const container = document.getElementById('notif-container');
    
    // Si le conteneur n'est pas encore chargé dans le DOM, on abandonne
    if (!container) {
        console.warn("Le conteneur de notifications n'est pas encore chargé.");
        return; 
    }

    const notif = document.createElement('div');
    
    // 🌟 1. Création d'un ID unique basé sur l'heure exacte et un nombre aléatoire
    const uniqueId = `notif-glass-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    notif.id = uniqueId;
    notif.className = `notif notif-${type}`;
    
    // 🌟 2. On injecte le CSS "Blindé" pour forcer l'effet Liquid Glass
    const notifRadius = 28.0; // Ajuste si tes notifications sont plus ou moins arrondies


    // 🌟 3. On ajoute le contenu, en forçant le z-index: 1 pour qu'il passe DEVANT le verre
    notif.innerHTML = `
        <span class="notif-message" style="position: relative; z-index: 1;">${message}</span>
        <span class="notif-close" style="position: relative; z-index: 1;">&times;</span>
    `;

    const removeNotif = () => {
        if (notif.classList.contains('notif-fade-out')) return;
        notif.classList.add('notif-fade-out');
        
        // Quand l'animation CSS de disparition est finie, on supprime du DOM
        notif.addEventListener('animationend', () => {
            notif.remove();
            // Le WebGL détectera tout seul que l'ID n'existe plus et supprimera le bloc de verre !
        });
    };

    const autoRemoveTimer = setTimeout(removeNotif, duration);

    notif.onclick = () => {
        clearTimeout(autoRemoveTimer);
        removeNotif();
    };

    container.prepend(notif);

    // 🌟 4. On appelle le moteur WebGL avec un petit délai pour être sûr qu'il est dans le DOM
    setTimeout(() => {
        addLiquidGlassElement(uniqueId, { 
            radius: notifRadius, 
            bezel: notifRadius, 
            thickness: 15.0,    // Un verre un peu plus fin pour les notifications
            ior: 1.8,           // Distorsion moyenne
            brightness: 1.0,    // Assez clair pour bien les voir
            interactive: true  
        });
    }, 10);
}

export const notify = {
    success: (msg, dur) => createNotification('success', msg, dur),
    error: (msg, dur) => createNotification('error', msg, dur),
    info: (msg, dur) => createNotification('info', msg, dur)
};