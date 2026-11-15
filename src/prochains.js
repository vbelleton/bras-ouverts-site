// Choix des rendez-vous du diaporama en haut de l'accueil (utilisé par src/agenda.js, testé à part).

export function choisirProchains({ evenements = [], boutik = [], maraudes = [], max = 3 }) {
  const choix = evenements.slice(0, max);
  if (choix.length < max && boutik[0]) choix.push(boutik[0]);
  if (choix.length < max && maraudes[0]) choix.push(maraudes[0]);
  choix.push(...boutik.slice(1, 1 + max - choix.length));
  return choix;
}
// Dates de maraude par défaut (si aucune n'est saisie dans l'agenda) : tous les N jours depuis une date.
export function maraudesParRegle(debutIso, jours, today = new Date(), n = 3) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(debutIso || ""));
  const pas = Number(jours);
  if (!m || !(pas > 0)) return [];
  // Une maraude du jour n'est plus annoncée l'après-midi (c'est un déjeuner).
  const j0 = new Date(today); if (j0.getHours() >= 15) j0.setDate(j0.getDate() + 1); j0.setHours(0, 0, 0, 0);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  while (d < j0) d.setDate(d.getDate() + pas);
  return Array.from({ length: n }, (_, i) => { const x = new Date(d); x.setDate(x.getDate() + i * pas); return x; });
}
// Dates de maraude de la règle comprises entre `de` et `a` (inclus), pour le calendrier : aucune avant la première.
export function maraudesEntre(debutIso, jours, de, a) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(debutIso || ""));
  const pas = Number(jours);
  if (!m || !(pas > 0)) return [];
  const debut = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(debut);
  const borne = new Date(de); borne.setHours(0, 0, 0, 0);
  while (d < borne) d.setDate(d.getDate() + pas);
  const dates = [];
  for (; d <= a && dates.length < 400; d.setDate(d.getDate() + pas)) dates.push(new Date(d));
  return dates;
}
