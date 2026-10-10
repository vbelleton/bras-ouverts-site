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
    return section(b, `${secHead(b)}
      <div class="two">
        <div class="text">${paras(b.text)}
        ${facts(b.facts)}
        </div>
        ${form}
      </div>`, "alpha");
  },

  text: (b) => section(b, `${secHead(b)}
      <div class="prose">${paras(b.text)}</div>`),

  contact: (b) => section(b, `${secHead(b, b.intro ? `\n        <p>${txt(b.intro)}</p>` : "")}
      <form class="js-form contact-form" method="post" action="/api/contact" data-success="${esc(b.success || "Merci, votre message est bien parti.")}">
        <div class="row">
          ${field("Nom", `<input name="name" autocomplete="name" required maxlength="120">`, true)}
          ${field("E-mail", `<input name="email" type="email" autocomplete="email" required maxlength="200">`, true)}
        </div>
        <div class="row">
          ${field("Téléphone", `<input name="phone" type="tel" autocomplete="tel" maxlength="40">`)}
          ${list(b.subjects).length ? field("Sujet", `<select name="subject"><option value="">Choisir…</option>${list(b.subjects).map((s) => `<option>${esc(s)}</option>`).join("")}</select>`) : ""}
        </div>
        ${field("Votre message", `<textarea name="message" rows="6" required maxlength="5000"></textarea>`, true)}
        ${antiSpam}
        <p class="note">Vos coordonnées servent uniquement à vous répondre. Les champs marqués * sont obligatoires.</p>
        <button class="btn" type="submit">Envoyer</button>
        ${status}
      </form>
      ${b.email ? `<p class="mail-alt">${esc(b.emailText || "Vous préférez l’e-mail ? Écrivez-nous :")} ${mailLink(b.email, "écrire à l’association")}</p>` : ""}
      ${list(b.social).length ? `<ul class="social">${list(b.social).filter((s) => safeUrl(s.url)).map((s) => `<li><a href="${esc(safeUrl(s.url))}" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul>` : ""}`),
};

const blocks = list(data.blocks).filter(visible);
const nav = blocks.filter((b) => b.menu && b.type !== "hero").map((b) => `<a href="#${esc(b.anchor || slug(b.title))}">${esc(b.menu)}</a>`).join("\n      ");
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
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,opsz,wght@0,6..12,400;0,6..12,700;1,6..12,400&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="/style.css">
<script>${readFileSync("src/theme.js", "utf8").trim()}</script>
<script src="/forms.js" defer></script>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="logo" href="#${esc(home)}"><img src="/logo.png" alt="${esc(s.name || '')}" width="178" height="34"></a>
    <nav aria-label="Navigation principale">
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
        <div><dt>Données personnelles</dt><dd>Les messages du formulaire de contact servent uniquement à vous répondre et ne sont pas conservés sur le site. ${txt(l.retention || "")}</dd></div>
      </dl>
    </details>
  </div>
</footer>
</body>
</html>
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
if (existsSync("public")) cpSync("public", OUT, { recursive: true });
cpSync("src", OUT, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
console.log(`dist/index.html généré (${blocks.length} blocs).`);
