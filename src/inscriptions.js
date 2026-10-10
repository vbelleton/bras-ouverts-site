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

function connexion(message) {
  const email = el("input", { type: "email", required: true, autocomplete: "email", maxLength: 200 });
  const statut = el("p", { className: "status", role: "status" });
  const bouton = el("button", { className: "btn", type: "submit" }, "Recevoir un lien de connexion");
  const form = el("form", { className: "js-form eq-login" },
    el("h2", {}, "Espace équipe"),
    el("p", {}, "Cette page est réservée à l’équipe. Saisissez votre adresse e-mail : si elle est autorisée, vous recevrez un lien de connexion."),
    el("label", {}, el("span", {}, "Votre e-mail"), email), bouton, statut);
  if (message) { statut.textContent = message; statut.className = "status err"; }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    bouton.disabled = true;
    try {
      const { res, data } = await api("/api/auth/demande", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.value }) });
      statut.textContent = data.message || data.error || FAIL;
      statut.className = "status " + (res.ok && data.ok ? "ok" : "err");
    } catch {
      statut.textContent = FAIL;
      statut.className = "status err";
    } finally {
      bouton.disabled = false;
    }
  });
  app.replaceChildren(form);
}

function liste({ membre, sessions, inscrits }) {
  const choix = el("select", { ariaLabel: "Parcours" }, el("option", { value: "" }, "Tous les parcours"),
    ...sessions.map((s) => el("option", { value: s.id }, s.label)));
  const export_ = el("a", { className: "btn", href: "/api/export-inscriptions" }, "Télécharger (Excel)");
  const sortir = el("button", { className: "btn btn-clair", type: "button" }, "Se déconnecter");
  sortir.addEventListener("click", async () => {
    await api("/api/auth/deconnexion", { method: "POST" }).catch(() => {});
    connexion();
  });
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
  app.replaceChildren(
    el("div", { className: "eq-bar" }, el("h2", {}, "Inscrits"), el("div", { className: "eq-actions" }, choix, export_, sortir)),
    el("p", { className: "qui" }, `Connecté : ${membre}`),
    comptes, tableau);
}

(async () => {
  try {
    const { res, data } = await api("/api/inscriptions");
    if (res.status === 401) return connexion();
    if (!res.ok || !data.ok) return connexion(data.error || FAIL);
    liste(data);
  } catch {
    connexion(FAIL);
  }
})();
