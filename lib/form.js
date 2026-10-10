// Outils communs aux Pages Functions des formulaires.

export const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Réponse JSON pour l'envoi en JavaScript, redirection vers la page sinon.
export function replier(request, anchor, form) {
  const wantsJson = (request.headers.get("accept") || "").includes("application/json");
  return (ok, error, status = ok ? 200 : 400, message) => {
    if (wantsJson) return Response.json(ok ? { ok: true, ...(message ? { message } : {}) } : { ok: false, error }, { status });
    const url = new URL("/", request.url);
    url.searchParams.set("f", form);
    url.searchParams.set("envoi", ok ? "ok" : "erreur");
    if (!ok && error) url.searchParams.set("msg", error);
    url.hash = anchor;
    return Response.redirect(url.toString(), 303);
  };
}

export async function lire(request, max) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return null;
  }
  const get = (k) => String(form.get(k) ?? "").trim().slice(0, max[k] ?? 200);
  // Anti-spam : champ piège rempli, ou formulaire envoyé moins de 3 s après l'affichage.
  const t = Number(form.get("t"));
  const robot = Boolean(get("website")) || Boolean(t && Date.now() - t < 3000);
  return { get, robot };
}

export const escHtml = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Tableau « libellé : valeur » en texte et en HTML, pour les e-mails.
export function tableau(lines, message = "") {
  const rows = lines.filter(([, v]) => v);
  return {
    text: `${rows.map(([k, v]) => `${k} : ${v}`).join("\n")}${message ? `\n\n${message}` : ""}\n`,
    html: `<table>${rows.map(([k, v]) => `<tr><th align="left" style="padding-right:12px">${escHtml(k)}</th><td>${escHtml(v)}</td></tr>`).join("")}</table>`
      + (message ? `<p style="white-space:pre-wrap">${escHtml(message)}</p>` : ""),
  };
}
