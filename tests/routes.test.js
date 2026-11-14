// Quota Cloudflare (100 000 appels de fonction par jour pour tout le compte) : seules les pages de la
// boutique passent par le relais, jamais ses fichiers (une boucle de chargement d'image l'a épuisé le 14/11/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routes = JSON.parse(readFileSync("dist/_routes.json", "utf8"));
const redirects = readFileSync("dist/_redirects", "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"));

test("les fonctions ne couvrent que l'API et les pages de la boutique", () => {
  assert.ok(routes.include.includes("/api/*"));
  for (const p of ["/boutik/", "/boutik/admin", "/boutik/galerie", "/boutik/sw.js"]) assert.ok(routes.include.includes(p), p);
  assert.ok(!routes.include.includes("/boutik/*"), "pas de relais pour tous les fichiers");
  assert.ok(!routes.include.includes("/*"));
  assert.ok(!routes.include.some((r) => r.startsWith("/boutik/assets/") && r !== "/boutik/assets/ort*"));
});

test("les autres fichiers de la boutique sont redirigés (sans fonction), règle en dernier", () => {
  assert.equal(redirects.at(-1), "/boutik/* https://petite-boutik-solidaire.pages.dev/boutik/:splat 302");
});
