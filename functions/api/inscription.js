// Inscription au Parcours Alpha : enregistrée dans D1. Si Mailjet est configuré (facultatif), e-mail à l'équipe
// et confirmation à l'inscrit.
// Liaison D1 « DB » obligatoire, variables Mailjet facultatives (voir README).
// ALPHA_TO (facultatif) : destinataires des inscriptions ; à défaut, CONTACT_TO.
import { EMAIL_RE, lire, replier, tableau } from "../../lib/form.js";
import { destinataires, envoyer, mailjetPret } from "../../lib/mailjet.js";
import { base, placesRestantes, sessions } from "../../lib/alpha.js";

const MAX = { firstName: 80, lastName: 80, email: 200, phone: 40, address: 300, session: 80, message: 2000, consent: 10 };

export async function onRequestPost({ request, env }) {
  const reply = replier(request, "alpha", "inscription");
  const form = await lire(request, MAX);
  if (!form) return reply(false, "Formulaire illisible.");
  if (form.robot) return reply(true);

  const f = Object.fromEntries(Object.keys(MAX).map((k) => [k, form.get(k)]));
  f.email = f.email.toLowerCase();
  if (!f.firstName || !f.lastName) return reply(false, "Merci d’indiquer votre prénom et votre nom.");
  if (!EMAIL_RE.test(f.email)) return reply(false, "L’adresse e-mail semble incorrecte.");
  if (f.phone.replace(/\D/g, "").length < 6) return reply(false, "Merci d’indiquer un numéro de téléphone.");
  if (f.consent !== "oui") return reply(false, "Merci de cocher la case d’accord pour l’utilisation de vos coordonnées.");
  const session = sessions().find((s) => s.id === f.session && s.open !== false);
  if (!session) return reply(false, "Ce parcours n’est pas ouvert aux inscriptions.");

  if (!env.DB) {
    console.error("inscription: liaison D1 « DB » manquante");
    return reply(false, "Les inscriptions ne sont pas encore ouvertes en ligne. Merci de réessayer plus tard.", 503);
  }

  const restantes = (await placesRestantes(env.DB))[session.id];
  if (restantes === 0) return reply(false, "Désolé, ce parcours est complet.", 409);

  const { meta } = await (await base(env.DB)).prepare(
    "INSERT OR IGNORE INTO inscriptions (session, first_name, last_name, email, phone, address, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(session.id, f.firstName, f.lastName, f.email, f.phone, f.address || null, f.message || null).run();
  // Déjà inscrit avec cette adresse : on le dit simplement, sans renvoyer d'e-mails.
  if (!meta.changes) return reply(true, null, 200, "Vous êtes déjà inscrit à ce parcours avec cette adresse. À bientôt !");

  // L'inscription est enregistrée : un échec d'e-mail est journalisé mais ne la remet pas en cause.
  if (mailjetPret(env)) {
    const nom = `${f.firstName} ${f.lastName}`;
    const equipe = destinataires(env.ALPHA_TO || env.CONTACT_TO);
    const infos = tableau([["Parcours", session.label], ["Nom", nom], ["E-mail", f.email], ["Téléphone", f.phone], ["Adresse", f.address]], f.message);
    const merci = `Bonjour ${f.firstName},\n\nMerci pour votre inscription au Parcours Alpha (${session.label}). Nous avons hâte de vous accueillir !\n\nNous reviendrons vers vous avec les informations pratiques avant la première soirée. Pour toute question, répondez simplement à cet e-mail.\n\nL’équipe Bras Ouverts\n`;
    await envoyer(env, [
      ...(equipe.length ? [{
        To: equipe.map((Email) => ({ Email })),
        ReplyTo: { Email: f.email, Name: nom },
        Subject: `Inscription Alpha : ${nom}`,
        TextPart: infos.text,
        HTMLPart: infos.html,
      }] : []),
      {
        To: [{ Email: f.email, Name: nom }],
        ...(equipe.length ? { ReplyTo: { Email: equipe[0] } } : {}),
        Subject: "Votre inscription au Parcours Alpha",
        TextPart: merci,
      },
    ]);
  }
  return reply(true);
}
