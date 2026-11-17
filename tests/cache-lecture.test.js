import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const stock = new Map();
globalThis.localStorage = { getItem: (k) => (stock.has(k) ? stock.get(k) : null), setItem: (k, v) => stock.set(k, v) };
const { avecMemoire, lireMemoire, ecrireMemoire } = await import("../src/cache-lecture.js");
beforeEach(() => stock.clear());

test("sans mémoire : on attend le réseau, puis on le garde", async () => {
  assert.deepEqual(await avecMemoire("a", async () => [1]), [1]);
  assert.deepEqual(lireMemoire("a"), [1]);
});
test("avec mémoire : réponse immédiate, la mémoire est rafraîchie en arrière-plan", async () => {
  ecrireMemoire("a", ["ancien"]);
  let fini; const lent = new Promise((r) => { fini = r; });
  const res = await avecMemoire("a", () => lent.then(() => ["neuf"]));
  assert.deepEqual(res, ["ancien"]);
  fini(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(lireMemoire("a"), ["neuf"]);
});
test("mémoire trop ancienne : on attend le réseau", async () => {
  stock.set("bo-cache:a", JSON.stringify({ t: Date.now() - 7 * 3600 * 1000, v: ["vieux"] }));
  assert.deepEqual(await avecMemoire("a", async () => ["neuf"]), ["neuf"]);
});
test("réseau en échec avec mémoire : pas d'erreur", async () => {
  ecrireMemoire("a", [1]);
  assert.deepEqual(await avecMemoire("a", async () => { throw new Error("hors ligne"); }), [1]);
});
test("stockage refusé : on passe par le réseau", async () => {
  const sauve = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error("refusé"); }, setItem() { throw new Error("refusé"); } };
  assert.deepEqual(await avecMemoire("a", async () => [2]), [2]);
  globalThis.localStorage = sauve;
});
