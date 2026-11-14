// Agenda de l'association : événements saisis dans l'admin du site Cieux Ouverts
// (écran des événements, « Publier sur : site Bras Ouverts »), servis par le Worker
// eglise-app. Seuls les événements Bras Ouverts sont demandés (source=bras-ouverts),
// et le moteur partagé les filtre une seconde fois.
// Le même chargement remplit aussi le bandeau « Prochains événements » en haut de page et les
// listes « Prochaines dates » des maraudes. Les dates de la boutique viennent de sa propre base.
import { buildEventList, AGENDA_BRAS_OUVERTS } from "./agenda-moteur.js";
import { chargerOuvertures } from "./boutik-dates.js";

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
    }).then((json) => buildEventList(json, { agenda: AGENDA_BRAS_OUVERTS }));
  }
  return evenements;
}

async function remplir(bloc) {
  const zone = bloc.querySelector(".ag-liste");
  const max = Math.max(1, Number(bloc.dataset.max) || 12);
  try {
    // Un rendez-vous régulier (maraude du jeudi…) n'occupe qu'une carte : sa prochaine date.
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

// Bandeau du haut : les prochains événements (ciné goûter, fête…), pas les dates habituelles.
// S'il n'y en a aucun, ou si l'agenda ne répond pas, le bandeau reste caché.
const dateCourte = (d) => d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
async function remplirProchains(bandeau) {
  try {
    const vus = new Set();
    const liste = (await chargerEvenements(bandeau.dataset.api))
      .filter((ev) => genre(ev) === "evenement" && !vus.has(ev.id) && vus.add(ev.id))
      .slice(0, Math.max(1, Number(bandeau.dataset.max) || 3));
    if (!liste.length) return;
    bandeau.querySelector("ul").replaceChildren(...liste.map((ev) => el("li", {},
      el("a", { href: "#agenda" },
        el("span", { class: "pr-date" }, ((t) => t.charAt(0).toUpperCase() + t.slice(1))(dateCourte(ev.date))),
        el("span", { class: "pr-titre" }, ev.emoji ? `${ev.emoji} ` : "", ev.titre || "Événement")))));
    bandeau.hidden = false;
  } catch (e) {
    console.error("prochains:", e?.name || "erreur");
  }
}

// « Prochaines dates » d'une maraude ou de la boutique (cartes de l'accueil, rubrique Maraude).
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
