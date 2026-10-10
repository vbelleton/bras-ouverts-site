// Tests de l'espace équipe : connexion Google, session, liste des inscrits, export, gestion de l'équipe.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fausseD1 } from "./helpers.js";
import { onRequestGet as configGoogle, onRequestPost as google } from "../functions/api/auth/google.js";
import { onRequestPost as deconnexion } from "../functions/api/auth/deconnexion.js";
import { onRequestGet as liste } from "../functions/api/inscriptions.js";
import { onRequestGet as equipeListe, onRequestPost as equipeAjout, onRequestDelete as equipeRetrait } from "../functions/api/equipe.js";
import { onRequestGet as exporter } from "../functions/api/export-inscriptions.js";
import { onRequestPost as inscrire } from "../functions/api/inscription.js";
import { sessions } from "../lib/alpha.js";
import { signer, verifier } from "../lib/auth.js";

const CLIENT_ID = "client-test.apps.googleusercontent.com";
const b64u = (x) => Buffer.from(x).toString("base64url");

// Fausse « Google » : une paire de clés RSA, publiée comme le ferait googleapis.com/oauth2/v3/certs.
const rsa = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const { publicKey, privateKey } = await rsa();
const autre = await rsa();
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };

async function jetonGoogle(email, { cle = privateKey, kid = "k1", alg = "RS256", ...champs } = {}) {
  const h = b64u(JSON.stringify({ alg, kid, typ: "JWT" }));
  const p = b64u(JSON.stringify({ iss: "https://accounts.google.com", aud: CLIENT_ID, email, email_verified: true, name: "Test", exp: Math.floor(Date.now() / 1000) + 3600, ...champs }));
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode(`${h}.${p}`))).toString("base64url");
  return `${h}.${p}.${sig}`;
}

globalThis.fetch = async (url) => {
  if (String(url).includes("googleapis.com/oauth2/v3/certs")) {
    return { ok: true, headers: { get: () => "public, max-age=3600" }, json: async () => ({ keys: [jwk] }) };
  }
  return { ok: true, json: async () => ({ Messages: [{ Status: "success" }] }) };
};

let env;
beforeEach(() => {
  env = { DB: fausseD1(), SESSION_SECRET: "x".repeat(40), GOOGLE_CLIENT_ID: CLIENT_ID, ADMIN_EMAILS: "Chef@Exemple.fr, aide@exemple.fr" };
});

const post = (corps, type = "application/json") => new Request("https://site.test/api/auth/google", { method: "POST", headers: { "Content-Type": type }, body: JSON.stringify(corps) });
const connecter = (credential, e = env) => google({ request: post({ credential }), env: e });
// Connexion complète : renvoie l'en-tête Cookie de la session ouverte.
async function seConnecter(email = "chef@exemple.fr") {
  const res = await connecter(await jetonGoogle(email));
  assert.equal(res.status, 200);
  return res.headers.get("set-cookie").split(";")[0];
}
const avec = (cookie, url = "https://site.test/api/inscriptions") => new Request(url, { headers: cookie ? { cookie } : {} });

test("un membre de l'équipe connecté avec Google reçoit une session (adresse insensible à la casse)", async () => {
  const res = await connecter(await jetonGoogle("CHEF@exemple.fr"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await res.json()).membre, "chef@exemple.fr");
});

test("un compte Google qui n'est pas dans l'équipe est refusé, sans cookie", async () => {
  const res = await connecter(await jetonGoogle("inconnu@exemple.fr"));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("jeton Google falsifié, expiré, destiné à un autre site ou d'une adresse non vérifiée : refus", async () => {
  const refus = async (credential) => assert.equal((await connecter(credential)).status, 401);
  await refus(await jetonGoogle("chef@exemple.fr", { cle: autre.privateKey }));     // mauvaise signature
  await refus(await jetonGoogle("chef@exemple.fr", { exp: Math.floor(Date.now() / 1000) - 3600 }));
  await refus(await jetonGoogle("chef@exemple.fr", { aud: "un-autre-site" }));
  await refus(await jetonGoogle("chef@exemple.fr", { iss: "https://pirate.example" }));
  await refus(await jetonGoogle("chef@exemple.fr", { email_verified: false }));
  await refus(await jetonGoogle("chef@exemple.fr", { kid: "inconnue" }));
  await refus(await jetonGoogle("chef@exemple.fr", { alg: "none" }));
  await refus("n'importe quoi");
  await refus("");
});

test("sans GOOGLE_CLIENT_ID ou sans secret de session : 503 ; les écritures n'acceptent que du JSON", async () => {
  assert.equal((await connecter(await jetonGoogle("chef@exemple.fr"), { ...env, GOOGLE_CLIENT_ID: "" })).status, 503);
  assert.equal((await connecter(await jetonGoogle("chef@exemple.fr"), { ...env, SESSION_SECRET: "" })).status, 503);
  const res = await google({ request: post({ credential: await jetonGoogle("chef@exemple.fr") }, "application/x-www-form-urlencoded"), env });
  assert.equal(res.status, 400);
});

test("la page peut lire l'identifiant client pour afficher le bouton", async () => {
  assert.equal((await (await configGoogle({ env })).json()).clientId, CLIENT_ID);
  assert.equal((await (await configGoogle({ env: {} })).json()).clientId, null);
});

test("signature de session : falsifiée, expirée ou d'un autre type = refus", async () => {
  const bon = await signer(env.SESSION_SECRET, "session", "chef@exemple.fr", 60000);
  assert.equal(await verifier(env.SESSION_SECRET, bon, "session"), "chef@exemple.fr");
  assert.equal(await verifier(env.SESSION_SECRET, bon, "autre"), null);
  assert.equal(await verifier("autre-secret", bon, "session"), null);
  assert.equal(await verifier(env.SESSION_SECRET, bon.slice(0, 8) + (bon[8] === "Z" ? "Y" : "Z") + bon.slice(9), "session"), null);
  assert.equal(await verifier(env.SESSION_SECRET, await signer(env.SESSION_SECRET, "session", "chef@exemple.fr", -1), "session"), null);
});

test("la liste des inscrits exige une session, et la session se révoque en retirant l'adresse", async () => {
  assert.equal((await liste({ request: avec(), env })).status, 401);
  assert.equal((await liste({ request: avec("bo_session=faux"), env })).status, 401);
  const cookie = await seConnecter();
  assert.equal((await liste({ request: avec(cookie), env })).status, 200);
  assert.equal((await liste({ request: avec(cookie), env: { ...env, ADMIN_EMAILS: "aide@exemple.fr" } })).status, 401);
});

test("la liste contient les inscrits et les places, et l'export marche avec la session", async () => {
  const body = new FormData();
  for (const [k, v] of Object.entries({ firstName: "Marie", lastName: "Durand", email: "marie@exemple.fr", phone: "0612345678", consent: "oui", session: sessions()[0].id, t: String(Date.now() - 9000) })) body.set(k, v);
  await inscrire({ request: new Request("https://site.test/api/inscription", { method: "POST", headers: { Accept: "application/json" }, body }), env });
  const cookie = await seConnecter("aide@exemple.fr");
  const data = await (await liste({ request: avec(cookie), env })).json();
  assert.equal(data.inscrits.length, 1);
  assert.equal(data.inscrits[0].last_name, "Durand");
  assert.equal(data.sessions[0].restantes, data.sessions[0].capacity - 1);
  const csv = await exporter({ request: avec(cookie, "https://site.test/api/export-inscriptions"), env });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Durand/);
  assert.equal((await exporter({ request: avec(null, "https://site.test/api/export-inscriptions"), env })).status, 401);
});

test("déconnexion : le cookie est effacé", async () => {
  assert.match((await deconnexion()).headers.get("set-cookie"), /Max-Age=0/);
});

const appelEquipe = (fn, cookie, email, type = "application/json") =>
  fn({ env, request: new Request("https://site.test/api/equipe", { method: fn === equipeAjout ? "POST" : "DELETE", headers: { cookie, "Content-Type": type }, body: JSON.stringify({ email }) }) });

test("équipe : ajouter une adresse lui donne accès (sans e-mail), la retirer coupe son accès", async () => {
  const cookie = await seConnecter("chef@exemple.fr");
  const data = await (await appelEquipe(equipeAjout, cookie, "Nouvelle@Exemple.fr")).json();
  assert.equal(data.ok, true);
  assert.ok(data.membres.some((m) => m.email === "nouvelle@exemple.fr" && m.ajoute_par === "chef@exemple.fr"));

  const sienne = await seConnecter("nouvelle@exemple.fr");
  assert.equal((await liste({ request: avec(sienne), env })).status, 200);
  assert.equal((await (await appelEquipe(equipeRetrait, cookie, "nouvelle@exemple.fr")).json()).ok, true);
  assert.equal((await liste({ request: avec(sienne), env })).status, 401);
  assert.equal((await connecter(await jetonGoogle("nouvelle@exemple.fr"))).status, 403);
});

test("équipe : on ne se retire pas soi-même, les adresses fixes restent, les inconnus sont refusés", async () => {
  const cookie = await seConnecter("chef@exemple.fr");
  assert.equal((await appelEquipe(equipeRetrait, cookie, "chef@exemple.fr")).status, 400);
  assert.equal((await appelEquipe(equipeRetrait, cookie, "aide@exemple.fr")).status, 400);
  assert.equal((await appelEquipe(equipeAjout, undefined, "x@exemple.fr")).status, 401);
  assert.equal((await equipeListe({ env, request: avec(null) })).status, 401);
  const membres = (await (await equipeListe({ env, request: avec(cookie) })).json()).membres;
  assert.deepEqual(membres.map((m) => m.fixe), [true, true]);
});

test("équipe : les écritures n'acceptent que du JSON (pas de formulaire venu d'un autre site)", async () => {
  const cookie = await seConnecter("chef@exemple.fr");
  assert.equal((await appelEquipe(equipeAjout, cookie, "x@exemple.fr", "application/x-www-form-urlencoded")).status, 400);
  assert.equal((await appelEquipe(equipeAjout, cookie, "pas-une-adresse")).status, 400);
});
