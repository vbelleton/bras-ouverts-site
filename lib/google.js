// Vérification d'un jeton « Se connecter avec Google » (ID token JWT signé RS256), sans bibliothèque.
// Documentation : https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
const CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(unb64u(s)));

// Clés publiques de Google, gardées en mémoire tant que Google le permet (cache-control: max-age).
let cles = { jwks: null, jusqua: 0 };
async function jwks(force = false) {
  if (!force && cles.jwks && cles.jusqua > Date.now()) return cles.jwks;
  // Sans délai, un Google muet suspendrait la requête sans erreur.
  const res = await fetch(CERTS, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("certificats Google indisponibles");
  const age = Number((res.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1]) || 300;
  cles = { jwks: (await res.json()).keys || [], jusqua: Date.now() + age * 1000 };
  return cles.jwks;
}

// Renvoie { email, nom } si le jeton est valide pour ce client, sinon null.
export async function verifierGoogle(credential, clientId) {
  try {
    const [h, p, sig] = String(credential).split(".");
    if (!h || !p || !sig || !clientId) return null;
    const entete = json(h);
    if (entete.alg !== "RS256") return null;
    let jwk = (await jwks()).find((k) => k.kid === entete.kid);
    if (!jwk) jwk = (await jwks(true)).find((k) => k.kid === entete.kid); // clé renouvelée entre-temps
    if (!jwk) return null;
    const cle = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cle, unb64u(sig), new TextEncoder().encode(`${h}.${p}`)))) return null;
    const c = json(p);
    const now = Date.now() / 1000;
    if (!ISSUERS.includes(c.iss) || c.aud !== clientId || !(c.exp > now - 60) || c.email_verified !== true || !c.email) return null;
    return { email: String(c.email).toLowerCase(), nom: c.name || "" };
  } catch {
    return null;
  }
}
