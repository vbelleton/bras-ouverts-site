# Site Bras Ouverts

Site de l’association Bras Ouverts : les maraudes, la petite boutik et le Parcours Alpha, avec inscription en ligne. Site statique généré à partir d’un seul fichier de contenu, sur le même modèle que kapitou-site.

## Organisation

| Fichier | Rôle |
|---|---|
| `content/site.json` | **Tout le contenu** : textes, blocs et leur ordre, parcours Alpha ouverts, mentions légales |
| `build.mjs` | Génère `dist/index.html` à partir du contenu (Node, sans dépendance) |
| `src/style.css`, `src/forms.js`, `src/theme.js` | Styles, envoi des formulaires, thème clair/sombre |
| `public/` | Logo (`logo.png`, `favicon.png`), photos ajoutées depuis l’administration (`uploads/`) |
| `functions/api/contact.js` | Formulaire de contact, envoyé par e-mail (Mailjet), rien n’est conservé |
| `functions/api/inscription.js` | Inscription Alpha : enregistrée dans D1, e-mail à l’équipe et confirmation à l’inscrit |
| `functions/api/places.js` | Places restantes par parcours (le formulaire grise les parcours complets) |
| `functions/api/export-inscriptions.js` | Liste des inscrits en CSV, protégée par mot de passe |
| `lib/` | Code partagé par les fonctions (Mailjet, formulaires, table des inscriptions) |
| `.pages.yml` | Interface d’administration (Pages CMS) |

Les maraudes et la petite boutik sont prêtes mais masquées : dans l’administration, bloc « Nos actions », cocher « Afficher ce bloc » pour les montrer.

Un texte entre crochets dans le contenu, comme `[à compléter]`, s’affiche en gris italique : c’est ce qu’il reste à remplir avant la mise en ligne.

## Modifier le contenu (administration)

Comme pour Kap’Itou : https://app.pagescms.org, connexion avec le compte GitHub `vbelleton`, installer l’application Pages CMS sur ce dépôt, puis ajouter les administrateurs dans **Collaborators** (connexion par e-mail, pas besoin de compte GitHub). Raccourci : `/admin` sur le site.

Pour ouvrir un nouveau Parcours Alpha : bloc « Parcours Alpha et inscription » → « Parcours proposés à l’inscription » → ajouter un parcours avec un identifiant neuf (ex. `alpha-2027-printemps`), son nom et son nombre de places. Décocher « Inscriptions ouvertes » sur l’ancien. Ne pas changer l’identifiant d’un parcours dont les inscriptions ont commencé.

## Hébergement (Cloudflare Pages)

Workers & Pages → Create → Pages → Connect to Git → ce dépôt, puis :

- Nom du projet Pages : `bras-ouverts` (il donne l’adresse `bras-ouverts.pages.dev` et ne peut plus être changé ensuite)
- Build command : `npm run build`
- Build output directory : `dist`
- Branche de production : `main`

Ne pas ajouter de `wrangler.toml` : il remplacerait les réglages du tableau de bord.

### Base des inscriptions (D1)

1. Workers & Pages → D1 → Create database → nom `bras-ouverts`.
2. Dans le projet Pages : Settings → Bindings → Add → D1 database, nom de la variable **`DB`**, base `bras-ouverts`. Faire de même pour l’environnement Preview si besoin.
3. Redéployer. La table `inscriptions` se crée toute seule à la première inscription.

Tant que la base n’est pas liée, le formulaire affiche « les inscriptions ne sont pas encore ouvertes en ligne ».

### Variables (Settings → Variables and secrets), puis redéployer

| Variable | Valeur |
|---|---|
| `MAILJET_API_KEY` | clé API Mailjet |
| `MAILJET_API_SECRET` | clé secrète Mailjet |
| `CONTACT_FROM` | adresse expéditrice **validée** dans Mailjet |
| `CONTACT_TO` | adresse(s) qui reçoivent les messages, séparées par des virgules |
| `ALPHA_TO` | (facultatif) adresse(s) qui reçoivent les inscriptions ; à défaut `CONTACT_TO` |
| `EXPORT_PASSWORD` | mot de passe de l’export des inscrits (type « Secret ») |

### Récupérer la liste des inscrits

Ouvrir `https://<site>/api/export-inscriptions` : le navigateur demande un identifiant (n’importe lequel) et le mot de passe `EXPORT_PASSWORD`. Le fichier CSV s’ouvre directement dans Excel. `?session=alpha-1` pour un seul parcours.

Les inscriptions sont des données personnelles : les supprimer après le parcours (durée annoncée dans les mentions légales), par exemple dans D1 → Console : `DELETE FROM inscriptions WHERE session = 'alpha-1';`

## Travailler en local

```sh
npm test        # build + tests des fonctions (fausse base, faux Mailjet)
npm run dev     # build + serveur local sur http://localhost:8788 avec une base D1 locale
```

Pour tester l’envoi réel en local, créer un fichier `.dev.vars` (ignoré par git) avec les variables ci-dessus.
