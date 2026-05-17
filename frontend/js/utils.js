import { notify } from './notifications.js';

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

export async function apiFetch(url, options = {}, showError = true) {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        let data = null;
        
        try {
            data = JSON.parse(text);
        } catch (e) {
            // Not JSON
        }
        
        if (!res.ok) {
            let errorMsg = (data && data.message) ? data.message : (text || "Erreur serveur");
            
            // Avoid displaying raw JSON strings as error messages
            if (typeof errorMsg === 'string' && errorMsg.startsWith('{')) {
                errorMsg = "Erreur serveur";
            }

            if (showError) notify.error(errorMsg);
            return { ok: false, status: res.status, data, error: errorMsg };
        }
        
        return { ok: true, status: res.status, data, error: null };
    } catch (err) {
        if (showError) notify.error("Erreur de connexion au serveur.");
        return { ok: false, status: 0, data: null, error: "Erreur réseau" };
    }
}

export async function closeModalWithAnimation(container) {
    if (!container || container.style.display === 'none') return;

    container.classList.add('modal-closing');

    // On attend la fin de l'animation (0.4s définie dans le CSS)
    await new Promise(resolve => setTimeout(resolve, 400));

    container.style.display = 'none';
    container.innerHTML = '';
    container.classList.remove('modal-closing');
}

export function extractBannerGradient(avatarSrc) {
    return new Promise((resolve) => {
        if (!avatarSrc || avatarSrc === DEFAULT_AVATAR || avatarSrc.includes('default_avatar')) {
            // Fallback pour l'avatar par défaut (un dégradé bleu/violet NUBE)
            resolve('linear-gradient(135deg, #2b5876 0%, #4e4376 100%)');
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = avatarSrc;

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 10;
                canvas.height = 10;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 10, 10);
                const imgData = ctx.getImageData(0, 0, 10, 10).data;

                let r1 = 0, g1 = 0, b1 = 0, count1 = 0;
                let r2 = 0, g2 = 0, b2 = 0, count2 = 0;

                for (let i = 0; i < imgData.length; i += 4) {
                    const r = imgData[i];
                    const g = imgData[i+1];
                    const b = imgData[i+2];
                    const a = imgData[i+3];

                    if (a < 50) continue; // ignore transparents

                    const pixelIndex = i / 4;
                    if (pixelIndex < 50) {
                        r1 += r; g1 += g; b1 += b;
                        count1++;
                    } else {
                        r2 += r; g2 += g; b2 += b;
                        count2++;
                    }
                }

                let color1 = 'rgba(88, 101, 242, 0.8)';
                let color2 = 'rgba(35, 165, 89, 0.8)';

                if (count1 > 0) {
                    color1 = `rgb(${Math.round(r1 / count1)}, ${Math.round(g1 / count1)}, ${Math.round(b1 / count1)})`;
                }
                if (count2 > 0) {
                    color2 = `rgb(${Math.round(r2 / count2)}, ${Math.round(g2 / count2)}, ${Math.round(b2 / count2)})`;
                }

                resolve(`linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`);
            } catch (e) {
                resolve('linear-gradient(135deg, #5865f2 0%, #23a559 100%)');
            }
        };

        img.onerror = () => {
            resolve('linear-gradient(135deg, #5865f2 0%, #23a559 100%)');
        };
    });
}