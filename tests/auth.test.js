// Tests de l'espace équipe : connexion par lien e-mail, session, liste et export des inscrits.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fausseD1 } from "./helpers.js";
import { onRequestPost as demande } from "../functions/api/auth/demande.js";
import { onRequestGet as pageLien, onRequestPost as ouvrir } from "../functions/api/auth/connexion.js";
import { onRequestPost as deconnexion } from "../functions/api/auth/deconnexion.js";
import { onRequestGet as liste } from "../functions/api/inscriptions.js";
import { onRequestGet as exporter } from "../functions/api/export-inscriptions.js";
import { onRequestPost as inscrire } from "../functions/api/inscription.js";
import { base, sessions } from "../lib/alpha.js";
import { signer, verifier } from "../lib/auth.js";

let envoyes, env;
globalThis.fetch = async (_url, init) => {
  const messages = JSON.parse(init.body).Messages;
  envoyes.push(...messages);
  return { ok: true, json: async () => ({ Messages: messages.map(() => ({ Status: "success" })) }) };
};
beforeEach(() => {
  envoyes = [];
  env = { DB: fausseD1(), SESSION_SECRET: "x".repeat(40), ADMIN_EMAILS: "Chef@Exemple.fr, aide@exemple.fr", MAILJET_API_KEY: "k", MAILJET_API_SECRET: "s", CONTACT_FROM: "site@exemple.fr" };
});

const json = (url, corps) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
const demander = (email, e = env) => demande({ request: json("https://site.test/api/auth/demande", { email }), env: e });
const jetonDuMail = (m) => new URL(m.TextPart.match(/https:\/\/\S+/)[0]).searchParams.get("jeton");
const formJeton = (jeton) => { const b = new FormData(); b.set("jeton", jeton); return new Request("https://site.test/api/auth/connexion", { method: "POST", body: b }); };

// Parcourt tout le chemin : demande, lien reçu, ouverture de session. Renvoie l'en-tête Cookie.
async function seConnecter(email = "chef@exemple.fr") {
  await demander(email);
  const res = await ouvrir({ request: formJeton(jetonDuMail(envoyes.at(-1))), env });
  assert.equal(res.status, 303);
  return res.headers.get("set-cookie").split(";")[0];
}
const avec = (cookie, url = "https://site.test/api/inscriptions") => new Request(url, { headers: cookie ? { cookie } : {} });

test("un membre de l'équipe reçoit un lien, un inconnu n'en reçoit pas, la réponse est la même", async () => {
  const a = await (await demander("chef@exemple.fr")).json();
  assert.equal(envoyes.length, 1);
  assert.deepEqual(envoyes[0].To, [{ Email: "chef@exemple.fr" }]);
  const b = await (await demander("inconnu@exemple.fr")).json();
  assert.equal(envoyes.length, 1);
  assert.deepEqual(a, b);
});

test("au plus 5 liens par heure et par adresse", async () => {
  for (let i = 0; i < 8; i++) await demander("chef@exemple.fr");
  assert.equal(envoyes.length, 5);
});

test("sans secret de session ou sans Mailjet, la demande répond 503", async () => {
  assert.equal((await demander("chef@exemple.fr", { ...env, SESSION_SECRET: "" })).status, 503);
  assert.equal((await demander("chef@exemple.fr", { ...env, MAILJET_API_KEY: "" })).status, 503);
});

test("ouvrir le lien en GET ne connecte pas : il faut valider par POST", async () => {
  await demander("chef@exemple.fr");
  const lien = envoyes[0].TextPart.match(/https:\/\/\S+/)[0];
  const res = await pageLien({ request: new Request(lien), env });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("jeton falsifié, expiré ou d'un autre type : refus", async () => {
  const bon = await signer(env.SESSION_SECRET, "login", "chef@exemple.fr", 60000);
  assert.equal(await verifier(env.SESSION_SECRET, bon, "login"), "chef@exemple.fr");
  assert.equal(await verifier(env.SESSION_SECRET, bon, "session"), null);
  assert.equal(await verifier("autre-secret", bon, "login"), null);
  assert.equal(await verifier(env.SESSION_SECRET, bon.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "login"), null);
  assert.equal(await verifier(env.SESSION_SECRET, await signer(env.SESSION_SECRET, "login", "chef@exemple.fr", -1), "login"), null);
  assert.equal((await ouvrir({ request: formJeton("n'importe quoi"), env })).status, 400);
});

test("un lien pour une adresse qui n'est plus dans l'équipe ne donne pas de session", async () => {
  const jeton = await signer(env.SESSION_SECRET, "login", "ancien@exemple.fr", 60000);
  const res = await ouvrir({ request: formJeton(jeton), env });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("set-cookie"), null);
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
  assert.match(await csv.text(), /Marie;|Durand/);
  assert.equal((await exporter({ request: avec(null, "https://site.test/api/export-inscriptions"), env })).status, 401);
});

test("déconnexion : le cookie est effacé", async () => {
  const res = await deconnexion();
  assert.match(res.headers.get("set-cookie"), /Max-Age=0/);
});
