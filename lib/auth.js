// Accès réservé à l'équipe (liste des inscrits) : connexion avec un compte Google, sans mot de passe ni e-mail à envoyer.
//
// Qui a le droit : les adresses de la variable ADMIN_EMAILS (séparées par des virgules, non retirables depuis
// le site) et celles ajoutées depuis l'onglet « Équipe » de /inscriptions (table D1 `equipe`).
// Retirer une adresse coupe l'accès immédiatement, même pour une session déjà ouverte.
// GOOGLE_CLIENT_ID identifie le site auprès de Google ; SESSION_SECRET (longue chaîne aléatoire) signe les sessions.
import { base } from "./alpha.js";

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const cle = (secret) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const COOKIE = "bo_session";
export const DUREE_SESSION = 12 * 60 * 60 * 1000;

// kind : « session » (cookie). Le paramètre existe pour séparer d'éventuels autres usages de la signature.
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

// Adresses fixes (variable ADMIN_EMAILS), en minuscules.
export const adressesFixes = (env) => new Set(String(env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

// Toute l'équipe : adresses fixes et membres ajoutés depuis le site.
export async function equipe(env) {
  const tous = adressesFixes(env);
  if (env.DB) {
    const { results } = await (await base(env.DB)).prepare("SELECT email FROM equipe").all();
    for (const r of results) tous.add(String(r.email).toLowerCase());
  }
  return tous;
}

// Adresse du membre connecté, ou null. Revérifie la liste à chaque requête.
export async function membreConnecte(request, env) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const email = m && (await verifier(env.SESSION_SECRET, m[1], "session"));
  return email && (await equipe(env)).has(email) ? email : null;
}

export const cookieSession = (jeton) => `${COOKIE}=${jeton}; Path=/; Max-Age=${DUREE_SESSION / 1000}; HttpOnly; Secure; SameSite=Lax`;
export const cookieEfface = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
