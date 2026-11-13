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

    // Champ par champ, comme sur le formulaire de l'église : le champ fautif est signalé
    // (aria-invalid) et reçoit le focus, au lieu d'une bulle du navigateur.
    const verifier = () => {
      let premier = null;
      for (const champ of form.querySelectorAll("input, select, textarea")) {
        if (champ.type === "hidden" || champ.closest(".hp")) continue;
        const v = champ.value.trim();
        const ko = (champ.required && (champ.type === "checkbox" ? !champ.checked : !v))
          || (champ.type === "email" && v && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v))
          || (champ.minLength > 0 && v && v.length < champ.minLength);
        if (ko) { champ.setAttribute("aria-invalid", "true"); premier ||= champ; }
        else champ.removeAttribute("aria-invalid");
      }
      return premier;
    };
    form.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid")) verifier(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fautif = verifier();
      if (fautif) {
        const nom = fautif.closest("label")?.querySelector("span")?.textContent.replace("*", "").trim() || "ce champ";
        show(fautif.minLength > 0 && fautif.value.trim()
          ? `« ${nom} » : au moins ${fautif.minLength} caractères, s’il vous plaît.`
          : fautif.type === "email" && fautif.value.trim() ? "L’adresse e-mail semble incorrecte." : `Merci de remplir « ${nom} ».`, false);
        fautif.focus();
        return;
      }
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
