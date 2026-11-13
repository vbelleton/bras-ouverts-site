// L'agenda vient du même Worker que celui de l'église : il ne doit montrer que les événements Bras Ouverts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEventList } from "../src/agenda-moteur.js";

test("seuls les événements « bras-ouverts » sont gardés", () => {
  const liste = [
    { id: 1, title: "Culte", start_date: "2026-12-06", status: "active", exceptions: [] },
    { id: 2, title: "Maraude", start_date: "2026-12-05", status: "active", source: "bras-ouverts", exceptions: [] },
    { id: 3, title: "Maraude annulée", start_date: "2026-12-12", status: "cancelled", source: "bras-ouverts", exceptions: [] },
  ];
  const titres = buildEventList(liste, { now: "2026-12-01T12:00:00", agenda: "bras-ouverts" }).map((e) => e.titre);
  assert.deepEqual(titres, ["Maraude"]);
});

test("la page demande au Worker l'agenda Bras Ouverts seulement", () => {
  const js = readFileSync("src/agenda.js", "utf8");
  assert.match(js, /source=\$\{AGENDA_BRAS_OUVERTS\}/);
  assert.match(js, /AbortSignal\.timeout/);
  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /class="agenda" data-api="https:\/\/eglise-app\.belletonv\.workers\.dev"/);
  assert.match(html, /<script type="module" src="\/agenda\.js">/);
});

test("le moteur est la copie exacte de celui du site de l'église (en-tête mis à part)", () => {
  const src = readFileSync("src/agenda-moteur.js", "utf8");
  assert.match(src, /^\/\/ COPIE de vbelleton\/eglise-cieux-ouverts : utils\/churchEvents\.js/);
  assert.match(src, /export function agendaDe/);
});
