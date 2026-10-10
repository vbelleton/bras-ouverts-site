// Espace équipe : liste des inscrits. Les données sont affichées avec textContent, jamais en HTML.
const app = document.getElementById("app");
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};
const FAIL = "Une erreur est survenue. Merci de réessayer.";

async function api(path, options) {
  const res = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// Connexion avec Google : le bouton vient de Google, le site ne voit jamais de mot de passe.
let scriptGoogle;
const chargerGoogle = () => (scriptGoogle ||= new Promise((ok, ko) => {
  const s = el("script", { src: "https://accounts.google.com/gsi/client", async: true });
  s.onload = ok;
  s.onerror = () => { scriptGoogle = null; ko(new Error("google")); };
  document.head.append(s);
}));

async function connexion(message) {
  const statut = el("p", { className: "status", role: "status" });
  const bouton = el("div", { className: "eq-google" });
  const montrer = (texte, ok) => { statut.textContent = texte; statut.className = "status " + (ok ? "ok" : "err"); };
  app.replaceChildren(el("div", { className: "js-form eq-login" },
    el("h2", {}, "Espace équipe"),
    el("p", {}, "Cette page est réservée à l’équipe. Connectez-vous avec le compte Google dont l’adresse a été ajoutée à l’équipe."),
    bouton, statut));
  if (message) montrer(message, false);
  try {
    const { data } = await api("/api/auth/google");
    if (!data.clientId) return montrer("La connexion Google n’est pas encore configurée.", false);
    await chargerGoogle();
    google.accounts.id.initialize({
      client_id: data.clientId,
      callback: async ({ credential }) => {
        montrer("Connexion en cours…", true);
        try {
          const r = await api("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
          if (!r.res.ok || !r.data.ok) return montrer(r.data.error || FAIL, false);
          demarrer();
        } catch {
          montrer(FAIL, false);
        }
      },
    });
    google.accounts.id.renderButton(bouton, { theme: "outline", size: "large", text: "signin_with", locale: "fr", shape: "pill" });
  } catch {
    montrer("Impossible de charger la connexion Google. Vérifiez votre connexion et réessayez.", false);
  }
}

function liste(data) {
  const { membre } = data;
  const sortir = el("button", { className: "btn btn-clair", type: "button" }, "Se déconnecter");
  sortir.addEventListener("click", async () => {
    await api("/api/auth/deconnexion", { method: "POST" }).catch(() => {});
    connexion();
  });
  const contenu = el("div");
  const onglets = [["inscrits", "Inscrits", () => vueInscrits(data)], ["equipe", "Équipe", () => vueEquipe(membre)]].map(([id, titre, vue]) => {
    const b = el("button", { type: "button", className: "eq-onglet", role: "tab" }, titre);
    b.addEventListener("click", () => ouvrir(id));
    b.dataset.id = id;
    b.vue = vue;
    return b;
  });
  const ouvrir = (id) => {
    for (const b of onglets) b.setAttribute("aria-selected", String(b.dataset.id === id));
    contenu.replaceChildren(onglets.find((b) => b.dataset.id === id).vue());
  };
  app.replaceChildren(
    el("div", { className: "eq-bar" }, el("div", { className: "eq-onglets", role: "tablist" }, ...onglets), el("div", { className: "eq-actions" }, el("span", { className: "qui" }, membre), sortir)),
    contenu);
  ouvrir("inscrits");
}

function vueInscrits({ sessions, inscrits }) {
  const choix = el("select", { ariaLabel: "Parcours" }, el("option", { value: "" }, "Tous les parcours"),
    ...sessions.map((s) => el("option", { value: s.id }, s.label)));
  const export_ = el("a", { className: "btn", href: "/api/export-inscriptions" }, "Télécharger (Excel)");
  const comptes = el("ul", { className: "eq-comptes" });
  const tableau = el("div", { className: "eq-table-wrap" });

  const dessiner = () => {
    const id = choix.value;
    export_.href = "/api/export-inscriptions" + (id ? `?session=${encodeURIComponent(id)}` : "");
    comptes.replaceChildren(...sessions.filter((s) => !id || s.id === id).map((s) => {
      const n = inscrits.filter((i) => i.session === s.id).length;
      return el("li", {}, el("strong", {}, String(n)), ` ${s.capacity ? `/ ${s.capacity} places` : "inscrits"} · ${s.label}${s.open ? "" : " (fermé)"}`);
    }));
    const lignes = inscrits.filter((i) => !id || i.session === id);
    if (!lignes.length) return tableau.replaceChildren(el("p", { className: "eq-vide" }, "Aucune inscription pour le moment."));
    const nom = (i) => `${i.first_name} ${i.last_name}`;
    const parcours = (i) => (sessions.find((s) => s.id === i.session) || {}).label || i.session;
    tableau.replaceChildren(el("table", { className: "eq-table" },
      el("thead", {}, el("tr", {}, ...["Nom", "Téléphone", "E-mail", "Adresse", "Message", ...(id ? [] : ["Parcours"]), "Inscrit le"].map((t) => el("th", { scope: "col" }, t)))),
      el("tbody", {}, ...lignes.map((i) => el("tr", {},
        el("td", {}, nom(i)),
        el("td", {}, el("a", { href: `tel:${i.phone || ""}` }, i.phone || "")),
        el("td", {}, el("a", { href: `mailto:${i.email}` }, i.email)),
        el("td", {}, i.address || ""),
        el("td", { className: "msg" }, i.message || ""),
        ...(id ? [] : [el("td", {}, parcours(i))]),
        el("td", {}, (i.created_at || "").slice(0, 16).replace("T", " ")))))));
  };
  choix.addEventListener("change", dessiner);
  dessiner();
  return el("div", {}, el("div", { className: "eq-actions eq-filtres" }, choix, export_), comptes, tableau);
}

// Onglet « Équipe » : qui a accès à cette page. Ajouter envoie une invitation par e-mail.
function vueEquipe(moi) {
  const racine = el("div", { className: "eq-equipe" });
  const statut = el("p", { className: "status", role: "status" });
  const montrer = (texte, ok) => { statut.textContent = texte; statut.className = "status " + (ok ? "ok" : "err"); };
  const appel = async (methode, email) => {
    const { res, data } = await api("/api/equipe", { method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    if (res.status === 401) return connexion("Votre session a expiré.");
    montrer(data.message || data.error || FAIL, res.ok && data.ok);
    if (data.membres) dessiner(data.membres);
  };

  const champ = el("input", { type: "email", required: true, autocomplete: "off", maxLength: 200, placeholder: "prenom@exemple.fr" });
  const ajout = el("form", { className: "js-form eq-ajout" }, el("h3", {}, "Ajouter une personne"),
    el("p", {}, "Elle recevra une invitation par e-mail et pourra se connecter avec cette adresse."),
    el("label", {}, el("span", {}, "Adresse e-mail"), champ), el("button", { className: "btn", type: "submit" }, "Ajouter et inviter"));
  ajout.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bouton = ajout.querySelector("button");
    bouton.disabled = true;
    try { await appel("POST", champ.value); champ.value = ""; } catch { montrer(FAIL, false); } finally { bouton.disabled = false; }
  });

  const tableau = el("div", { className: "eq-table-wrap" });
  const dessiner = (membres) => {
    tableau.replaceChildren(el("table", { className: "eq-table" },
      el("thead", {}, el("tr", {}, ...["Adresse e-mail", "Ajouté par", ""].map((t) => el("th", { scope: "col" }, t)))),
      el("tbody", {}, ...membres.map((m) => {
        const retirer = el("button", { className: "btn btn-clair", type: "button" }, "Retirer");
        retirer.addEventListener("click", async () => {
          if (!confirm(`Retirer ${m.email} ? Son accès sera coupé immédiatement.`)) return;
          retirer.disabled = true;
          try { await appel("DELETE", m.email); } catch { montrer(FAIL, false); retirer.disabled = false; }
        });
        return el("tr", {},
          el("td", {}, m.email, m.email === moi ? " (vous)" : ""),
          el("td", {}, m.fixe ? "Réglages Cloudflare (fixe)" : (m.ajoute_par || "")),
          el("td", {}, m.fixe || m.email === moi ? "" : retirer));
      }))));
  };
  racine.append(el("p", {}, "Les personnes ci-dessous peuvent consulter les inscrits et gérer cette liste. N’ajoutez que des personnes de confiance."), tableau, ajout, statut);
  api("/api/equipe").then(({ data }) => (data.membres ? dessiner(data.membres) : montrer(data.error || FAIL, false))).catch(() => montrer(FAIL, false));
  return racine;
}

async function demarrer() {
  try {
    const { res, data } = await api("/api/inscriptions");
    if (res.status === 401) return connexion();
    if (!res.ok || !data.ok) return connexion(data.error || FAIL);
    liste(data);
  } catch {
    connexion(FAIL);
  }
}
demarrer();
