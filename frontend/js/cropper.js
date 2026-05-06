import { loadComponent } from './utils.js';

let isInitialized = false;
let onCompleteCallback = null;

// État de l'image
let imgX = 0, imgY = 0; // Décalage par rapport au centre
let zoom = 1;
let sBase = 1; // Échelle de base pour que l'image couvre tout le masque au minimum
let nW = 0, nH = 0; // Taille naturelle de l'image
const MASK_SIZE = 200; // Taille du masque CSS en pixels

export async function openCropper(file, onComplete) {
    onCompleteCallback = onComplete;

    // 🌟 LA CORRECTION EST ICI 👇
    if (!document.getElementById('cropperOverlay')) {
        const html = await loadComponent('/frontend/components/cropper.html');
        const wrapper = document.createElement('div');
        wrapper.id = 'cropper-wrapper'; // On crée un conteneur propre
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper); // On ajoute TOUT le contenu
        setupListeners();
    }

    imgX = 0; imgY = 0; zoom = 1;
    document.getElementById('cropperZoom').value = 1;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('cropperImg');
        img.onload = () => {
            nW = img.naturalWidth;
            nH = img.naturalHeight;
            sBase = Math.max(MASK_SIZE / nW, MASK_SIZE / nH);
            updateImageStyle();

            // On affiche le recadreur
            document.getElementById('cropperOverlay').style.display = 'flex';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updateImageStyle() {
    const img = document.getElementById('cropperImg');
    const currentW = nW * sBase * zoom;
    const currentH = nH * sBase * zoom;

    // Les limites pour empêcher l'image de sortir du masque rond
    const maxOffsetX = (currentW - MASK_SIZE) / 2;
    const maxOffsetY = (currentH - MASK_SIZE) / 2;

    // Clamp (restreint) la position
    imgX = Math.max(-maxOffsetX, Math.min(maxOffsetX, imgX));
    imgY = Math.max(-maxOffsetY, Math.min(maxOffsetY, imgY));

    // Applique le style
    img.style.width = `${currentW}px`;
    img.style.height = `${currentH}px`;
    img.style.left = `calc(50% + ${imgX}px)`;
    img.style.top = `calc(50% + ${imgY}px)`;
}

function setupListeners() {
    const mask = document.getElementById('cropperMask');
    const zoomInput = document.getElementById('cropperZoom');
    const btnCancel = document.getElementById('cropperCancel');
    const btnValidate = document.getElementById('cropperValidate');

    // --- Gestion du Zoom ---
    zoomInput.addEventListener('input', (e) => {
        zoom = parseFloat(e.target.value);
        updateImageStyle();
    });

    // --- Gestion du Glisser/Déposer (Pan) ---
    let isDragging = false;
    let startMouseX, startMouseY;
    let startImgX, startImgY;

    mask.addEventListener('mousedown', (e) => {
        isDragging = true;
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startImgX = imgX;
        startImgY = imgY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        imgX = startImgX + (e.clientX - startMouseX);
        imgY = startImgY + (e.clientY - startMouseY);
        updateImageStyle();
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    // --- Actions ---
    btnCancel.addEventListener('click', () => {
        document.getElementById('cropperOverlay').style.display = 'none';
        // On renvoie un résultat nul pour annuler
        if (onCompleteCallback) onCompleteCallback(null);
    });

    btnValidate.addEventListener('click', () => {
        const img = document.getElementById('cropperImg');
        const finalBase64 = extract128x128(img);

        document.getElementById('cropperOverlay').style.display = 'none';
        if (onCompleteCallback) onCompleteCallback(finalBase64);
    });
}

// 🌟 LE CŒUR DE L'ALGO : La compression en 128x128
function extract128x128(img) {
    const canvas = document.createElement('canvas');
    const TARGET_SIZE = 128;
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext('2d');

    // Taille actuelle de l'image dans l'interface
    const dW = nW * sBase * zoom;
    const dH = nH * sBase * zoom;

    // Ratio entre le masque (200px) et notre objectif (128px)
    const ratio = TARGET_SIZE / MASK_SIZE;

    // On prépare le canvas pour dessiner depuis son centre
    ctx.translate(TARGET_SIZE / 2, TARGET_SIZE / 2);
    ctx.scale(ratio, ratio);

    // On applique le décalage (pan) effectué par l'utilisateur
    ctx.translate(imgX, imgY);

    // Dessin en haute qualité
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -dW / 2, -dH / 2, dW, dH);

    // Conversion en WebP (qualité 80%) : Ultra léger pour ta DB !
    return canvas.toDataURL('image/webp', 0.8);
}