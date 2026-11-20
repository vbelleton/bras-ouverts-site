// Page « Nous soutenir » : boutons « Copier » à côté de l'IBAN et du BIC (copiés sans espaces).
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copier]");
  if (!b) return;
  const statut = document.querySelector(".rib-statut");
  const dire = (m) => { if (statut) { statut.textContent = ""; setTimeout(() => { statut.textContent = m; }, 30); } };
  try {
    await navigator.clipboard.writeText(b.dataset.copier);
    b.textContent = "Copié ✓";
    b.classList.add("copie");
    dire(`${b.dataset.quoi || "Texte"} copié.`);
    setTimeout(() => { b.textContent = "Copier"; b.classList.remove("copie"); }, 2500);
  } catch {
    // Presse-papiers refusé (ancien navigateur, page non sécurisée) : on sélectionne le texte à copier à la main.
    const val = b.parentElement.querySelector(".rib-val");
    if (val) getSelection().selectAllChildren(val);
    dire("Copie impossible : le texte est sélectionné, copiez-le à la main.");
  }
});
