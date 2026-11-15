// Prochaines ouvertures de la P'tite Boutik (src/boutik-dates.js) et bandeau « Prochains événements ».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ouvertures, champs } from "../src/boutik-dates.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("1ers et 3es mercredis et samedis, fermeture retirée, ouverture exceptionnelle ajoutée", () => {
  const dates = ouvertures({
    today: new Date(2026, 10, 14),
    mois: 1,
    fermetures: [{ date: "2026-12-05" }],
    extras: [{ date: "2026-11-28", horaires: "14h – 17h" }],
  }).map((d) => iso(d.date) + (d.horaires ? ` ${d.horaires}` : ""));
  assert.deepEqual(dates, ["2026-11-18", "2026-11-21", "2026-11-28 14h – 17h", "2026-12-02", "2026-12-16", "2026-12-19"].filter((x) => x <= "2026-12-14"));
});

test("les valeurs Firestore (format REST) sont décodées", () => {
  const h = champs({ plage: { stringValue: "10h – 17h" }, regles: { arrayValue: { values: [{ mapValue: { fields: { jour: { integerValue: "3" }, semaines: { arrayValue: { values: [{ integerValue: "2" }] } } } } }] } } });
  assert.deepEqual(h, { plage: "10h – 17h", regles: [{ jour: 3, semaines: [2] }] });
});

test("la page a le bloc des prochains événements, les dates de la boutique et des maraudes (date seule)", () => {
  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /<section class="prochains" data-api="https:\/\/eglise-app\.belletonv\.workers\.dev" data-max="3"/);
  assert.ok(html.indexOf('class="prochains"') < html.indexOf('class="hero"'), "le bloc est tout en haut");
  assert.match(html, /data-dates="boutik"/);
  assert.match(html, /data-dates="maraude" data-api="[^"]+" data-max="3" data-maraude-debut="2026-11-14" data-maraude-jours="14"/, "prochaines maraudes sous les cartes, avec la règle");
  assert.match(html, /class="agenda" [^>]*data-maraude-debut="2026-11-14" data-maraude-jours="14"/, "le calendrier connaît la règle");
  assert.match(html, /lg-maraude/);
  assert.doesNotMatch(html, /js-mail/, "plus d'adresse e-mail affichée");
});

test("le menu commun est publié pour la boutique (menu.json)", () => {
  const { liens } = JSON.parse(readFileSync("dist/menu.json", "utf8"));
  assert.ok(liens.length >= 3);
  for (const l of liens) assert.match(l.url, /^(\/|https?:)/, "liens absolus, utilisables depuis /boutik/");
  assert.ok(liens.some((l) => l.url === "/boutik/"));
});

import { choisirProchains, maraudesParRegle, maraudesEntre } from "../src/prochains.js";
const E = (n) => Array.from({ length: n }, (_, i) => `evenement${i + 1}`);
const B = ["boutik1", "boutik2", "boutik3"];
const M = ["maraude1", "maraude2"];
test("diaporama : priorité aux événements, puis boutique, puis maraude", () => {
  assert.deepEqual(choisirProchains({ evenements: E(4), boutik: B, maraudes: M }), ["evenement1", "evenement2", "evenement3"]);
  assert.deepEqual(choisirProchains({ evenements: E(2), boutik: B, maraudes: M }), ["evenement1", "evenement2", "boutik1"]);
  assert.deepEqual(choisirProchains({ evenements: E(1), boutik: B, maraudes: M }), ["evenement1", "boutik1", "maraude1"]);
  assert.deepEqual(choisirProchains({ evenements: [], boutik: B, maraudes: M }), ["boutik1", "maraude1", "boutik2"]);
  assert.deepEqual(choisirProchains({ evenements: [], boutik: B, maraudes: [] }), ["boutik1", "boutik2", "boutik3"]);
});
test("maraudes par défaut : tous les 14 jours depuis le 14 novembre 2026", () => {
  const d = maraudesParRegle("2026-11-14", 14, new Date(2026, 10, 20)).map(iso);
  assert.deepEqual(d, ["2026-11-28", "2026-12-12", "2026-12-26"]);
  assert.equal(maraudesParRegle("2026-11-14", 14, new Date(2026, 10, 14)).map(iso)[0], "2026-11-14");
  assert.deepEqual(maraudesParRegle("", 14), []);
});
test("maraudes du calendrier : de la première date jusqu'à la borne, aucune avant", () => {
  const d = maraudesEntre("2026-11-14", 14, new Date(2025, 10, 1), new Date(2027, 0, 31)).map(iso);
  assert.deepEqual(d, ["2026-11-14", "2026-11-28", "2026-12-12", "2026-12-26", "2027-01-09", "2027-01-23"]);
  assert.deepEqual(maraudesEntre("2026-11-14", 14, new Date(2026, 11, 1), new Date(2026, 11, 31)).map(iso), ["2026-12-12", "2026-12-26"]);
  assert.deepEqual(maraudesEntre("", 14, new Date(), new Date()), []);
});
test("encart bleu Événements avec ses prochaines dates", () => {
  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /porte porte-bleu/);
  assert.match(html, /data-dates="evenements"/);
  assert.match(html, /data-maraude-debut="2026-11-14" data-maraude-jours="14"/);
});

import { buildEventList, agendaDe } from "../src/agenda-moteur.js";
test("un événement publié sur les deux sites apparaît dans l'agenda de Bras Ouverts", () => {
  const ev = (o) => ({ id: 1, title: "x", start_date: "2099-01-01", end_date: null, repeat_period: null, status: "active", exceptions: [], ...o });
  const liste = [ev({ id: 1, title: "Culte" }), ev({ id: 2, title: "Fête", source: "cieux-et-bras-ouverts" }), ev({ id: 3, title: "Ciné", source: "bras-ouverts" })];
  assert.equal(agendaDe(liste[1]), "les-deux");
  assert.deepEqual(buildEventList(liste, { agenda: "bras-ouverts" }).map((e) => e.titre).sort(), ["Ciné", "Fête"]);
});
