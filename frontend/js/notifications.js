// frontend/js/notifications.js

const DEFAULT_DURATION = 4000;

function createNotification(type, message, duration = DEFAULT_DURATION) {
    const container = document.getElementById('notif-container');
    
    // Si le conteneur n'est pas encore chargé dans le DOM, on abandonne
    if (!container) {
        console.warn("Le conteneur de notifications n'est pas encore chargé.");
        return; 
    }

    const notif = document.createElement('div');
    notif.className = `notif notif-${type}`;
    
    notif.innerHTML = `
        <span class="notif-message">${message}</span>
        <span class="notif-close">&times;</span>
    `;

    const removeNotif = () => {
        if (notif.classList.contains('notif-fade-out')) return;
        notif.classList.add('notif-fade-out');
        notif.addEventListener('animationend', () => notif.remove());
    };

    const autoRemoveTimer = setTimeout(removeNotif, duration);

    notif.onclick = () => {
        clearTimeout(autoRemoveTimer);
        removeNotif();
    };

    container.prepend(notif);
}

export const notify = {
    success: (msg, dur) => createNotification('success', msg, dur),
    error: (msg, dur) => createNotification('error', msg, dur),
    info: (msg, dur) => createNotification('info', msg, dur)
};