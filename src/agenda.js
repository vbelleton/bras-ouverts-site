// Agenda de l'association : événements saisis dans l'admin du site Cieux Ouverts
// (écran des événements, « Publier sur : site Bras Ouverts »), servis par le Worker
// eglise-app. Seuls les événements Bras Ouverts sont demandés (source=bras-ouverts),
// et le moteur partagé les filtre une seconde fois.
// Le même chargement remplit aussi le bandeau « Prochains événements » en haut de page et les
// listes « Prochaines dates » des maraudes. Les dates de la boutique viennent de sa propre base.
import { buildEventList, AGENDA_BRAS_OUVERTS } from "./agenda-moteur.js";
import { chargerOuvertures as lireOuvertures } from "./boutik-dates.js";
import { choisirProchains, maraudesParRegle } from "./prochains.js";
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
    }).then((json) => buildEventList(json, { agenda: AGENDA_BRAS_OUVERTS }));
  }
  return evenements;
}

async function remplir(bloc) {
  const zone = bloc.querySelector(".ag-liste");
  const max = Math.max(1, Number(bloc.dataset.max) || 12);
  try {
    // Un rendez-vous régulier n'occupe qu'une carte : sa prochaine date.
    const vus = new Set();
    // Les maraudes ne sont pas dans l'agenda public : seule leur prochaine date figure en haut de page.
    const liste = (await chargerEvenements(bloc.dataset.api))
      .filter((ev) => genre(ev) !== "maraude")
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

// Bloc du haut de l'accueil, en diaporama (un rendez-vous à la fois). Choix des 3 rendez-vous :
// les événements d'abord (ciné goûter, fête…) ; s'il en manque, la prochaine ouverture de la boutique,
// puis la prochaine maraude (date seulement, jamais le lieu), puis d'autres ouvertures de la boutique.
// 3 événements → 3 événements ; 2 → 2 + boutique ; 1 → 1 + boutique + maraude ; 0 → boutique, maraude, boutique.
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function cartePr({ date, titre, detail, lien, sorte, lienTxt }) {
  return el("li", { class: `pr-item pr-${sorte}` },
    el("span", { class: "pr-date", "aria-hidden": "true" },
      el("span", { class: "pr-jour" }, jour(date)),
      el("span", { class: "pr-mois" }, moisCourt(date))),
    el("span", { class: "pr-corps" },
      el("span", { class: "pr-sorte" }, { evenement: "Événement", boutik: "P’tite Boutik", maraude: "Maraude" }[sorte]),
      el("strong", { class: "pr-titre" }, titre),
      el("span", { class: "pr-quand" }, [majuscule(dateLongue(date)), detail].filter(Boolean).join(" · ")),
      lien ? el("a", { class: "pr-lien", href: lien }, lienTxt) : null));
}
function diaporama(bloc, cartes) {
  const ul = bloc.querySelector("ul");
  const nav = bloc.querySelector(".pr-nav");
  ul.replaceChildren(...cartes.map(cartePr));
  const items = [...ul.children];
  let i = 0;
  let minuterie = null;
  const points = items.map((_, k) => el("button", { type: "button", class: "pr-point", "aria-label": `Rendez-vous ${k + 1} sur ${items.length}` }));
  const montrer = (k) => {
    i = (k + items.length) % items.length;
    items.forEach((li, n) => { li.classList.toggle("actif", n === i); li.toggleAttribute("inert", n !== i); li.setAttribute("aria-hidden", String(n !== i)); });
    points.forEach((p, n) => p.setAttribute("aria-current", String(n === i)));
  };
  points.forEach((p, k) => p.addEventListener("click", () => { montrer(k); relancer(); }));
  const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const arreter = () => { clearInterval(minuterie); minuterie = null; };
  const relancer = () => { arreter(); if (!calme && items.length > 1) minuterie = setInterval(() => montrer(i + 1), 6000); };
  if (nav && items.length > 1) {
    const prec = el("button", { type: "button", class: "pr-fleche", "aria-label": "Rendez-vous précédent" }, "‹");
    const suiv = el("button", { type: "button", class: "pr-fleche", "aria-label": "Rendez-vous suivant" }, "›");
    prec.addEventListener("click", () => { montrer(i - 1); relancer(); });
    suiv.addEventListener("click", () => { montrer(i + 1); relancer(); });
    nav.replaceChildren(prec, ...points, suiv);
    nav.hidden = false;
  }
  // Pause quand la souris ou le clavier est dessus, ou quand l'onglet est caché.
  bloc.addEventListener("mouseenter", arreter);
  bloc.addEventListener("mouseleave", relancer);
  bloc.addEventListener("focusin", arreter);
  bloc.addEventListener("focusout", (e) => { if (!bloc.contains(e.relatedTarget)) relancer(); });
  document.addEventListener("visibilitychange", () => (document.hidden ? arreter() : relancer()));
  // Glisser du doigt sur téléphone.
  let x0 = null;
  ul.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  ul.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { montrer(i + (dx < 0 ? 1 : -1)); relancer(); }
  });
  montrer(0);
  relancer();
  bloc.classList.add("pret");
}
async function remplirProchains(bloc) {
  const ul = bloc.querySelector("ul");
  const max = Math.max(1, Number(bloc.dataset.max) || 3);
  const [evs, bk] = await Promise.allSettled([chargerEvenements(bloc.dataset.api), chargerOuvertures()]);
  const tous = evs.status === "fulfilled" ? evs.value : [];
  const vus = new Set();
  const unique = (ev) => !vus.has(ev.id) && vus.add(ev.id);
  const evenements = tous.filter((ev) => genre(ev) === "evenement" && unique(ev))
    .map((ev) => ({ date: ev.date, sorte: "evenement", lien: "#agenda", lienTxt: "Voir l’agenda",
      titre: `${ev.emoji ? `${ev.emoji} ` : ""}${ev.titre || "Événement"}`,
      detail: [[heure(ev.heure), ev.fin ? heure(ev.fin) : ""].filter(Boolean).join(" – "), ev.lieu].filter(Boolean).join(" · ") }));
  const boutik = bk.status === "fulfilled"
    ? bk.value.dates.map((d) => ({ date: d.date, sorte: "boutik", lien: "/boutik/", lienTxt: "Découvrir la boutique",
      titre: "La P’tite Boutik est ouverte", detail: d.horaires || bk.value.plage }))
    : [];
  // Maraude : la date seulement (ni lieu ni heure). Celles de l'agenda, sinon la règle du site (tous les 15 jours…).
  let datesMaraude = tous.filter((ev) => genre(ev) === "maraude").map((ev) => ev.date);
  if (!datesMaraude.length) datesMaraude = maraudesParRegle(bloc.dataset.maraudeDebut, bloc.dataset.maraudeJours);
  const maraudes = datesMaraude.map((date) => ({ date, sorte: "maraude", lien: "#maraudes", lienTxt: "Découvrir les maraudes", titre: "Maraude de l’association", detail: "" }));
  if (evs.status === "rejected") console.error("prochains:", evs.reason?.name || "erreur");
  const choix = choisirProchains({ evenements, boutik, maraudes, max });
  if (!choix.length) {
    ul.replaceChildren(el("li", { class: "pr-item pr-vide actif" },
      evs.status === "rejected" && bk.status === "rejected"
        ? "Les prochains rendez-vous n’ont pas pu être chargés. Réessayez plus tard."
        : "Pas de rendez-vous annoncé pour le moment.",
      " ", el("a", { href: "#agenda" }, "Voir l’agenda")));
    bloc.classList.add("pret");
    return;
  }
  diaporama(bloc, choix);
}

// « Prochaines dates » sous les encarts de l'accueil : boutique (sa base) ou événements (agenda).
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
      const vus = new Set();
      lignes = (await chargerEvenements(zone.dataset.api))
        .filter((ev) => genre(ev) === (zone.dataset.dates === "evenements" ? "evenement" : zone.dataset.dates) && !vus.has(ev.id) && vus.add(ev.id))
        .slice(0, max)
        .map((ev) => [dateJour(ev.date), zone.dataset.dates === "evenements"
          ? `${ev.emoji ? `${ev.emoji} ` : ""}${ev.titre || "Événement"}`
          : [heure(ev.heure), ev.fin ? heure(ev.fin) : ""].filter(Boolean).join(" – ")]);
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
