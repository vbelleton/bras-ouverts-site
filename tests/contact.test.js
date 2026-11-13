// Tests du formulaire de contact avec un faux Apps Script et une fausse base D1.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as contacter, viderLimite } from "../functions/api/contact.js";
import { onRequestGet as lireMessages, onRequestPatch as marquer, onRequestDelete as supprimer } from "../functions/api/messages.js";
import { fausseD1 } from "./helpers.js";
import { signer, COOKIE, DUREE_SESSION } from "../lib/auth.js";

let appels, reponse;
globalThis.fetch = async (url, init) => {
  appels.push({ url, body: JSON.parse(init.body) });
  return { ok: true, json: async () => reponse };
};

let env;
beforeEach(() => {
  appels = [];
  viderLimite();
  reponse = { ok: true };
  env = { APPS_SCRIPT_URL: "https://script.test/exec", APPS_SCRIPT_SECRET: "s", CONTACT_TO: "a@exemple.fr, b@exemple.fr" };
});

const envoi = async (champs = {}, e = env, ip) => {
  const body = new FormData();
  for (const [k, v] of Object.entries({ t: String(Date.now() - 10000), firstName: "Paul", lastName: "Martin", email: "paul@exemple.fr", message: "Bonjour, je voudrais aider.", subject: "Autre", ...champs })) body.set(k, v);
  const res = await contacter({ request: new Request("https://site.test/api/contact", { method: "POST", headers: { Accept: "application/json", ...(ip ? { "cf-connecting-ip": ip } : {}) }, body }), env: e });
  return { status: res.status, ...(await res.json()) };
};

test("le message part vers CONTACT_TO avec le secret et l'adresse du visiteur en réponse", async () => {
  const r = await envoi();
  assert.equal(r.ok, true);
  const m = appels[0].body;
  assert.equal(m.secret, "s");
  assert.deepEqual(m.messages[0].to, ["a@exemple.fr", "b@exemple.fr"]);
  assert.equal(m.messages[0].replyTo, "paul@exemple.fr");
  assert.match(m.messages[0].subject, /Autre.*Paul Martin/);
});

test("sans base ni configuration d'envoi : 503", async () => {
  assert.equal((await envoi({}, { CONTACT_TO: "a@exemple.fr" })).status, 503);
});

test("sans base, refus d'Apps Script : 502", async () => {
  reponse = { ok: false, erreur: "secret" };
  assert.equal((await envoi()).status, 502);
});

// Comme sur le site de l'église : le message est d'abord enregistré, l'e-mail n'est qu'une notification.
test("avec la base : le message est enregistré, même sans e-mail configuré", async () => {
  const DB = fausseD1();
  const r = await envoi({ phone: "06 00 00 00 00" }, { DB });
  assert.equal(r.ok, true);
  assert.equal(appels.length, 0);
  const { results } = await DB.prepare("SELECT first_name, last_name, email, phone, subject, message, lu FROM messages").all();
  assert.deepEqual({ ...results[0] }, { first_name: "Paul", last_name: "Martin", email: "paul@exemple.fr", phone: "06 00 00 00 00", subject: "Autre", message: "Bonjour, je voudrais aider.", lu: 0 });
});

test("avec la base : un e-mail refusé ne fait pas perdre le message ni échouer l'envoi", async () => {
  reponse = { ok: false, erreur: "quota" };
  const DB = fausseD1();
  const r = await envoi({}, { ...env, DB });
  assert.equal(r.ok, true);
  assert.equal(appels.length, 1);
  assert.match(appels[0].body.messages[0].text, /site\.test\/inscriptions/);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM messages").all()).results[0].n, 1);
});

test("onglet Messages : réservé à l'équipe, lecture, marquer lu, supprimer", async () => {
  const DB = fausseD1();
  await envoi({}, { DB });
  const e = { DB, SESSION_SECRET: "x".repeat(40), ADMIN_EMAILS: "chef@exemple.fr" };
  const cookie = `${COOKIE}=${await signer(e.SESSION_SECRET, "session", "chef@exemple.fr", DUREE_SESSION)}`;
  const req = (method, corps, type = "application/json") => new Request("https://site.test/api/messages", { method, headers: { cookie, ...(corps ? { "Content-Type": type } : {}) }, body: corps ? JSON.stringify(corps) : undefined });

  assert.equal((await lireMessages({ request: new Request("https://site.test/api/messages"), env: e })).status, 401);
  const liste = await (await lireMessages({ request: req("GET"), env: e })).json();
  assert.equal(liste.messages.length, 1);
  const id = liste.messages[0].id;
  assert.equal((await marquer({ request: req("PATCH", { id, lu: true }, "text/plain"), env: e })).status, 400);
  assert.equal((await (await marquer({ request: req("PATCH", { id, lu: true }), env: e })).json()).modifies, 1);
  assert.equal((await (await lireMessages({ request: req("GET"), env: e })).json()).messages[0].lu, 1);
  assert.equal((await (await supprimer({ request: req("DELETE", { id }), env: e })).json()).supprimes, 1);
  assert.equal((await (await lireMessages({ request: req("GET"), env: e })).json()).messages.length, 0);
});

test("e-mail invalide ou robot", async () => {
  assert.equal((await envoi({ email: "x" })).ok, false);
  assert.equal((await envoi({ website: "spam" })).ok, true);
  assert.equal(appels.length, 0);
});

test("prénom, nom et message d'au moins 10 caractères obligatoires", async () => {
  assert.equal((await envoi({ lastName: "" })).ok, false);
  assert.equal((await envoi({ message: "Salut" })).ok, false);
  assert.equal(appels.length, 0);
});

test("ancien champ unique « name » encore accepté", async () => {
  const r = await envoi({ firstName: "", lastName: "", name: "Paule" });
  assert.equal(r.ok, true);
  assert.match(appels[0].body.messages[0].subject, /Paule/);
});

test("au-delà de 3 envois par quart d'heure depuis la même adresse : 429", async () => {
  for (let i = 0; i < 3; i++) assert.equal((await envoi({}, env, "1.2.3.4")).ok, true);
  assert.equal((await envoi({}, env, "1.2.3.4")).status, 429);
  assert.equal((await envoi({}, env, "5.6.7.8")).ok, true);
});
