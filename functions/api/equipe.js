// Gestion de l'équipe depuis la page /inscriptions : lister, ajouter (avec e-mail d'invitation), retirer.
// Réservé aux membres connectés. Les adresses de ADMIN_EMAILS sont fixes : elles ne se retirent pas d'ici.
import { EMAIL_RE } from "../../lib/form.js";
import { base } from "../../lib/alpha.js";
import { adressesFixes, equipe, membreConnecte } from "../../lib/auth.js";
import { envoyer, mailjetPret } from "../../lib/mailjet.js";

const headers = { "cache-control": "no-store" };
const rep = (corps, status = 200) => Response.json(corps, { status, headers });

// Les écritures n'acceptent que du JSON : un autre site ne peut pas les déclencher depuis un formulaire.
async function lireEmail(request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) return null;
  try {
    const email = String((await request.json()).email ?? "").trim().toLowerCase().slice(0, 200);
    return EMAIL_RE.test(email) ? email : null;
  } catch {
    return null;
  }
}

async function liste(env) {
  const fixes = adressesFixes(env);
  const { results } = await (await base(env.DB)).prepare("SELECT email, ajoute_par, created_at FROM equipe ORDER BY created_at").all();
  return [
    ...[...fixes].map((email) => ({ email, fixe: true })),
    ...results.filter((r) => !fixes.has(r.email)).map((r) => ({ email: r.email, fixe: false, ajoute_par: r.ajoute_par, created_at: r.created_at })),
  ];
}

export async function onRequestGet({ request, env }) {
  if (!(await membreConnecte(request, env))) return rep({ ok: false, error: "Connexion requise." }, 401);
  if (!env.DB) return rep({ ok: false, error: "Base non liée." }, 503);
  return rep({ ok: true, membres: await liste(env) });
}

export async function onRequestPost({ request, env }) {
  const moi = await membreConnecte(request, env);
  if (!moi) return rep({ ok: false, error: "Connexion requise." }, 401);
  if (!env.DB) return rep({ ok: false, error: "Base non liée." }, 503);
  const email = await lireEmail(request);
  if (!email) return rep({ ok: false, error: "L’adresse e-mail semble incorrecte." }, 400);
  if ((await equipe(env)).has(email)) return rep({ ok: true, membres: await liste(env), message: "Cette personne fait déjà partie de l’équipe." });

  await (await base(env.DB)).prepare("INSERT OR IGNORE INTO equipe (email, ajoute_par) VALUES (?, ?)").bind(email, moi).run();
  let invite = false;
  if (mailjetPret(env)) {
    const adresse = new URL("/inscriptions", request.url).toString();
    invite = await envoyer(env, [{
      To: [{ Email: email }],
      Subject: "Vous avez accès aux inscriptions Bras Ouverts",
      TextPart: `Bonjour,\n\n${moi} vous a ajouté à l’équipe Bras Ouverts : vous pouvez maintenant consulter les inscriptions au Parcours Alpha.\n\nPour vous connecter, ouvrez ${adresse} et saisissez cette adresse e-mail : un lien de connexion vous sera envoyé.\n`,
    }]);
  }
  return rep({ ok: true, membres: await liste(env), message: invite ? "Ajouté. Une invitation vient de lui être envoyée." : "Ajouté, mais l’invitation n’a pas pu être envoyée : prévenez la personne vous-même." });
}

export async function onRequestDelete({ request, env }) {
  const moi = await membreConnecte(request, env);
  if (!moi) return rep({ ok: false, error: "Connexion requise." }, 401);
  if (!env.DB) return rep({ ok: false, error: "Base non liée." }, 503);
  const email = await lireEmail(request);
  if (!email) return rep({ ok: false, error: "Adresse invalide." }, 400);
  if (email === moi) return rep({ ok: false, error: "Vous ne pouvez pas vous retirer vous-même." }, 400);
  if (adressesFixes(env).has(email)) return rep({ ok: false, error: "Cette adresse est fixe : elle se retire dans les réglages Cloudflare (ADMIN_EMAILS)." }, 400);
  await (await base(env.DB)).prepare("DELETE FROM equipe WHERE email = ?").bind(email).run();
  return rep({ ok: true, membres: await liste(env), message: "Retiré : son accès est coupé." });
}
