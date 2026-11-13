// Thème clair / sombre : suit le système par défaut, le choix du visiteur est mémorisé.
(() => {
  const root = document.documentElement;
  const KEY = "bras-ouverts-theme";
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = (v) => { try { localStorage.setItem(KEY, v); } catch {} };
  const system = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const current = () => root.dataset.theme || system();

  // Appliqué avant l'affichage pour éviter un flash du mauvais thème.
  const saved = read();
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  // Menu mobile (hamburger) : sans JavaScript, le menu reste simplement affiché en entier.
  root.classList.add("js");
  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.querySelector(".menu-toggle");
    const menu = document.getElementById("menu-principal");
    if (toggle && menu) {
      const ouvrir = (oui) => {
        toggle.setAttribute("aria-expanded", String(oui));
        toggle.setAttribute("aria-label", oui ? "Fermer le menu" : "Ouvrir le menu");
        root.classList.toggle("menu-ouvert", oui);
      };
      ouvrir(false);
      toggle.addEventListener("click", () => ouvrir(toggle.getAttribute("aria-expanded") !== "true"));
      menu.addEventListener("click", (e) => { if (e.target.closest("a")) ouvrir(false); });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") { ouvrir(false); toggle.focus(); }
      });
      document.addEventListener("click", (e) => {
        if (toggle.getAttribute("aria-expanded") === "true" && !e.target.closest(".top")) ouvrir(false);
      });
      matchMedia("(min-width: 701px)").addEventListener("change", (m) => { if (m.matches) ouvrir(false); });
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    const sync = () => {
      const dark = current() === "dark";
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Passer au thème clair" : "Passer au thème sombre");
      btn.title = btn.getAttribute("aria-label");
    };
    btn.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      save(next);
      sync();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
    sync();
  });
})();
