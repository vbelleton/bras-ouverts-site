// /boutik/… relaie le site de la P'tite Boutik (son propre projet Pages).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/boutik/[[path]].js";

let appels, reponse;
globalThis.fetch = async (url, init) => { appels.push({ url, init }); if (reponse instanceof Error) throw reponse; return reponse; };
beforeEach(() => { appels = []; reponse = new Response("<html>boutik</html>", { status: 200, headers: { "content-type": "text/html", "cache-control": "no-cache" } }); });
const req = (chemin, init) => onRequest({ request: new Request("https://brasouverts.bzh" + chemin, init), env: {} });

test("relaie le chemin et la requête vers le site de la boutique", async () => {
  const r = await req("/boutik/admin?x=1");
  assert.equal(appels[0].url, "https://petite-boutik-solidaire.pages.dev/boutik/admin?x=1");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "<html>boutik</html>");
  assert.equal(r.headers.get("cache-control"), "no-cache");
});

test("/boutik sans barre finale mène à /boutik/", async () => {
  await req("/boutik");
  assert.equal(appels[0].url, "https://petite-boutik-solidaire.pages.dev/boutik/");
});

test("une redirection de la boutique reste sur le domaine de l'association", async () => {
  reponse = new Response(null, { status: 301, headers: { location: "https://petite-boutik-solidaire.pages.dev/boutik/mentions" } });
  const r = await req("/boutik/mentions/");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "/boutik/mentions");
});

test("boutique injoignable : 502 explicite ; écriture refusée", async () => {
  reponse = new Error("timeout");
  assert.equal((await req("/boutik/")).status, 502);
  assert.equal((await req("/boutik/", { method: "POST", body: "x" })).status, 405);
});

test("BOUTIK_ORIGIN permet de viser une préversion", async () => {
  await onRequest({ request: new Request("https://brasouverts.bzh/boutik/"), env: { BOUTIK_ORIGIN: "https://essai.petite-boutik-solidaire.pages.dev/" } });
  assert.equal(appels[0].url, "https://essai.petite-boutik-solidaire.pages.dev/boutik/");
});
