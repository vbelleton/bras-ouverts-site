// Formulaire de contact, comme sur le site de l'église : chaque message est d'abord ENREGISTRÉ
// (base D1 « DB », onglet « Messages » de l'espace équipe /inscriptions), puis une notification
// part par e-mail si l'envoi est configuré (Apps Script ou Mailjet, CONTACT_TO). L'e-mail est un
// plus : s'il échoue, le message n'est pas perdu et le visiteur n'a pas d'erreur.
// Garde-fous : piège à robots, délai minimal, message d'au moins 10 caractères,
// 3 envois par quart d'heure et par adresse IP.
import { EMAIL_RE, lire, replier, tableau } from "../../lib/form.js";
import { destinataires, envoyer, mailPret } from "../../lib/mail.js";
import { base } from "../../lib/alpha.js";

const MAX = { firstName: 80, lastName: 80, name: 120, email: 200, phone: 40, subject: 80, message: 5000 };

// Limite en mémoire : au mieux de l'isolat (remise à zéro à chaque démarrage à froid),
// suffisant contre un envoi en rafale. Les entrées périmées sont purgées à chaque passage.
const FENETRE_MS = 15 * 60 * 1000;
const MAX_ENVOIS = 3;
const envois = new Map();
export function limiteAtteinte(cle, now = Date.now()) {
  for (const [k, e] of envois) if (now - e.debut > FENETRE_MS) envois.delete(k);
  const e = envois.get(cle);
  if (!e) { envois.set(cle, { debut: now, n: 1 }); return false; }
  if (e.n >= MAX_ENVOIS) return true;
  e.n++;
  return false;
}
export const viderLimite = () => envois.clear();

async function enregistrer(env, f, prenom, nom) {
  if (!env.DB) return false;
  try {
    const db = await base(env.DB);
    await db.prepare("INSERT INTO messages (first_name, last_name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(prenom, nom, f.email.toLowerCase(), f.phone || null, f.subject || null, f.message).run();
    return true;
  } catch (e) {
    console.error("contact: enregistrement impossible", e?.name || "erreur");
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const reply = replier(request, "contact", "contact");
  const form = await lire(request, MAX);
  if (!form) return reply(false, "Formulaire illisible.");
  // On répond « ok » aux robots pour ne rien leur apprendre.
  if (form.robot) return reply(true);

  const f = Object.fromEntries(Object.keys(MAX).map((k) => [k, form.get(k)]));
  // `name` : ancien champ unique, accepté pour une page restée en cache.
  const prenom = f.firstName || f.name;
  const nomFamille = f.firstName ? f.lastName : "";
  const nom = [prenom, nomFamille].filter(Boolean).join(" ");
  if (!(f.firstName && f.lastName) && !f.name) return reply(false, "Merci d’indiquer votre prénom et votre nom.");
  if (!EMAIL_RE.test(f.email)) return reply(false, "L’adresse e-mail semble incorrecte.");
  if (f.message.length < 10) return reply(false, "Votre message est un peu court : quelques mots de plus, s’il vous plaît.");

  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip && limiteAtteinte(ip)) return reply(false, "Trop d’envois d’affilée. Merci de réessayer dans un quart d’heure.", 429);

  const enregistre = await enregistrer(env, f, prenom, nomFamille);

  const to = destinataires(env.CONTACT_TO);
  const mailConfigure = mailPret(env) && to.length > 0;
  let parti = false;
  if (mailConfigure) {
    const espace = `${new URL(request.url).origin}/inscriptions`;
    const { text, html } = tableau([["Nom", nom], ["E-mail", f.email], ["Téléphone", f.phone], ["Sujet", f.subject]], f.message);
    parti = await envoyer(env, [{
      to,
      replyTo: f.email,
      subject: `Message du site${f.subject ? ` (${f.subject})` : ""} : ${nom}`,
      text: `${text}${enregistre ? `\nTous les messages : ${espace}\n` : ""}`,
      html: `${html}${enregistre ? `<p><a href="${espace}">Voir tous les messages dans l’espace équipe</a></p>` : ""}`,
    }]);
  }

  if (enregistre || parti) return reply(true);
  if (!mailConfigure && !env.DB) {
    console.error("contact: ni base DB ni envoi d’e-mail configurés");
    return reply(false, "Le formulaire n’est pas encore configuré. Merci de réessayer plus tard.", 503);
  }
  return reply(false, "L’envoi a échoué. Merci de réessayer un peu plus tard.", 502);
}
