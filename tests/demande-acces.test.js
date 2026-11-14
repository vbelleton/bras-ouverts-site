// Demande d'accès à l'admin : identité vérifiée (jeton Firebase signé), enregistrement et e-mail à CONTACT_TO.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as demander, onRequestOptions, viderDemandes } from "../functions/api/demande-acces.js";
import { fausseD1 } from "./helpers.js";

const b64u = (x) => Buffer.from(typeof x === "string" ? x : new Uint8Array(x)).toString("base64url");
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };

async function jeton(claims) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" }));
  const p = b64u(JSON.stringify({
    iss: "https://securetoken.google.com/la-petite-boutik", aud: "la-petite-boutik", sub: "u1",
    exp: Math.floor(Date.now() / 1000) + 3600, email: "Marie@exemple.fr", email_verified: true, name: "Marie Durand", ...claims }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

let mails, env;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("securetoken")) return { ok: true, headers: new Headers(), json: async () => ({ keys: [jwk] }) };
  mails.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ ok: true }) };
};
beforeEach(() => {
  mails = [];
  viderDemandes();
  env = { APPS_SCRIPT_URL: "https://script.test/exec", APPS_SCRIPT_SECRET: "s", CONTACT_TO: "brasouverts.morlaix@gmail.com", DB: fausseD1() };
});

const appel = async (corps, origin = "https://bras-ouverts.pages.dev") => {
  const res = await demander({ request: new Request("https://bras-ouverts.pages.dev/api/demande-acces", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(corps) }), env });
  return { status: res.status, headers: res.headers, ...(await res.json()) };
};

test("une demande valide part à l'adresse du formulaire, avec le lien qui préremplit l'onglet Admins", async () => {
  const r = await appel({ espace: "boutik", jeton: await jeton() });
  assert.equal(r.ok, true);
  const m = mails[0].messages[0];
  assert.deepEqual(m.to, ["brasouverts.morlaix@gmail.com"]);
  assert.equal(m.replyTo, "marie@exemple.fr");
  assert.match(m.text, /Marie Durand \(marie@exemple\.fr\) demande l’accès à l’admin de la P’tite Boutik/);
  assert.match(m.text, /https:\/\/bras-ouverts\.pages\.dev\/boutik\/admin\?ajouter=marie%40exemple\.fr/);
  const { results } = await env.DB.prepare("SELECT subject, email FROM messages").all();
  assert.deepEqual(results.map((x) => ({ ...x })), [{ subject: "Demande d’accès à l’admin", email: "marie@exemple.fr" }]);
});

test("jeton falsifié, d'un autre projet ou e-mail non vérifié : refusé, rien n'est envoyé", async () => {
  const bon = await jeton();
  for (const j of [bon.slice(0, -4) + "AAAA", await jeton({ aud: "autre-projet" }), await jeton({ email_verified: false }), await jeton({ exp: 1 })]) {
    const r = await appel({ espace: "boutik", jeton: j });
    assert.equal(r.status, 401);
  }
  assert.equal(mails.length, 0);
});

test("une seule demande par heure et par adresse", async () => {
  await appel({ espace: "boutik", jeton: await jeton() });
  const r = await appel({ espace: "boutik", jeton: await jeton() });
  assert.equal(r.ok, true);
  assert.equal(mails.length, 1);
});

test("la boutique sur sa propre adresse peut appeler (CORS), pas un autre site", async () => {
  const ok = await onRequestOptions({ request: new Request("https://x/api/demande-acces", { method: "OPTIONS", headers: { Origin: "https://petite-boutik-solidaire.pages.dev" } }) });
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://petite-boutik-solidaire.pages.dev");
  const ko = await onRequestOptions({ request: new Request("https://x/api/demande-acces", { method: "OPTIONS", headers: { Origin: "https://pirate.example" } }) });
  assert.equal(ko.headers.get("access-control-allow-origin"), null);
});

test("JSON obligatoire et espace connu", async () => {
  const res = await demander({ request: new Request("https://x/api/demande-acces", { method: "POST", body: "espace=boutik" }), env });
  assert.equal(res.status, 400);
  assert.equal((await appel({ espace: "autre", jeton: "x" })).status, 400);
});
