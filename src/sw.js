// Service worker de l'appli installable Bras Ouverts.
// Réseau d'abord, copie en cache en secours (hors connexion) : après une mise à jour, jamais d'ancienne
// feuille de style avec une nouvelle page. Ne touche JAMAIS à /api/ (formulaires, données), à l'espace équipe
// (/inscriptions) ni à la boutique (/boutik/, qui a son propre service worker), ni aux autres sites
// (agenda, polices) : ces requêtes passent telles quelles.
// Changer VERSION à chaque changement de stratégie de cache.
const VERSION = "bo-v1";
const ESSENTIELS = ["/", "/style.css", "/forms.js", "/agenda.js", "/agenda-moteur.js", "/logo.png", "/favicon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ESSENTIELS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k.startsWith("bo-") && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const horsCache = (url) => url.origin !== location.origin || /^\/(api|inscriptions|boutik)(\/|$)/.test(url.pathname) || url.pathname === "/sw.js";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (horsCache(url)) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && url.pathname === "/") { const copie = res.clone(); caches.open(VERSION).then((c) => c.put("/", copie)); }
      return res;
    }).catch(async () => (await caches.match(url.pathname === "/" ? "/" : req)) || (await caches.match("/")) || Response.error()));
    return;
  }

  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copie = res.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); }
    return res;
  }).catch(async () => (await caches.match(req)) || Response.error()));
});
