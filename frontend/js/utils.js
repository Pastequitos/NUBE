export async function loadComponent(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error("Composant introuvable");
        return await response.text();
    } catch (err) {
        
        return `<p style="color:red">Erreur de chargement du composant.</p>`;
    }
}

export const DEFAULT_AVATAR = "/frontend/assets/img/default_avatar.png";

export function updateAllAvatarsInDOM(userId, newAvatarBase64) {
    const avatarImages = document.querySelectorAll(`img[data-user-id="${userId}"]`);

    const imgSrc = newAvatarBase64 && newAvatarBase64 !== "" ? newAvatarBase64 : DEFAULT_AVATAR;

    avatarImages.forEach(img => {
        img.src = imgSrc;
    });
}

export function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}