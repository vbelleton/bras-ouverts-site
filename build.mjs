// Génère dist/ à partir de content/site.json : une page index.html statique + les fichiers de src/ et public/.
// Aucune dépendance : `node build.mjs`.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";

const OUT = "dist";
const data = JSON.parse(readFileSync("content/site.json", "utf8"));

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Les textes « [à compléter …] » sont affichés en gris italique, pour les repérer avant la mise en ligne.
const txt = (s = "") => esc(s).replace(/\[([^\]]*)\]/g, '<span class="ph">$1</span>');
// *texte* devient <em>texte</em> (mise en couleur dans les titres)
const emph = (s = "") => txt(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
const paras = (s = "") =>
  String(s).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${txt(p).replace(/\n/g, "<br>")}</p>`).join("\n");
const list = (a) => (Array.isArray(a) ? a.filter((x) => x !== null && x !== undefined && x !== "") : []);
const visible = (x) => x && x.visible !== false;
const safeUrl = (u = "") => (/^(https?:|mailto:|tel:|\/|#)/i.test(String(u).trim()) ? String(u).trim() : "");
const slug = (s = "") =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// E-mail protégé des robots : l'adresse est découpée et inversée, src/forms.js recompose le lien.
const mailLink = (email, fallback) => {
  const [u, d] = String(email).trim().split("@");
  if (!u || !d) return "";
  const rev = (x) => [...x].reverse().join("");
  return `<a class="js-mail" href="#contact" data-u="${esc(rev(u))}" data-d="${esc(rev(d))}">${esc(fallback)}</a>`;
};
const secHead = (b, extra = "") => `
      <div class="sec-head">${b.label ? `<span class="lab">${esc(b.label)}</span>` : ""}<h2>${emph(b.title)}</h2>${extra}</div>`;
const section = (b, inner, cls = "") => `
  <section id="${esc(b.anchor || slug(b.title))}"${cls ? ` class="${cls}"` : ""}>
    <div class="wrap">${inner}
    </div>
  </section>`;
const facts = (items) => list(items).length ? `<dl class="facts">
        ${list(items).map((f) => `<div><dt>${esc(f.label)}</dt><dd>${txt(f.value)}</dd></div>`).join("\n        ")}
      </dl>` : "";
// Champs communs aux deux formulaires : piège à robots et horodatage (voir lib/form.js).
const antiSpam = `<label class="hp" aria-hidden="true">Ne pas remplir<input name="website" tabindex="-1" autocomplete="off"></label>
        <input type="hidden" name="t" value="">`;
const field = (label, input, req = false) =>
  `<label><span>${label}${req ? ` <b class="req" aria-hidden="true">*</b>` : ""}</span>${input}</label>`;
const status = `<p class="status" role="status" aria-live="polite"></p>`;
// Worker des événements (le même que l'agenda de l'église, événements distincts).
const AGENDA_API = "https://eglise-app.belletonv.workers.dev";

const renderers = {
  hero: (b) => `
  <div class="hero" id="${esc(b.anchor || "accueil")}">
    <div class="wrap">
      ${b.kicker ? `<div class="kicker">${esc(b.kicker)}</div>` : ""}
      <h1>${emph(b.title)}</h1>
      ${b.lead ? `<p class="lead">${txt(b.lead)}</p>` : ""}
      ${b.cta ? `<a class="btn btn-lg" href="#${esc(b.ctaTarget || "alpha")}">${esc(b.cta)}</a>` : ""}
    </div>
  </div>`,

  // Les deux côtés de l'association : la P'tite Boutik (son propre site) et les actions solidaires.
  portes: (b) => section(b, `${b.title ? secHead(b, b.intro ? `\n        <p>${txt(b.intro)}</p>` : "") : ""}
      <div class="portes">
      ${list(b.items).filter(visible).map((i, n) => {
        const href = safeUrl(i.link);
        const ext = /^https?:/i.test(href);
        return `<article class="porte porte-${["corail", "lagon"].includes(i.style) ? i.style : n % 2 ? "lagon" : "corail"}">
        ${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : ""}
        ${i.kicker ? `<span class="lab">${esc(i.kicker)}</span>` : ""}
        <h3>${emph(i.title)}</h3>
        ${paras(i.text)}
        ${list(i.points).length ? `<ul class="porte-points">${list(i.points).map((x) => `<li>${txt(x)}</li>`).join("")}</ul>` : ""}
        ${href ? `<a class="btn" href="${esc(href)}"${ext ? ' rel="noopener"' : ""}>${esc(i.linkLabel || "Découvrir")}${ext ? ' <span aria-hidden="true">↗</span>' : ""}</a>` : ""}
      </article>`;
      }).join("\n      ")}
      </div>`, "portes-sec"),

  // Agenda rempli dans le navigateur par src/agenda.js (événements gérés depuis l'admin Cieux Ouverts).
  agenda: (b) => section(b, `${secHead(b, b.intro ? `\n        <p>${txt(b.intro)}</p>` : "")}
      <div class="agenda" data-api="${esc(safeUrl(b.api) || AGENDA_API)}" data-max="${Number(b.max) || 12}" data-vide="${esc(b.empty || "Pas de rendez-vous prévu pour le moment. Revenez bientôt !")}">
        <div class="ag-liste" aria-live="polite"><p class="ag-vide">Chargement de l’agenda…</p></div>
        <noscript><p class="ag-vide">L’agenda a besoin de JavaScript. Écrivez-nous pour connaître les prochaines dates.</p></noscript>
      </div>`, "agenda-sec"),

  actions: (b) => section(b, `${secHead(b, b.intro ? `\n        <p>${txt(b.intro)}</p>` : "")}
      <div class="actions">
      ${list(b.items).filter(visible).map((i) => `<article class="action" id="${esc(i.anchor || slug(i.title))}">
        ${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : ""}
        <h3>${emph(i.title)}</h3>
        ${paras(i.text)}
        ${facts(i.infos)}
        ${i.help ? `<p class="help">${txt(i.help)}</p>` : ""}
      </article>`).join("\n      ")}
      </div>`),

  alpha: (b) => {
    const sessions = list(b.sessions).filter((s) => s.id && s.open !== false);
    const form = sessions.length
      ? `<form class="js-form inscription-form" method="post" action="/api/inscription" data-success="${esc(b.success || "Merci, votre inscription est bien enregistrée.")}" data-full="${esc(b.full || "Ce parcours est complet.")}">
        <h3>${esc(b.formTitle || "S’inscrire")}</h3>
        <div class="row">
          ${field("Prénom", `<input name="firstName" autocomplete="given-name" required maxlength="80">`, true)}
          ${field("Nom", `<input name="lastName" autocomplete="family-name" required maxlength="80">`, true)}
        </div>
        <div class="row">
          ${field("E-mail", `<input name="email" type="email" autocomplete="email" required maxlength="200">`, true)}
          ${field("Téléphone", `<input name="phone" type="tel" autocomplete="tel" required maxlength="40">`, true)}
        </div>
        ${sessions.length > 1
          ? field("Parcours", `<select name="session" required><option value="">Choisir…</option>${sessions.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("")}</select>`, true)
          : `<input type="hidden" name="session" value="${esc(sessions[0].id)}"><p class="session-one">${txt(sessions[0].label)}</p>`}
        ${field("Adresse postale (facultatif)", `<input name="address" autocomplete="street-address" maxlength="300" placeholder="Numéro, rue, code postal, ville">`)}
        ${field("Un mot pour nous (facultatif)", `<textarea name="message" rows="3" maxlength="2000"></textarea>`)}
        <label class="consent"><input type="checkbox" name="consent" value="oui" required> <span>J’accepte que mes coordonnées soient utilisées pour organiser le Parcours Alpha. Elles ne sont ni publiées ni transmises. <b class="req" aria-hidden="true">*</b></span></label>
        ${antiSpam}
        <button class="btn" type="submit">Je m’inscris</button>
        ${status}
      </form>`
      : `<p class="closed">Les inscriptions ne sont pas encore ouvertes. Revenez bientôt, ou écrivez-nous pour être prévenu.</p>`;
    const steps = list(b.steps).filter(visible);
    const faq = list(b.faq).filter((q) => q.question);
    return section(b, `${secHead(b)}
      <div class="two">
        <div class="text">${paras(b.text)}
        ${list(b.questions).length ? `<div class="questions"><h3>${esc(b.questionsTitle || "Des questions pour y réfléchir")}</h3><ul>${list(b.questions).map((q) => `<li>${txt(q)}</li>`).join("")}</ul></div>` : ""}
        ${facts(b.facts)}
        ${b.reassurance ? `<p class="reassure">${txt(b.reassurance)}</p>` : ""}
        </div>
        ${form}
      </div>
      ${steps.length ? `<div class="steps-wrap"><h3>${esc(b.stepsTitle || "Comment ça se passe")}</h3>
        <ol class="steps">${steps.map((st) => `<li><h4>${txt(st.title)}</h4>${st.text ? `<p>${txt(st.text)}</p>` : ""}</li>`).join("")}</ol></div>` : ""}
      ${faq.length ? `<div class="faq"><h3>${esc(b.faqTitle || "Questions fréquentes")}</h3>
        ${faq.map((q) => `<details><summary>${txt(q.question)}</summary>${paras(q.answer)}</details>`).join("\n        ")}</div>` : ""}
      ${safeUrl(b.link) ? `<p class="more-link"><a href="${esc(safeUrl(b.link))}" rel="noopener">${esc(b.linkLabel || "En savoir plus sur Alpha")}</a></p>` : ""}`, "alpha");
  },

  find: (b) => section(b, `${secHead(b, b.intro ? `\n        <p>${txt(b.intro)}</p>` : "")}
      <div class="find">
        <dl class="find-list">
          ${list(b.items).filter(visible).map((i) => {
            const href = safeUrl(i.href);
            return `<div><dt><span class="ico" aria-hidden="true">${esc(i.icon || "")}</span>${esc(i.label)}</dt><dd>${href ? `<a href="${esc(href)}">${txt(i.value)}</a>` : txt(i.value)}</dd></div>`;
          }).join("\n          ")}
        </dl>
        ${b.mapQuery ? `<div class="map"><iframe title="Carte : ${esc(b.mapQuery)}" src="https://www.google.com/maps?q=${encodeURIComponent(b.mapQuery)}&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
          <a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(b.mapQuery)}" rel="noopener">${esc(b.mapLinkLabel || "Ouvrir l’itinéraire")}</a></div>` : ""}
      </div>`),

  text: (b) => section(b, `${secHead(b)}
      <div class="prose">${paras(b.text)}</div>`),

  contact: (b) => {
    const form = `<form class="js-form contact-form" method="post" action="/api/contact" novalidate data-success="${esc(b.success || "Merci, votre message est bien parti.")}">
        <p class="note">Les champs marqués <b class="req">*</b> sont obligatoires.</p>
        <div class="row">
          ${field("Prénom", `<input name="firstName" autocomplete="given-name" required maxlength="80">`, true)}
          ${field("Nom", `<input name="lastName" autocomplete="family-name" required maxlength="80">`, true)}
        </div>
        <div class="row">
          ${field("E-mail", `<input name="email" type="email" autocomplete="email" required maxlength="200">`, true)}
          ${field("Téléphone", `<input name="phone" type="tel" autocomplete="tel" maxlength="40">`)}
        </div>
        ${list(b.subjects).length ? field("Sujet", `<select name="subject"><option value="">Choisir…</option>${list(b.subjects).map((x) => `<option>${esc(x)}</option>`).join("")}</select>`) : ""}
        ${field("Votre message", `<textarea name="message" rows="6" required minlength="10" maxlength="5000"></textarea>`, true)}
        ${antiSpam}
        <p class="note">Vos coordonnées servent uniquement à vous répondre : rien n’est conservé sur le site.</p>
        <button class="btn" type="submit">Envoyer le message</button>
        ${status}
      </form>`;
    const aside = `<aside class="contact-aside">
        ${list(b.details).length ? `<dl class="find-list">${list(b.details).filter(visible).map((i) => {
          const href = safeUrl(i.href);
          return `<div><dt><span class="ico" aria-hidden="true">${esc(i.icon || "")}</span>${esc(i.label)}</dt><dd>${href ? `<a href="${esc(href)}">${txt(i.value)}</a>` : txt(i.value)}</dd></div>`;
        }).join("")}</dl>` : ""}
        ${b.email ? `<p class="mail-alt">${esc(b.emailText || "Vous préférez l’e-mail ? Écrivez-nous :")} ${mailLink(b.email, "écrire à l’association")}</p>` : ""}
        ${list(b.social).length ? `<ul class="social">${list(b.social).filter((x) => safeUrl(x.url)).map((x) => `<li><a href="${esc(safeUrl(x.url))}" rel="noopener">${esc(x.label)}</a></li>`).join("")}</ul>` : ""}
      </aside>`;
    return section(b, `${secHead(b, b.intro ? `\n        <p>${txt(b.intro)}</p>` : "")}
      <div class="contact-grid">
        ${form}
        ${aside}
      </div>`, "contact-sec");
  },
};

const blocks = list(data.blocks).filter(visible);
const ancre = (b) => b.anchor || slug(b.title);
// Menu : les blocs qui ont un libellé, et les liens vers d'autres pages du domaine (ex. la P'tite Boutik
// sous /boutik/) glissés après le bloc choisi (« apres » = ancre du bloc ; vide = en fin de menu).
const navLinks = list((data.site || {}).navLinks).filter((l) => l.label && safeUrl(l.url));
const lienNav = (l) => `<a href="${esc(safeUrl(l.url))}">${esc(l.label)}</a>`;
const nav = [
  ...blocks.filter((b) => b.menu && b.type !== "hero").flatMap((b) => [
    `<a href="#${esc(ancre(b))}">${esc(b.menu)}</a>`,
    ...navLinks.filter((l) => l.apres && l.apres === ancre(b)).map(lienNav),
  ]),
  ...navLinks.filter((l) => !l.apres || !blocks.some((b) => b.menu && b.type !== "hero" && ancre(b) === l.apres)).map(lienNav),
].join("\n      ");

// Barre de boutons en bas de l'écran sur téléphone (site.barre dans Pages CMS) : 5 boutons au plus.
const ICONES = {
  accueil: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  boutique: '<path d="M5 8h14l-1.2 11.5H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  coeur: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"/>',
  agenda: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  carte: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  contact: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  mains: '<path d="M7 11.5V6.8a1.4 1.4 0 0 1 2.8 0v4.2M9.8 10V5.4a1.4 1.4 0 0 1 2.8 0V10M12.6 10V6.2a1.4 1.4 0 0 1 2.8 0v6.3l1.4-1.6a1.4 1.4 0 0 1 2.1 1.9L15.6 17a5 5 0 0 1-3.8 2H11a5 5 0 0 1-5-5v-2.5a1.4 1.4 0 0 1 2.8 0"/>',
};
const barre = list((data.site || {}).barre).filter((x) => x.label && safeUrl(x.url)).slice(0, 5);
const barreHtml = barre.length ? `
<nav class="barre" aria-label="Accès rapide">
  ${barre.map((x) => `<a href="${esc(safeUrl(x.url))}"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[x.icon] || ICONES.coeur}</svg><span>${esc(x.label)}</span></a>`).join("\n  ")}
</nav>` : "";
const body = blocks.map((b) => (renderers[b.type] ? renderers[b.type](b) : "")).join("\n");
const s = data.site || {};
const l = data.legal || {};
const home = (blocks[0] || {}).anchor || "accueil";

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(s.title || s.name)}</title>
<meta name="description" content="${esc(s.description)}">
<meta property="og:title" content="${esc(s.title || s.name)}">
<meta property="og:description" content="${esc(s.description)}">
<meta property="og:type" content="website">
${s.url ? `<link rel="canonical" href="${esc(String(s.url).replace(/\/+$/, ""))}/">\n<meta property="og:url" content="${esc(String(s.url).replace(/\/+$/, ""))}/">\n<meta property="og:image" content="${esc(String(s.url).replace(/\/+$/, ""))}/logo.png">` : ""}
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#f6efe3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#131a22" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-title" content="${esc(s.name || "Bras Ouverts")}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,opsz,wght@0,6..12,400;0,6..12,700;1,6..12,400&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="/style.css">
<script>${readFileSync("src/theme.js", "utf8").trim()}</script>
<script src="/forms.js" defer></script>
${blocks.some((b) => b.type === "agenda") ? `<script type="module" src="/agenda.js"></script>` : ""}
</head>
<body${barre.length ? ' class="avec-barre"' : ""}>
<header class="top">
  <div class="wrap">
    <a class="logo" href="#${esc(home)}"><img src="/logo.png" alt="${esc(s.name || '')}" width="178" height="34"></a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu-principal">
      <span class="menu-ico" aria-hidden="true"><span></span><span></span><span></span></span><span class="menu-txt">Menu</span>
    </button>
    <nav id="menu-principal" aria-label="Navigation principale">
      ${nav}
    </nav>
    <button class="theme-toggle" type="button" aria-label="Changer de thème" aria-pressed="false">
      <svg class="i-moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="currentColor"/></svg>
      <svg class="i-sun" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></g></svg>
    </button>
  </div>
</header>

<main>
${body}
</main>

<footer>
  <div class="wrap">
    <div><strong>${esc(s.name)}</strong> · ${esc(s.tagline)}</div>
    <details class="legal">
      <summary>Mentions légales</summary>
      <dl>
        <div><dt>Éditeur</dt><dd>${txt(l.association)}</dd></div>
        ${l.address ? `<div><dt>Siège</dt><dd>${txt(l.address)}</dd></div>` : ""}
        ${l.siret ? `<div><dt>SIRET</dt><dd>${esc(l.siret)}</dd></div>` : ""}
        ${l.publisher ? `<div><dt>Directeur de la publication</dt><dd>${txt(l.publisher)}</dd></div>` : ""}
        ${l.host ? `<div><dt>Hébergement</dt><dd>${esc(l.host)}</dd></div>` : ""}
        <div><dt>Données personnelles</dt><dd>Les messages du formulaire de contact servent uniquement à vous répondre. Ils ne sont lus que par l’équipe de l’association et sont supprimés une fois traités.${blocks.some((b) => b.type === "alpha") ? ` ${txt(l.retention || "")}` : ""}</dd></div>
      </dl>
    </details>
  </div>
</footer>${barreHtml}
</body>
</html>
`;

// Page /inscriptions : coquille vide, remplie par src/inscriptions.js après connexion de l'équipe.
// Aucune donnée personnelle dans la page elle-même.
const equipePage = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Espace équipe · ${esc(s.name)}</title>
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,opsz,wght@0,6..12,400;0,6..12,700;1,6..12,400&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="/style.css">
<script>${readFileSync("src/theme.js", "utf8").trim()}</script>
<script src="/inscriptions.js" defer></script>
</head>
<body class="equipe">
<header class="top"><div class="wrap">
  <a class="logo" href="/"><img src="/logo.png" alt="${esc(s.name || "")}" width="178" height="34"></a>
  <span class="equipe-titre">Espace équipe</span>
</div></header>
<main><section><div class="wrap" id="app"><p>Chargement…</p></div></section></main>
</body>
</html>
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
if (existsSync("public")) cpSync("public", OUT, { recursive: true });
cpSync("src", OUT, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
// Le domaine sert aussi la boutique sous /boutik/ : robots et plan du site couvrent les deux.
const SITE_URL = String(s.url || "").replace(/\/+$/, "");
writeFileSync(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /inscriptions\nDisallow: /boutik/admin\n${SITE_URL ? `\nSitemap: ${SITE_URL}/sitemap.xml\n` : ""}`);
if (SITE_URL) writeFileSync(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${esc(SITE_URL)}/</loc></url>\n  <url><loc>${esc(SITE_URL)}/boutik/</loc></url>\n</urlset>\n`);
// Appli installable (PWA). La portée « / » englobe /boutik/ : installée, l'appli Bras Ouverts ouvre aussi la boutique.
writeFileSync(`${OUT}/manifest.webmanifest`, JSON.stringify({
  name: s.name || "Bras Ouverts",
  short_name: s.shortName || s.name || "Bras Ouverts",
  description: s.description || "",
  lang: "fr",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f6efe3",
  theme_color: "#f6efe3",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: barre.filter((x) => /^\/[^/]/.test(safeUrl(x.url))).map((x) => ({ name: x.label, url: safeUrl(x.url) })),
}, null, 2));
mkdirSync(`${OUT}/inscriptions`, { recursive: true });
writeFileSync(`${OUT}/inscriptions/index.html`, equipePage);
console.log(`dist/index.html généré (${blocks.length} blocs).`);
