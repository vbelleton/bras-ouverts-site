// brasouverts.bzh/boutik/… : la P'tite Boutik Solidaire, servie depuis son propre projet Cloudflare Pages
// (dépôt vbelleton/petite_boutik_solidaire, construit pour vivre sous /boutik/). On relaie la requête
// telle quelle : la boutique garde son admin, son agenda, ses photos et son appli installable.
// BOUTIK_ORIGIN (facultatif) : autre adresse du projet boutique, par exemple une préversion.
const ORIGINE = "https://petite-boutik-solidaire.pages.dev";

export async function onRequest({ request, env }) {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Méthode non autorisée", { status: 405, headers: { Allow: "GET, HEAD" } });
  const origine = String(env.BOUTIK_ORIGIN || ORIGINE).replace(/\/+$/, "");
  const url = new URL(request.url);
  const chemin = url.pathname === "/boutik" ? "/boutik/" : url.pathname;
  let res;
  try {
    res = await fetch(origine + chemin + url.search, {
      method: request.method,
      headers: { Accept: request.headers.get("accept") || "*/*", "Accept-Language": request.headers.get("accept-language") || "" },
      redirect: "manual",
      // Le plus gros fichier (outil de détourage de l'admin) pèse ~23 Mo : délai large.
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    console.error("boutik: site de la boutique injoignable", e?.name || "erreur");
    return new Response("La P’tite Boutik est momentanément indisponible. Merci de réessayer dans quelques minutes.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const headers = new Headers(res.headers);
  // Une redirection de la boutique vers sa propre adresse reste sur ce domaine.
  const loc = headers.get("location");
  if (loc) {
    const cible = new URL(loc, origine + chemin);
    if (cible.origin === new URL(origine).origin) headers.set("location", cible.pathname + cible.search + cible.hash);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
