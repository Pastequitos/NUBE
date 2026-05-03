// utils.js

/**
 * Charge le contenu HTML d'un fichier composant.
 */
export async function loadComponent(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error("Composant introuvable");
        return await response.text();
    } catch (err) {
        console.error(err);
        return `<p style="color:red">Erreur de chargement du composant.</p>`;
    }
}