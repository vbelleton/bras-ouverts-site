// Envoi des formulaires (contact, inscription Alpha) sans recharger la page.
// Sans JavaScript, le formulaire est posté normalement et la page revient avec ?envoi=ok ou ?envoi=erreur.
document.addEventListener("DOMContentLoaded", () => {
  // Recompose les adresses e-mail protégées (voir mailLink dans build.mjs).
  for (const a of document.querySelectorAll("a.js-mail")) {
    const rev = (x) => [...(x || "")].reverse().join("");
    const addr = `${rev(a.dataset.u)}@${rev(a.dataset.d)}`;
    a.href = `mailto:${addr}`;
    a.textContent = addr;
  }

  const FAIL = "L’envoi a échoué. Merci de réessayer un peu plus tard.";
  const params = new URLSearchParams(location.search);

  for (const form of document.querySelectorAll("form.js-form")) {
    const status = form.querySelector(".status");
    const button = form.querySelector("button[type=submit]");
    const stamp = form.querySelector("input[name=t]");
    stamp.value = String(Date.now());

    const show = (text, ok) => {
      status.textContent = text;
      status.className = "status " + (ok ? "ok" : "err");
    };

    // Retour d'un envoi sans JavaScript : /?envoi=ok&f=inscription#alpha
    const target = new URL(form.action).pathname.split("/").pop();
    if (params.get("f") === target) {
      if (params.get("envoi") === "ok") show(form.dataset.success, true);
      if (params.get("envoi") === "erreur") show(params.get("msg") || FAIL, false);
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      button.disabled = true;
      show("Envoi en cours…", true);
      try {
        const res = await fetch(form.action, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(form) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || FAIL);
        form.reset();
        stamp.value = String(Date.now());
        show(data.message || form.dataset.success, true);
      } catch (err) {
        show(err instanceof TypeError ? FAIL : err.message, false);
      } finally {
        if (!form.classList.contains("is-full")) button.disabled = false;
      }
    });
  }

  // Parcours complets : on les signale avant que le visiteur remplisse le formulaire.
  const alpha = document.querySelector(".inscription-form");
  if (!alpha) return;
  fetch("/api/places", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((places) => {
      if (!places) return;
      const select = alpha.querySelector("select[name=session]");
      if (select) {
        for (const opt of select.options) {
          if (opt.value && places[opt.value] === 0) {
            opt.disabled = true;
            opt.textContent += " (complet)";
          }
        }
        if ([...select.options].some((o) => o.value) && [...select.options].every((o) => !o.value || o.disabled)) markFull();
      } else {
        const id = alpha.querySelector("input[name=session]")?.value;
        if (places[id] === 0) markFull();
      }
    })
    .catch(() => {});

  function markFull() {
    alpha.classList.add("is-full");
    alpha.querySelector("button[type=submit]").disabled = true;
    const s = alpha.querySelector(".status");
    s.textContent = alpha.dataset.full;
    s.className = "status err";
  }
});
