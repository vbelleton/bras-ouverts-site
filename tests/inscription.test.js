// Tests des Pages Functions d'inscription, avec une fausse base D1 (SQLite en mémoire) et un faux Mailjet.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { onRequestPost as inscrire } from "../functions/api/inscription.js";
import { onRequestGet as places } from "../functions/api/places.js";
import { onRequestGet as exporter } from "../functions/api/export-inscriptions.js";
import { base, sessions } from "../lib/alpha.js";

// Imite l'API D1 utilisée par le site : prepare().bind().run() / .all()
function fausseD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: (sql) => stmt(sql) };
}

let envoyes;
globalThis.fetch = async (_url, init) => {
  envoyes.push(...JSON.parse(init.body).Messages);
  return { ok: true, json: async () => ({ Messages: JSON.parse(init.body).Messages.map(() => ({ Status: "success" })) }) };
};

const SESSION = sessions()[0];
let env;
beforeEach(() => {
  envoyes = [];
  env = { DB: fausseD1(), MAILJET_API_KEY: "k", MAILJET_API_SECRET: "s", CONTACT_FROM: "site@exemple.fr", CONTACT_TO: "equipe@exemple.fr", EXPORT_PASSWORD: "secret" };
});

const requete = (champs) => {
  const body = new FormData();
  for (const [k, v] of Object.entries({ t: String(Date.now() - 10000), consent: "oui", session: SESSION.id, ...champs })) body.set(k, v);
  return new Request("https://site.test/api/inscription", { method: "POST", headers: { Accept: "application/json" }, body });
};
const inscription = async (champs, e = env) => {
  const res = await inscrire({ request: requete(champs), env: e });
  return { status: res.status, ...(await res.json()) };
};
const marie = { firstName: "Marie", lastName: "Durand", email: "Marie@Exemple.fr" };

test("une inscription valide est enregistrée et deux e-mails partent", async () => {
  const r = await inscription(marie);
  assert.equal(r.ok, true);
  assert.equal(envoyes.length, 2);
  assert.deepEqual(envoyes[0].To, [{ Email: "equipe@exemple.fr" }]);
  assert.equal(envoyes[1].To[0].Email, "marie@exemple.fr");
  const { results } = await env.DB.prepare("SELECT * FROM inscriptions").all();
  assert.equal(results.length, 1);
});

test("une deuxième inscription avec la même adresse n'est pas dupliquée", async () => {
  await inscription(marie);
  envoyes = [];
  const r = await inscription({ ...marie, email: "marie@exemple.fr" });
  assert.equal(r.ok, true);
  assert.match(r.message, /déjà inscrit/);
  assert.equal(envoyes.length, 0);
});

test("champs manquants, e-mail invalide, sans accord ou parcours inconnu : refus", async () => {
  assert.equal((await inscription({ ...marie, firstName: "" })).ok, false);
  assert.equal((await inscription({ ...marie, email: "pas-une-adresse" })).ok, false);
  assert.equal((await inscription({ ...marie, consent: "" })).ok, false);
  assert.equal((await inscription({ ...marie, session: "inconnu" })).ok, false);
});

test("un robot reçoit « ok » mais rien n'est enregistré", async () => {
  assert.equal((await inscription({ ...marie, website: "spam" })).ok, true);
  const { results } = await (await base(env.DB)).prepare("SELECT * FROM inscriptions").all();
  assert.equal(results.length, 0);
});

test("sans base D1 liée, le formulaire répond « pas encore ouvert »", async () => {
  const r = await inscription(marie, { ...env, DB: undefined });
  assert.equal(r.status, 503);
});

test("parcours complet : places à 0 et inscription refusée", async () => {
  await base(env.DB);
  for (let i = 0; i < SESSION.capacity; i++) {
    await env.DB.prepare("INSERT INTO inscriptions (session, first_name, last_name, email) VALUES (?, 'A', 'B', ?)").bind(SESSION.id, `p${i}@exemple.fr`).run();
  }
  const p = await (await places({ env })).json();
  assert.equal(p[SESSION.id], 0);
  assert.equal((await inscription(marie)).status, 409);
});

test("l'export CSV demande le mot de passe et neutralise les formules", async () => {
  await inscription({ ...marie, lastName: "=HYPERLINK(1)" });
  const get = (pass) => exporter({ env, request: new Request("https://site.test/api/export-inscriptions", pass ? { headers: { Authorization: "Basic " + btoa(`x:${pass}`) } } : {}) });
  assert.equal((await get()).status, 401);
  assert.equal((await get("faux")).status, 401);
  const res = await get("secret");
  assert.equal(res.status, 200);
  const csv = await res.text();
  assert.match(csv, /Prénom;Nom;E-mail/);
  assert.match(csv, /'=HYPERLINK/);
});
