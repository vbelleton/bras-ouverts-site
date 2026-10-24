// Inscription au Parcours Alpha : enregistrée dans D1. Aucun e-mail par défaut ; facultatifs :
// ALPHA_TO (alerte à l'équipe) et ALPHA_CONFIRMATION="oui" (confirmation à l'inscrit), si l'envoi est configuré.
// Liaison D1 « DB » obligatoire.
import { EMAIL_RE, lire, replier, tableau } from "../../lib/form.js";
import { destinataires, envoyer, mailPret } from "../../lib/mail.js";
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
  const equipe = destinataires(env.ALPHA_TO);
  const confirmer = env.ALPHA_CONFIRMATION === "oui";
  if (mailPret(env) && (equipe.length || confirmer)) {
    const nom = `${f.firstName} ${f.lastName}`;
    const infos = tableau([["Parcours", session.label], ["Nom", nom], ["E-mail", f.email], ["Téléphone", f.phone], ["Adresse", f.address]], f.message);
    const merci = `Bonjour ${f.firstName},\n\nMerci pour votre inscription au Parcours Alpha (${session.label}). Nous avons hâte de vous accueillir !\n\nNous reviendrons vers vous avec les informations pratiques avant la première soirée.\n\nL’équipe Bras Ouverts\n`;
    await envoyer(env, [
      ...(equipe.length ? [{ to: equipe, replyTo: f.email, subject: `Inscription Alpha : ${nom}`, text: infos.text, html: infos.html }] : []),
      ...(confirmer ? [{ to: [f.email], ...(equipe.length ? { replyTo: equipe[0] } : {}), subject: "Votre inscription au Parcours Alpha", text: merci }] : []),
    ]);
  }
  return reply(true);
}
