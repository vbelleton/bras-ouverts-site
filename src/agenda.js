// Agenda de l'association : événements saisis dans l'admin du site Cieux Ouverts
// (écran des événements, « Publier sur : site Bras Ouverts »), servis par le Worker
// eglise-app. Seuls les événements Bras Ouverts sont demandés (source=bras-ouverts),
// et le moteur partagé les filtre une seconde fois.
// Le même chargement remplit aussi le bandeau « Prochains événements » en haut de page et les
// listes « Prochaines dates » des maraudes. Les dates de la boutique viennent de sa propre base.
import { buildEventList, AGENDA_BRAS_OUVERTS } from "./agenda-moteur.js";
import { chargerOuvertures as lireOuvertures } from "./boutik-dates.js";
// Une seule lecture de la base de la boutique pour toute la page.
let ouvertures = null;
const chargerOuvertures = () => (ouvertures ||= lireOuvertures());

const DELAI_MS = 8000; // un Worker muet ne doit pas laisser « Chargement » à l'infini

const jour = (d) => d.toLocaleDateString("fr-FR", { day: "2-digit" });
const moisCourt = (d) => d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
const moisLong = (d) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const dateLongue = (d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const heure = (h) => (h ? h.slice(0, 5).replace(":", " h ").replace(/ h 00$/, " h") : "");
const lienSur = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const ORDRE = { 1: "1er", 2: "2e", 3: "3e", 4: "4e", "-1": "dernier" };
// Même codage que l'admin des événements : weekly:4, biweekly:1,3, monthly_weekday:1:6, month, plusieurs règles séparées par |.
function regularite(rp) {
  const une = (r) => {
    const [type, a, b] = r.split(":");
    const jours = (x) => String(x || "").split(",").map((n) => JOURS[Number(n)]).filter(Boolean).join(", ");
    if (type === "week") return "chaque semaine";
    if (type === "biweek") return "toutes les deux semaines";
    if (type === "month") return "chaque mois";
    if (type === "weekly") return `chaque ${jours(a)}`;
    if (type === "biweekly") return `un ${jours(a)} sur deux`;
    if (type === "monthly_weekday") return `le ${ORDRE[a] || `${a}e`} ${JOURS[Number(b)] || ""} du mois`;
    return "rendez-vous régulier";
  };
  const t = String(rp).split("|").filter(Boolean).map(une).join(" et ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Genre d'un rendez-vous, pour sa couleur : les maraudes et les ouvertures de la boutique sont les
// dates habituelles ; tout le reste (ciné goûter, fête de l'été, projection…) est un événement, en bleu.
export function genre(ev) {
  const t = String(ev.titre || "");
  if (/maraude/i.test(t)) return "maraude";
  if (/boutik|boutique/i.test(t)) return "boutik";
  if (ev.repeat_period) return "regulier";
  return "evenement";
}

function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else n.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e !== null && e !== undefined && e !== "") n.append(e);
  return n;
}

function carte(ev) {
  const horaire = [heure(ev.heure), ev.fin ? heure(ev.fin) : ""].filter(Boolean).join(" – ");
  const quand = ev.dateFin
    ? `Du ${dateLongue(ev.date)} au ${dateLongue(ev.dateFin)}`
    : dateLongue(ev.date);
  const lien = lienSur(ev.lien);
  return el("li", { class: `ag-item ag-${genre(ev)}` },
    el("div", { class: "ag-date", "aria-hidden": "true" },
      el("span", { class: "ag-jour" }, jour(ev.date)),
      el("span", { class: "ag-mois" }, moisCourt(ev.date))),
    el("div", { class: "ag-corps" },
      el("h3", {}, ev.emoji ? `${ev.emoji} ` : "", ev.titre || "Événement"),
      el("p", { class: "ag-meta" },
        el("span", {}, quand.charAt(0).toUpperCase() + quand.slice(1)),
        horaire ? el("span", {}, horaire) : null,
        ev.lieu ? el("span", {}, ev.lieu) : null,
        ev.repeat_period ? el("span", { class: "ag-regulier" }, regularite(ev.repeat_period)) : null),
      ev.description ? el("p", { class: "ag-desc" }, ev.description) : null,
      lien ? el("a", { href: lien, rel: "noopener", class: "ag-lien" }, "En savoir plus") : null));
}

// Un seul appel au Worker pour toute la page.
let evenements = null;
function chargerEvenements(api) {
  if (!evenements) {
    const url = `${api.replace(/\/$/, "")}/api/church-events?source=${AGENDA_BRAS_OUVERTS}&include_exceptions=1&size=100`;
    evenements = fetch(url, { signal: AbortSignal.timeout(DELAI_MS) }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).then((json) => buildEventList(json, { agenda: AGENDA_BRAS_OUVERTS })
      // Les maraudes ne sont pas annoncées publiquement : jamais affichées, même saisies dans l'agenda.
      .filter((ev) => genre(ev) !== "maraude"));
  }
  return evenements;
}

async function remplir(bloc) {
  const zone = bloc.querySelector(".ag-liste");
  const max = Math.max(1, Number(bloc.dataset.max) || 12);
  try {
    // Un rendez-vous régulier n'occupe qu'une carte : sa prochaine date.
    const vus = new Set();
    const liste = (await chargerEvenements(bloc.dataset.api))
      .filter((ev) => !ev.repeat_period || (!vus.has(ev.id) && vus.add(ev.id)))
      .slice(0, max);
    zone.replaceChildren();
    if (!liste.length) {
      // « Vide » n'est pas « pas pu charger » : ici l'agenda est réellement vide.
      zone.append(el("p", { class: "ag-vide" }, bloc.dataset.vide));
      return;
    }
    let mois = "";
    let ul = null;
    for (const ev of liste) {
      const m = moisLong(ev.date);
      if (m !== mois) {
        mois = m;
        zone.append(el("h3", { class: "ag-mois-titre" }, m.charAt(0).toUpperCase() + m.slice(1)));
        ul = el("ul", { class: "ag-items" });
        zone.append(ul);
      }
      ul.append(carte(ev));
    }
  } catch (e) {
    console.error("agenda:", e?.name || "erreur");
    zone.replaceChildren(el("p", { class: "ag-vide ag-erreur" },
      "L’agenda n’a pas pu être chargé pour le moment. Réessayez plus tard, ou écrivez-nous pour connaître les prochaines dates."));
  }
}

// Bloc du haut de l'accueil : les 3 prochains rendez-vous. D'abord les événements (ciné goûter,
// fête…, en bleu), complétés au besoin par les prochaines ouvertures de la P'tite Boutik (en corail).
// Jamais les maraudes. Si rien ne répond, un message renvoie vers l'agenda.
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function cartePr({ date, titre, detail, lien, sorte }) {
  return el("li", { class: `pr-item pr-${sorte}` },
    el("a", { href: lien },
      el("span", { class: "pr-date", "aria-hidden": "true" },
        el("span", { class: "pr-jour" }, jour(date)),
        el("span", { class: "pr-mois" }, moisCourt(date))),
      el("span", { class: "pr-corps" },
        el("span", { class: "pr-quand" }, majuscule(dateLongue(date))),
        el("strong", { class: "pr-titre" }, titre),
        detail ? el("span", { class: "pr-detail" }, detail) : null)));
}
async function remplirProchains(bloc) {
  const ul = bloc.querySelector("ul");
  const max = Math.max(1, Number(bloc.dataset.max) || 3);
  const [evs, bk] = await Promise.allSettled([chargerEvenements(bloc.dataset.api), chargerOuvertures()]);
  const vus = new Set();
  const cartes = (evs.status === "fulfilled" ? evs.value : [])
    .filter((ev) => genre(ev) === "evenement" && !vus.has(ev.id) && vus.add(ev.id))
    .map((ev) => ({ date: ev.date, sorte: "evenement", lien: "#agenda",
      titre: `${ev.emoji ? `${ev.emoji} ` : ""}${ev.titre || "Événement"}`,
      detail: [[heure(ev.heure), ev.fin ? heure(ev.fin) : ""].filter(Boolean).join(" – "), ev.lieu].filter(Boolean).join(" · ") }));
  if (bk.status === "fulfilled") {
    for (const d of bk.value.dates) cartes.push({ date: d.date, sorte: "boutik", lien: "/boutik/",
      titre: "La P’tite Boutik est ouverte", detail: d.horaires || bk.value.plage });
  }
  // Les événements passent devant ; la boutique ne fait que compléter les places libres.
  const choix = [...cartes.filter((c) => c.sorte === "evenement").slice(0, max)];
  choix.push(...cartes.filter((c) => c.sorte === "boutik").slice(0, max - choix.length));
  choix.sort((a, b) => a.date - b.date);
  if (evs.status === "rejected") console.error("prochains:", evs.reason?.name || "erreur");
  if (!choix.length) {
    ul.replaceChildren(el("li", { class: "pr-vide" },
      evs.status === "rejected" && bk.status === "rejected"
        ? "Les prochains rendez-vous n’ont pas pu être chargés. Réessayez plus tard."
        : "Pas de rendez-vous annoncé pour le moment.",
      " ", el("a", { href: "#agenda" }, "Voir l’agenda")));
    return;
  }
  ul.replaceChildren(...choix.map(cartePr));
}

// « Prochaines dates » de la boutique (carte de l'accueil).
const dateJour = (d) => { const t = dateLongue(d); return t.charAt(0).toUpperCase() + t.slice(1); };
async function remplirDates(zone) {
  const ul = zone.querySelector("ul");
  const max = Math.max(1, Number(zone.dataset.max) || 3);
  try {
    let lignes;
    if (zone.dataset.dates === "boutik") {
      const { dates, plage } = await chargerOuvertures();
      lignes = dates.slice(0, max).map((d) => [dateJour(d.date), d.horaires || plage]);
    } else {
      lignes = (await chargerEvenements(zone.dataset.api))
        .filter((ev) => genre(ev) === zone.dataset.dates)
        .slice(0, max)
        .map((ev) => [dateJour(ev.date), [heure(ev.heure), ev.fin ? heure(ev.fin) : ""].filter(Boolean).join(" – ")]);
    }
    if (!lignes.length) {
      ul.replaceChildren(el("li", { class: "dt-vide" }, zone.dataset.vide || "Prochaines dates bientôt annoncées."));
    } else {
      ul.replaceChildren(...lignes.map(([jourTxt, h]) => el("li", {}, el("strong", {}, jourTxt), h ? el("span", {}, h) : null)));
    }
  } catch (e) {
    console.error("dates:", e?.name || "erreur");
    ul.replaceChildren(el("li", { class: "dt-vide" }, "Les dates n’ont pas pu être chargées. Réessayez plus tard."));
  }
}

for (const bloc of document.querySelectorAll(".agenda[data-api]")) remplir(bloc);
for (const bandeau of document.querySelectorAll(".prochains[data-api]")) remplirProchains(bandeau);
for (const zone of document.querySelectorAll("[data-dates]")) remplirDates(zone);
