// Formulaire de contact : envoie le message par e-mail (Mailjet) à CONTACT_TO, rien n'est conservé.
// Variables : voir lib/mailjet.js, plus CONTACT_TO (destinataires séparés par des virgules).
import { EMAIL_RE, lire, replier, tableau } from "../../lib/form.js";
import { destinataires, envoyer, mailjetPret } from "../../lib/mailjet.js";

const MAX = { name: 120, email: 200, phone: 40, subject: 80, message: 5000 };

export async function onRequestPost({ request, env }) {
  const reply = replier(request, "contact", "contact");
  const form = await lire(request, MAX);
  if (!form) return reply(false, "Formulaire illisible.");
  // On répond « ok » aux robots pour ne rien leur apprendre.
  if (form.robot) return reply(true);

  const f = Object.fromEntries(Object.keys(MAX).map((k) => [k, form.get(k)]));
  if (!f.name || !f.message) return reply(false, "Merci d’indiquer votre nom et votre message.");
  if (!EMAIL_RE.test(f.email)) return reply(false, "L’adresse e-mail semble incorrecte.");

  const to = destinataires(env.CONTACT_TO);
  if (!mailjetPret(env) || !to.length) {
    console.error("contact: variables Mailjet ou CONTACT_TO manquantes");
    return reply(false, "Le formulaire n’est pas encore configuré. Merci de réessayer plus tard.", 503);
  }

  const { text, html } = tableau([["Nom", f.name], ["E-mail", f.email], ["Téléphone", f.phone], ["Sujet", f.subject]], f.message);
  const sent = await envoyer(env, [{
    To: to.map((Email) => ({ Email })),
    ReplyTo: { Email: f.email, Name: f.name },
    Subject: `Message du site${f.subject ? ` (${f.subject})` : ""} : ${f.name}`,
    TextPart: text,
    HTMLPart: html,
  }]);
  return sent ? reply(true) : reply(false, "L’envoi a échoué. Merci de réessayer un peu plus tard.", 502);
}
