// Lien reçu par e-mail. GET affiche un bouton, POST ouvre la session : un lien pré-ouvert par un
// antivirus de messagerie ne consomme donc rien et ne connecte personne.
import { DUREE_SESSION, cookieSession, equipe, signer, verifier } from "../../../lib/auth.js";
import { escHtml } from "../../../lib/form.js";

const page = (titre, corps, status = 200) =>
  new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(titre)}</title>
<body style="font:18px/1.6 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 20px;color:#1f2a3a"><h1 style="font-size:1.5rem">${escHtml(titre)}</h1>${corps}`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
const bouton = "background:#137c74;color:#fff;border:0;border-radius:999px;padding:12px 24px;font:inherit;font-weight:700;cursor:pointer";

export async function onRequestGet({ request, env }) {
  const jeton = new URL(request.url).searchParams.get("jeton") || "";
  const email = await verifier(env.SESSION_SECRET, jeton, "login");
  if (!email || !equipe(env).has(email)) {
    return page("Lien expiré ou invalide", `<p>Demandez un nouveau lien depuis <a href="/inscriptions">la page des inscriptions</a>.</p>`, 400);
  }
  return page("Liste des inscrits", `<p>Connexion en tant que <strong>${escHtml(email)}</strong>.</p>
<form method="post"><input type="hidden" name="jeton" value="${escHtml(jeton)}"><button style="${bouton}">Me connecter</button></form>`);
}

export async function onRequestPost({ request, env }) {
  let jeton = "";
  try {
    jeton = String((await request.formData()).get("jeton") ?? "");
  } catch {}
  const email = await verifier(env.SESSION_SECRET, jeton, "login");
  if (!email || !equipe(env).has(email)) {
    return page("Lien expiré ou invalide", `<p>Demandez un nouveau lien depuis <a href="/inscriptions">la page des inscriptions</a>.</p>`, 400);
  }
  return new Response(null, {
    status: 303,
    headers: { location: "/inscriptions", "set-cookie": cookieSession(await signer(env.SESSION_SECRET, "session", email, DUREE_SESSION)), "cache-control": "no-store" },
  });
}
