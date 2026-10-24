// Envoi d'e-mails, facultatif. Deux moyens, au choix :
//  - Google Apps Script (gratuit, depuis le Gmail de l'association) : APPS_SCRIPT_URL + APPS_SCRIPT_SECRET (voir docs/envoi-mail.gs) ;
//  - Mailjet (si on y tient) : MAILJET_API_KEY, MAILJET_API_SECRET, CONTACT_FROM.
// Un message : { to: ["a@b.fr"], replyTo?: "c@d.fr", subject, text, html? }.
export const appsScriptPret = (env) => Boolean(env.APPS_SCRIPT_URL && env.APPS_SCRIPT_SECRET);
export const mailjetPret = (env) => Boolean(env.MAILJET_API_KEY && env.MAILJET_API_SECRET && env.CONTACT_FROM);
export const mailPret = (env) => appsScriptPret(env) || mailjetPret(env);
export const destinataires = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

// Renvoie true si tout est parti. Le contenu des messages n'est jamais journalisé.
export async function envoyer(env, messages) {
  try {
    if (appsScriptPret(env)) {
      // text/plain évite la requête de pré-vérification CORS, inutile côté serveur mais acceptée par Apps Script.
      const res = await fetch(env.APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: env.APPS_SCRIPT_SECRET, messages }),
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        console.error("mail: Apps Script a refusé l'envoi", res.status, data?.erreur || "");
        return false;
      }
      return true;
    }
    if (mailjetPret(env)) {
      const res = await fetch(env.MAILJET_API_URL || "https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_API_SECRET}`) },
        body: JSON.stringify({
          Messages: messages.map((m) => ({
            From: { Email: env.CONTACT_FROM, Name: "Bras Ouverts" },
            To: m.to.map((Email) => ({ Email })),
            ...(m.replyTo ? { ReplyTo: { Email: m.replyTo } } : {}),
            Subject: m.subject,
            TextPart: m.text,
            ...(m.html ? { HTMLPart: m.html } : {}),
          })),
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.Messages?.every((x) => x.Status === "success")) {
        console.error("mail: Mailjet a refusé l'envoi", res.status);
        return false;
      }
      return true;
    }
    return false;
  } catch (e) {
    console.error("mail: envoi impossible", e?.name || "erreur");
    return false;
  }
}
