// Lecture avec mémoire : les rendez-vous du haut de l'accueil s'affichent tout de suite avec la
// dernière réponse connue (gardée dans ce navigateur), pendant qu'une lecture fraîche la remplace
// pour la visite suivante. Sans mémoire (première visite, trop ancienne, navigateur qui refuse
// le stockage), on attend le réseau comme avant. Aucune donnée personnelle : seulement des dates publiques.
const PREFIXE = "bo-cache:";
const VALIDE_MS = 6 * 3600 * 1000; // au-delà, on préfère attendre des dates à jour

export function lireMemoire(cle) {
  try {
    const brut = localStorage.getItem(PREFIXE + cle);
    if (!brut) return null;
    const { t, v } = JSON.parse(brut);
    return typeof t === "number" && Date.now() - t < VALIDE_MS ? v : null;
  } catch { return null; }
}
export function ecrireMemoire(cle, valeur) {
  try { localStorage.setItem(PREFIXE + cle, JSON.stringify({ t: Date.now(), v: valeur })); } catch { /* stockage plein ou refusé */ }
}
// Renvoie tout de suite la valeur gardée si elle existe (en rafraîchissant en arrière-plan), sinon attend `lire()`.
export function avecMemoire(cle, lire) {
  const frais = lire().then((v) => { ecrireMemoire(cle, v); return v; });
  const gardee = lireMemoire(cle);
  if (gardee === null) return frais;
  frais.catch(() => {}); // l'échec du rafraîchissement ne gêne pas : on a déjà de quoi afficher
  return Promise.resolve(gardee);
}
