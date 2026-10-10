// Accès réservé à l'équipe (liste des inscrits) : connexion par lien envoyé par e-mail, sans mot de passe.
//
// Qui a le droit : les adresses de `team.emails` dans content/site.json (modifiables dans l'administration)
// et celles de la variable ADMIN_EMAILS (séparées par des virgules). Retirer une adresse coupe l'accès
// dès le redéploiement, même pour une session déjà ouverte.
// SESSION_SECRET (variable Cloudflare, longue chaîne aléatoire) signe les liens et les sessions.
import site from "../content/site.json";

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const cle = (secret) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const COOKIE = "bo_session";
export const DUREE_LIEN = 15 * 60 * 1000;
export const DUREE_SESSION = 12 * 60 * 60 * 1000;

// kind : « login » (lien reçu par e-mail) ou « session » (cookie).
export async function signer(secret, kind, email, duree) {
  const corps = b64u(enc.encode(JSON.stringify({ k: kind, e: email, x: Date.now() + duree })));
  return `${corps}.${b64u(await crypto.subtle.sign("HMAC", await cle(secret), enc.encode(corps)))}`;
}

export async function verifier(secret, jeton, kind) {
  try {
    const [corps, sig] = String(jeton).split(".");
    if (!corps || !sig || !secret) return null;
    if (!(await crypto.subtle.verify("HMAC", await cle(secret), unb64u(sig), enc.encode(corps)))) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(corps)));
    return p.k === kind && p.x > Date.now() ? p.e : null;
  } catch {
    return null;
  }
}

export function equipe(env) {
  const duSite = Array.isArray(site.team?.emails) ? site.team.emails : [];
  return new Set([...duSite, ...String(env.ADMIN_EMAILS || "").split(",")].map((e) => String(e).trim().toLowerCase()).filter(Boolean));
}

// Adresse du membre connecté, ou null. Revérifie la liste à chaque requête.
export async function membreConnecte(request, env) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const email = m && (await verifier(env.SESSION_SECRET, m[1], "session"));
  return email && equipe(env).has(email) ? email : null;
}

export const cookieSession = (jeton) => `${COOKIE}=${jeton}; Path=/; Max-Age=${DUREE_SESSION / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const cookieEfface = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
