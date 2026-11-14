// POST /api/demande-acces {espace, jeton} : une personne connectée avec Google mais pas (encore) autorisée
// demande l'accès à un espace d'administration. La demande est ENREGISTRÉE (onglet « Messages » de
// /inscriptions, comme le formulaire de contact) et envoyée par e-mail à la même adresse que le
// formulaire (CONTACT_TO). Personne n'est ajouté automatiquement : un admin accepte en ajoutant l'adresse.
//  - espace « boutik » : admin de la P'tite Boutik (/boutik/admin), jeton = ID token Firebase ;
//  - espace « equipe » : espace équipe Bras Ouverts (/inscriptions), jeton = jeton « Se connecter avec Google ».
// Seule l'identité vérifiée par Google est utilisée : on ne peut pas demander l'accès au nom d'un autre.
import { base } from "../../lib/alpha.js";
import { destinataires, envoyer, mailPret } from "../../lib/mail.js";
import { escHtml } from "../../lib/form.js";
import { verifierFirebase, verifierGoogle } from "../../lib/google.js";

export const PROJET_BOUTIK = "la-petite-boutik";
const ESPACES = {
  boutik: { nom: "l’admin de la P’tite Boutik", chemin: (email) => `/boutik/admin?ajouter=${encodeURIComponent(email)}`, ou: "onglet « Admins »" },
  equipe: { nom: "l’espace équipe Bras Ouverts (messages, équipe)", chemin: () => "/inscriptions", ou: "onglet « Équipe »" },
};

// La boutique peut aussi tourner sur sa propre adresse Cloudflare (petite-boutik-solidaire.pages.dev et ses aperçus).
const ORIGINES = /^https:\/\/([a-z0-9-]+\.)?petite-boutik-solidaire\.pages\.dev$|^http:\/\/localhost(:\d+)?$/;
const cors = (request) => {
  const o = request.headers.get("origin") || "";
  return ORIGINES.test(o) ? { "access-control-allow-origin": o, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", vary: "origin" } : {};
};

// Une demande par adresse et par heure (au mieux de l'isolat).
const recentes = new Map();
export const viderDemandes = () => recentes.clear();
function tropRecente(email, now = Date.now()) {
  for (const [k, t] of recentes) if (now - t > 60 * 60 * 1000) recentes.delete(k);
  if (recentes.has(email)) return true;
  recentes.set(email, now);
  return false;
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestPost({ request, env }) {
  const headers = { "cache-control": "no-store", ...cors(request) };
  const rep = (corps, status = 200) => Response.json(corps, { status, headers });
  if (!(request.headers.get("content-type") || "").includes("application/json")) return rep({ ok: false, error: "Requête illisible." }, 400);
  let corps;
  try {
    corps = await request.json();
  } catch {
    return rep({ ok: false, error: "Requête illisible." }, 400);
  }
  const espace = ESPACES[corps?.espace] ? corps.espace : null;
  if (!espace) return rep({ ok: false, error: "Espace inconnu." }, 400);
  const compte = espace === "boutik"
    ? await verifierFirebase(corps.jeton, PROJET_BOUTIK)
    : await verifierGoogle(corps.jeton, env.GOOGLE_CLIENT_ID);
  if (!compte) return rep({ ok: false, error: "Connexion Google expirée. Reconnectez-vous, puis redemandez l’accès." }, 401);
  if (tropRecente(`${espace}:${compte.email}`)) return rep({ ok: true, deja: true });

  const e = ESPACES[espace];
  const lien = `${new URL(request.url).origin}${e.chemin(compte.email)}`;
  const qui = compte.nom ? `${compte.nom} (${compte.email})` : compte.email;
  const texte = `${qui} demande l’accès à ${e.nom}.\n\nPour accepter : ouvrez ${lien} (${e.ou}) et ajoutez l’adresse ${compte.email}.\nSi vous ne connaissez pas cette personne, ignorez simplement ce message.`;

  let enregistre = false;
  if (env.DB) {
    try {
      const db = await base(env.DB);
      const [prenom, ...reste] = (compte.nom || compte.email).split(" ");
      await db.prepare("INSERT INTO messages (first_name, last_name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(prenom, reste.join(" "), compte.email, null, "Demande d’accès à l’admin", texte).run();
      enregistre = true;
    } catch (err) {
      console.error("demande-acces: enregistrement impossible", err?.name || "erreur");
    }
  }
  const to = destinataires(env.CONTACT_TO);
  const parti = mailPret(env) && to.length > 0 && await envoyer(env, [{
    to,
    replyTo: compte.email,
    subject: `Demande d’accès à ${e.nom} : ${compte.email}`,
    text: texte,
    html: `<p>${escHtml(qui)} demande l’accès à ${escHtml(e.nom)}.</p><p><a href="${escHtml(lien)}">Ouvrir l’admin pour accepter</a> (${escHtml(e.ou)}, ajouter <strong>${escHtml(compte.email)}</strong>).</p><p>Si vous ne connaissez pas cette personne, ignorez simplement ce message.</p>`,
  }]);
  if (!enregistre && !parti) {
    console.error("demande-acces: ni base ni e-mail disponibles");
    return rep({ ok: false, error: "La demande n’a pas pu être envoyée. Contactez directement l’association." }, 503);
  }
  return rep({ ok: true });
}
