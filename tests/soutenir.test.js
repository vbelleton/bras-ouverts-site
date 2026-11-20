// Page « Nous soutenir » : le RIB doit être recopié exactement (une erreur enverrait les dons ailleurs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const site = JSON.parse(readFileSync("content/site.json", "utf8"));
const page = readFileSync("dist/soutenir/index.html", "utf8");
const menu = JSON.parse(readFileSync("dist/menu.json", "utf8"));
const s = site.soutenir;

// Contrôle ISO 13616 : IBAN valide si le reste modulo 97 vaut 1.
const ibanValide = (iban) => {
  const v = iban.replace(/\s+/g, "").toUpperCase();
  const r = (v.slice(4) + v.slice(0, 4)).split("").map((c) => parseInt(c, 36)).join("");
  return [...r].reduce((m, c) => (m * 10 + Number(c)) % 97, 0) === 1;
};
// Clé RIB : 97 - (89 × banque + 15 × guichet + 3 × compte) mod 97, lettres du compte converties.
const cleRib = (b, g, c) => {
  const conv = c.toUpperCase().replace(/[A-Z]/g, (l) => "12345678912345678923456789"["ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(l)]);
  return 97 - Number((89n * BigInt(b) + 15n * BigInt(g) + 3n * BigInt(conv)) % 97n);
};

test("le RIB de la page est celui du relevé LCL de l'association", () => {
  assert.equal(s.iban, "FR43 3000 2058 3500 0007 0683 F16");
  assert.equal(s.bic, "CRLYFRPPXXX");
  assert.equal(s.titulaire, "BRAS OUVERTS");
  assert.deepEqual([s.codeBanque, s.codeGuichet, s.compte, s.cle], ["30002", "05835", "0000070683F", "16"]);
  assert.ok(ibanValide(s.iban), "IBAN invalide");
  assert.equal(cleRib(s.codeBanque, s.codeGuichet, s.compte), Number(s.cle), "clé RIB incohérente");
  assert.equal(s.iban.replace(/\s/g, ""), `FR43${s.codeBanque}${s.codeGuichet}${s.compte}${s.cle}`, "IBAN et RIB national différents");
});

test("la page affiche l'IBAN, le BIC et un bouton pour copier l'IBAN sans espaces", () => {
  assert.ok(page.includes(s.iban));
  assert.ok(page.includes(s.bic));
  assert.ok(page.includes(`data-copier="${s.iban.replace(/\s/g, "")}"`));
  assert.ok(!/€|\beuros?\b/i.test(page), "jamais de montant ni de prix");
});

test("la page a sa place dans le menu commun et son bouton dans la barre du bas", () => {
  assert.ok(menu.liens.some((l) => l.url === "/soutenir/"));
  const b = menu.barre.find((x) => x.url === "/soutenir/");
  assert.equal(b && b.icon, "soutenir");
  assert.ok(menu.barre.length <= 6);
  assert.ok(page.includes('href="/#agenda"'), "ancres absolues hors de l'accueil");
  assert.match(page, /<a href="\/soutenir\/" aria-current="true" data-ico="soutenir">/);
});
