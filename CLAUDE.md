# CLAUDE.md

Site de l’association Bras Ouverts (maraudes, la petite boutik, Parcours Alpha avec inscriptions). Voir `README.md` pour l’organisation et la mise en ligne.

- Tout en français : textes, commits, README, messages d’erreur.
- **Ne jamais reprendre l’identité, les textes ou les visuels de Cieux Ouverts.** Identité propre : bleu marine + turquoise du logo (public/logo.png), Fraunces + Nunito Sans.
- Base calquée sur `vbelleton/kapitou-site` : pas de framework, pas de dépendance au build. Ne pas ajouter de `wrangler.toml` (il écraserait les réglages Cloudflare).
- Données des inscrits = données personnelles : jamais dans le dépôt, les logs (`console.error` sans nom ni e-mail) ni les messages.
- Tout `fetch` côté serveur a un `signal: AbortSignal.timeout(...)` (sinon un amont muet bloque la requête sans erreur).
- Le contenu (`content/site.json`) est modifié par des bénévoles via Pages CMS : tout nouveau champ doit être déclaré dans `.pages.yml`, et le build doit tolérer un champ vide ou absent.
- `npm test` avant chaque commit.
- Accès à la liste des inscrits : lien de connexion par e-mail + liste `team.emails` / `ADMIN_EMAILS` (`lib/auth.js`). Toute nouvelle route qui renvoie des inscrits doit passer par `membreConnecte()`. Les données des inscrits s'affichent avec `textContent`, jamais en HTML.
