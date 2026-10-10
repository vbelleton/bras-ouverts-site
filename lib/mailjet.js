// Envoi d'e-mails par l'API HTTP de Mailjet (le SMTP est impossible sur le runtime Workers).
//
// Variables Cloudflare Pages : MAILJET_API_KEY, MAILJET_API_SECRET, CONTACT_FROM (adresse validée dans Mailjet).
// MAILJET_API_URL (facultatif) : autre URL d'API, pour tester en local avec un faux serveur.

export const mailjetPret = (env) => Boolean(env.MAILJET_API_KEY && env.MAILJET_API_SECRET && env.CONTACT_FROM);

export const destinataires = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

// messages : [{ To: [{Email, Name?}], ReplyTo?, Subject, TextPart, HTMLPart }]. Renvoie true si tout est parti.
export async function envoyer(env, messages) {
  const res = await fetch(env.MAILJET_API_URL || "https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_API_SECRET}`),
    },
    body: JSON.stringify({ Messages: messages.map((m) => ({ From: { Email: env.CONTACT_FROM, Name: "Bras Ouverts" }, ...m })) }),
    // Sans délai, un Mailjet muet suspendrait la requête jusqu'à ce que la plateforme la coupe.
    signal: AbortSignal.timeout(10000),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }));

  // Mailjet peut répondre 200 tout en refusant un message : le verdict est dans Messages[].Status.
  const out = await res.json().catch(() => ({}));
  const sent = res.ok && Array.isArray(out.Messages) && out.Messages.every((m) => m.Status === "success");
  if (!sent) console.error("mailjet: échec", res.status, JSON.stringify(out).slice(0, 500));
  return sent;
}
