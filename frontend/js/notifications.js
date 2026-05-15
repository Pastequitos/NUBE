
import { addLiquidGlassElement } from './liquidGlass.js'; 

const DEFAULT_DURATION = 4000;

function createNotification(type, message, duration = DEFAULT_DURATION) {
    const container = document.getElementById('notif-container');

    if (!container) {
        
        return; 
    }

    const notif = document.createElement('div');

    const uniqueId = `notif-glass-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    notif.id = uniqueId;
    notif.className = `notif notif-${type}`;

    const notifRadius = 28.0; 

    notif.innerHTML = `
        <span class="notif-message" style="position: relative; z-index: 1;">${message}</span>
        <span class="notif-close" style="position: relative; z-index: 1;">&times;</span>
    `;

    const removeNotif = () => {
        if (notif.classList.contains('notif-fade-out')) return;
        notif.classList.add('notif-fade-out');

        notif.addEventListener('animationend', () => {
            notif.remove();
            
        });
    };

    const autoRemoveTimer = setTimeout(removeNotif, duration);

    notif.onclick = () => {
        clearTimeout(autoRemoveTimer);
        removeNotif();
    };

    container.prepend(notif);

    setTimeout(() => {
        addLiquidGlassElement(uniqueId, { 
            radius: notifRadius, 
            bezel: notifRadius, 
            thickness: 15.0,    
            ior: 1.8,           
            brightness: 1.0,    
            interactive: true  
        });
    }, 10);
}

export const notify = {
    success: (msg, dur) => createNotification('success', msg, dur),
    error: (msg, dur) => createNotification('error', msg, dur),
    info: (msg, dur) => createNotification('info', msg, dur)
};