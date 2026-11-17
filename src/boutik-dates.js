// Prochaines ouvertures de la P'tite Boutik, lues dans sa base (Firestore, lecture publique) :
// règles habituelles (ex. 1ers et 3es mercredis et samedis), fermetures et ouvertures exceptionnelles.
// Le calcul reprend src/composables/openingDates.js du dépôt vbelleton/petite_boutik_solidaire
// (recurringDates + buildOpeningDates) : si la règle change là-bas, la reporter ici.

import { avecMemoire } from "./cache-lecture.js";

const PROJET = "la-petite-boutik";
// Clé publique du site de la boutique (elle est déjà dans son code, ce n'est pas un secret).
const CLE = "AIzaSyDaNRFLH7axpTrv8Es16_3gJeWKmUMloIo";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJET}/databases/(default)/documents`;
const DELAI_MS = 8000;

export const REGLES_DEFAUT = [
  { jour: 3, semaines: [1, 3], label: "mercredi" },
  { jour: 6, semaines: [1, 3], label: "samedi" },
];

// Valeur Firestore (format REST) → valeur JavaScript simple.
export function valeur(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valeur);
  if ("mapValue" in v) return champs(v.mapValue.fields);
  return null;
}
export const champs = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, valeur(v)]));

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const nthWeekday = (year, month, weekday, n) => {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
};

// Motif d'une ouverture exceptionnelle (champ « label » de l'admin de la boutique), sans répéter
// « Ouverture exceptionnelle » : même règle que extraMotif() de openingDates.js.
export function motif(label) {
  const t = String(label || "").trim();
  return t.toLowerCase() === "ouverture exceptionnelle" ? "" : t;
}

// Dates d'ouverture à venir (fermetures retirées), triées : { date, horaires, motif, exceptionnelle }.
// Dans l'admin de la boutique (Calendrier), un jour habituel peut recevoir un motif (ex. Journée portes
// ouvertes) et des horaires particuliers : c'est une « ouverture exceptionnelle » posée sur la même date.
export function ouvertures({ regles = REGLES_DEFAUT, fermetures = [], extras = [], mois = 3, today = new Date() }) {
  const debut = new Date(today); debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut); fin.setMonth(fin.getMonth() + mois);
  const parIso = new Map();
  const curseur = new Date(debut.getFullYear(), debut.getMonth(), 1);
  while (curseur <= fin) {
    for (const r of regles) {
      const jour = typeof r.jour === "number" ? r.jour : parseInt(r.jour);
      if (isNaN(jour)) continue;
      for (const n of r.semaines || [1, 3]) {
        const date = nthWeekday(curseur.getFullYear(), curseur.getMonth(), jour, n);
        if (date >= debut && date <= fin) parIso.set(isoDate(date), { date, horaires: "", motif: "", exceptionnelle: false });
      }
    }
    curseur.setMonth(curseur.getMonth() + 1);
  }
  for (const e of extras) {
    if (!e.date) continue;
    const date = parseIso(e.date);
    if (date < debut || date > fin) continue;
    const deja = parIso.get(e.date);
    if (deja) { deja.horaires = e.horaires || deja.horaires; deja.motif = motif(e.label) || deja.motif; }
    else parIso.set(e.date, { date, horaires: e.horaires || "", motif: motif(e.label), exceptionnelle: true });
  }
  const fermees = new Set(fermetures.map((f) => f.date));
  return [...parIso.entries()].filter(([iso]) => !fermees.has(iso)).map(([, d]) => d).sort((a, b) => a.date - b.date);
}

async function lire(chemin) {
  const res = await fetch(`${BASE}/${chemin}${chemin.includes("?") ? "&" : "?"}key=${CLE}`, { signal: AbortSignal.timeout(DELAI_MS) });
  if (res.status === 404) return null; // document absent : valeurs par défaut
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// { dates: [{ date, horaires, motif, exceptionnelle }], plage: "10h00 – 17h30" }
// Les trois lectures (JSON simple) sont gardées en mémoire par cache-lecture.js ; les dates, elles,
// sont recalculées à chaque visite à partir du jour même.
export async function chargerOuvertures() {
  const { h, fermetures, extras } = await avecMemoire("boutik", lireReseau);
  return {
    dates: ouvertures({ regles: Array.isArray(h.regles) && h.regles.length ? h.regles : REGLES_DEFAUT, fermetures, extras }),
    plage: h.plage || "10h00 – 17h30",
  };
}
async function lireReseau() {
  const [horaires, fermetures, extras] = await Promise.all([
    lire("config/horaires"),
    lire("fermetures?pageSize=300"),
    lire("ouvertures_exceptionnelles?pageSize=300"),
  ]);
  const docs = (r) => ((r && r.documents) || []).map((d) => champs(d.fields));
  return { h: horaires ? champs(horaires.fields) : {}, fermetures: docs(fermetures), extras: docs(extras) };
}
