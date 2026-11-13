// Tests du formulaire de contact avec un faux Apps Script.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as contacter, viderLimite } from "../functions/api/contact.js";

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

test("sans configuration d'envoi : 503", async () => {
  assert.equal((await envoi({}, { CONTACT_TO: "a@exemple.fr" })).status, 503);
});

test("refus d'Apps Script : 502", async () => {
  reponse = { ok: false, erreur: "secret" };
  assert.equal((await envoi()).status, 502);
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
