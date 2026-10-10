// POST /api/auth/google {credential} : ouvre la session d'un membre de l'équipe qui s'est connecté avec Google.
// GET /api/auth/google : renvoie l'identifiant client Google pour afficher le bouton (public, ce n'est pas un secret).
import { DUREE_SESSION, cookieSession, equipe, signer } from "../../../lib/auth.js";
import { verifierGoogle } from "../../../lib/google.js";

const headers = { "cache-control": "no-store" };
const erreur = (error, status) => Response.json({ ok: false, error }, { status, headers });

export async function onRequestGet({ env }) {
  return Response.json({ clientId: env.GOOGLE_CLIENT_ID || null }, { headers });
}

export async function onRequestPost({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) {
    console.error("auth: GOOGLE_CLIENT_ID ou SESSION_SECRET manquant");
    return erreur("La connexion Google n’est pas encore configurée.", 503);
  }
  // JSON uniquement : un autre site ne peut pas déclencher cette requête depuis un formulaire.
  if (!(request.headers.get("content-type") || "").includes("application/json")) return erreur("Requête illisible.", 400);
  let credential = "";
  try {
    credential = String((await request.json()).credential ?? "");
  } catch {
    return erreur("Requête illisible.", 400);
  }
  const compte = await verifierGoogle(credential, env.GOOGLE_CLIENT_ID);
  if (!compte) return erreur("La connexion Google a échoué. Merci de réessayer.", 401);
  if (!(await equipe(env)).has(compte.email)) return erreur(`Le compte ${compte.email} n’a pas accès à cette page. Demandez à un membre de l’équipe de vous ajouter.`, 403);
  const jeton = await signer(env.SESSION_SECRET, "session", compte.email, DUREE_SESSION);
  return Response.json({ ok: true, membre: compte.email }, { headers: { ...headers, "set-cookie": cookieSession(jeton) } });
}
