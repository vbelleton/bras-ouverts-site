// Tests du formulaire de contact avec un faux Apps Script.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as contacter } from "../functions/api/contact.js";

let appels, reponse;
globalThis.fetch = async (url, init) => {
  appels.push({ url, body: JSON.parse(init.body) });
  return { ok: true, json: async () => reponse };
};

let env;
beforeEach(() => {
  appels = [];
  reponse = { ok: true };
  env = { APPS_SCRIPT_URL: "https://script.test/exec", APPS_SCRIPT_SECRET: "s", CONTACT_TO: "a@exemple.fr, b@exemple.fr" };
});

const envoi = async (champs = {}, e = env) => {
  const body = new FormData();
  for (const [k, v] of Object.entries({ t: String(Date.now() - 10000), name: "Paul", email: "paul@exemple.fr", message: "Bonjour", subject: "Autre", ...champs })) body.set(k, v);
  const res = await contacter({ request: new Request("https://site.test/api/contact", { method: "POST", headers: { Accept: "application/json" }, body }), env: e });
  return { status: res.status, ...(await res.json()) };
};

test("le message part vers CONTACT_TO avec le secret et l'adresse du visiteur en réponse", async () => {
  const r = await envoi();
  assert.equal(r.ok, true);
  const m = appels[0].body;
  assert.equal(m.secret, "s");
  assert.deepEqual(m.messages[0].to, ["a@exemple.fr", "b@exemple.fr"]);
  assert.equal(m.messages[0].replyTo, "paul@exemple.fr");
  assert.match(m.messages[0].subject, /Autre.*Paul/);
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
