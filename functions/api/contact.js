// Formulaire de contact : envoie le message par e-mail (Apps Script ou Mailjet) à CONTACT_TO, rien n'est conservé.
// Mêmes garde-fous que le formulaire du site de l'église : piège à robots, délai minimal,
// message d'au moins 10 caractères, 3 envois par quart d'heure et par adresse IP.
// Variables : voir lib/mail.js, plus CONTACT_TO (destinataires séparés par des virgules).
import { EMAIL_RE, lire, replier, tableau } from "../../lib/form.js";
import { destinataires, envoyer, mailPret } from "../../lib/mail.js";

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

export async function onRequestPost({ request, env }) {
  const reply = replier(request, "contact", "contact");
  const form = await lire(request, MAX);
  if (!form) return reply(false, "Formulaire illisible.");
  // On répond « ok » aux robots pour ne rien leur apprendre.
  if (form.robot) return reply(true);

  const f = Object.fromEntries(Object.keys(MAX).map((k) => [k, form.get(k)]));
  // `name` : ancien champ unique, accepté pour une page restée en cache.
  const nom = [f.firstName, f.lastName].filter(Boolean).join(" ") || f.name;
  if (!(f.firstName && f.lastName) && !f.name) return reply(false, "Merci d’indiquer votre prénom et votre nom.");
  if (!EMAIL_RE.test(f.email)) return reply(false, "L’adresse e-mail semble incorrecte.");
  if (f.message.length < 10) return reply(false, "Votre message est un peu court : quelques mots de plus, s’il vous plaît.");

  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip && limiteAtteinte(ip)) return reply(false, "Trop d’envois d’affilée. Merci de réessayer dans un quart d’heure.", 429);

  const to = destinataires(env.CONTACT_TO);
  if (!mailPret(env) || !to.length) {
    console.error("contact: configuration d’envoi ou CONTACT_TO manquantes");
    return reply(false, "Le formulaire n’est pas encore configuré. Merci de réessayer plus tard.", 503);
  }

  const { text, html } = tableau([["Nom", nom], ["E-mail", f.email], ["Téléphone", f.phone], ["Sujet", f.subject]], f.message);
  const sent = await envoyer(env, [{
    to,
    replyTo: f.email,
    subject: `Message du site${f.subject ? ` (${f.subject})` : ""} : ${nom}`,
    text,
    html,
  }]);
  return sent ? reply(true) : reply(false, "L’envoi a échoué. Merci de réessayer un peu plus tard.", 502);
}
