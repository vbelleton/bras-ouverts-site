// POST /api/auth/demande {email} : envoie un lien de connexion si l'adresse fait partie de l'équipe.
// La réponse est la même pour toute adresse, pour ne pas révéler qui fait partie de l'équipe.
import { EMAIL_RE } from "../../../lib/form.js";
import { base } from "../../../lib/alpha.js";
import { DUREE_LIEN, equipe, signer } from "../../../lib/auth.js";
import { envoyer, mailjetPret } from "../../../lib/mailjet.js";

const REPONSE = "Si cette adresse fait partie de l’équipe, un lien de connexion vient d’être envoyé. Il est valable 15 minutes.";
const MAX_PAR_HEURE = 5;

export async function onRequestPost({ request, env }) {
  const erreur = (msg, status = 400) => Response.json({ ok: false, error: msg }, { status });
  let email = "";
  try {
    email = String((await request.json()).email ?? "").trim().toLowerCase().slice(0, 200);
  } catch {
    return erreur("Requête illisible.");
  }
  if (!EMAIL_RE.test(email)) return erreur("L’adresse e-mail semble incorrecte.");
  if (!env.SESSION_SECRET || !env.DB || !mailjetPret(env)) {
    console.error("auth: SESSION_SECRET, base D1 ou variables Mailjet manquantes");
    return erreur("La connexion par e-mail n’est pas encore configurée.", 503);
  }
  const ok = Response.json({ ok: true, message: REPONSE });
  if (!equipe(env).has(email)) return ok;

  // Au plus 5 liens par heure et par adresse, pour qu'on ne puisse pas noyer la boîte d'un membre.
  const db = await base(env.DB);
  const depuis = Date.now() - 3600 * 1000;
  const { results } = await db.prepare("SELECT COUNT(*) AS n FROM connexions WHERE email = ? AND at > ?").bind(email, depuis).all();
  if (results[0].n >= MAX_PAR_HEURE) return ok;
  await db.prepare("DELETE FROM connexions WHERE at <= ?").bind(depuis).run();
  await db.prepare("INSERT INTO connexions (email, at) VALUES (?, ?)").bind(email, Date.now()).run();

  const lien = new URL("/api/auth/connexion", request.url);
  lien.searchParams.set("jeton", await signer(env.SESSION_SECRET, "login", email, DUREE_LIEN));
  const sent = await envoyer(env, [{
    To: [{ Email: email }],
    Subject: "Connexion à la liste des inscrits Bras Ouverts",
    TextPart: `Bonjour,\n\nPour consulter les inscriptions au Parcours Alpha, ouvrez ce lien (valable 15 minutes) :\n\n${lien}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.\n`,
  }]);
  return sent ? ok : erreur("L’envoi a échoué. Merci de réessayer un peu plus tard.", 502);
}
