# CLAUDE.md

Site de l’association Bras Ouverts, en deux côtés : la P’tite Boutik Solidaire (son propre dépôt `vbelleton/petite_boutik_solidaire`, servi sous `/boutik/` du même domaine par `functions/boutik/[[path]].js` : ne jamais recopier son code ici) et les actions non cultuelles (maraudes, bénévolat, dons), plus un agenda. Le Parcours Alpha (cultuel) reste dans le code mais masqué. Voir `README.md` pour l’organisation et la mise en ligne.

- Tout en français : textes, commits, README, messages d’erreur.
- **Ne jamais reprendre l’identité, les textes ou les visuels de Cieux Ouverts.** Identité propre : bleu marine + turquoise du logo (public/logo.png), Fraunces + Nunito Sans.
- Base calquée sur `vbelleton/kapitou-site` : pas de framework, pas de dépendance au build. Ne pas ajouter de `wrangler.toml` (il écraserait les réglages Cloudflare).
- Données des inscrits = données personnelles : jamais dans le dépôt, les logs (`console.error` sans nom ni e-mail) ni les messages.
- Tout `fetch` côté serveur a un `signal: AbortSignal.timeout(...)` (sinon un amont muet bloque la requête sans erreur).
- Le contenu (`content/site.json`) est modifié par des bénévoles via Pages CMS : tout nouveau champ doit être déclaré dans `.pages.yml`, et le build doit tolérer un champ vide ou absent.
- `npm test` avant chaque commit.
- Accès à la liste des inscrits : connexion Google (`lib/google.js`, aucun e-mail à envoyer) + équipe gérée dans l'onglet « Équipe » (table D1 `equipe`) et `ADMIN_EMAILS` (`lib/auth.js`). Toute nouvelle route qui renvoie des inscrits ou modifie l'équipe doit passer par `membreConnecte()`, et les écritures n'acceptent que du JSON. Les données des inscrits et les messages de contact (`functions/api/messages.js`, table `messages`) s'affichent avec `textContent`, jamais en HTML ; les logs ne contiennent ni nom ni e-mail.
- Le site ne doit pas dépendre de Mailjet : les e-mails passent par Google Apps Script (`lib/mail.js`, `docs/envoi-mail.gs`) et restent facultatifs. Aucun e-mail n'est envoyé aux inscrits tant que `ALPHA_TO` / `ALPHA_CONFIRMATION` ne sont pas définis (décision de l'association).
- **Agenda** : pas de base ici. Les dates se saisissent dans l'admin du site de l'église (écran des événements, « Publier sur : site Bras Ouverts »), stockées par le Worker `eglise-app` avec `source = 'bras-ouverts'`. `src/agenda.js` les lit dans le navigateur ; `src/agenda-moteur.js` est une **copie** de `utils/churchEvents.js` d'eglise-cieux-ouverts : corriger là-bas puis recopier. Distinguer « agenda vide » de « pas pu charger ».
- **Contact** : comme sur Cieux Ouverts, le message est d'abord enregistré (D1), l'e-mail n'est qu'une notification facultative : un e-mail qui échoue ne perd pas le message et ne renvoie pas d'erreur au visiteur.
- **Service worker** (`src/sw.js`) : jamais de cache pour `/api/`, `/inscriptions`, `/boutik/` (la boutique a le sien) ni les autres sites ; changer `VERSION` à chaque changement de stratégie.
