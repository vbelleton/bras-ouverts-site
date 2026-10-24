// Envoi des e-mails du site Bras Ouverts depuis le Gmail de l'association (Google Apps Script).
// Mise en place : voir README.md, section « E-mails du formulaire de contact ».
// Propriété de script à créer : SECRET (une longue phrase au hasard, la même que APPS_SCRIPT_SECRET dans Cloudflare).
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
    if (!secret || data.secret !== secret) return reponse({ ok: false, erreur: "secret" });
    var messages = data.messages || [];
    if (messages.length > 5) return reponse({ ok: false, erreur: "trop de messages" });
    messages.forEach(function (m) {
      var options = { to: m.to.join(","), subject: m.subject, body: m.text, name: "Bras Ouverts" };
      if (m.replyTo) options.replyTo = m.replyTo;
      if (m.html) options.htmlBody = m.html;
      MailApp.sendEmail(options);
    });
    return reponse({ ok: true });
  } catch (err) {
    return reponse({ ok: false, erreur: String(err) });
  }
}

function reponse(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}
