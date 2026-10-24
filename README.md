# Site Bras Ouverts

Site de l’association Bras Ouverts : les maraudes, la petite boutik et le Parcours Alpha, avec inscription en ligne. Site statique généré à partir d’un seul fichier de contenu, sur le même modèle que kapitou-site.

## Organisation

| Fichier | Rôle |
|---|---|
| `content/site.json` | **Tout le contenu** : textes, blocs et leur ordre, parcours Alpha ouverts, mentions légales |
| `build.mjs` | Génère `dist/index.html` à partir du contenu (Node, sans dépendance) |
| `src/style.css`, `src/forms.js`, `src/theme.js` | Styles, envoi des formulaires, thème clair/sombre |
| `public/` | Logo (`logo.png`, `favicon.png`), photos ajoutées depuis l’administration (`uploads/`) |
| `functions/api/contact.js` | Formulaire de contact, envoyé par e-mail (Gmail via Apps Script), rien n’est conservé |
| `functions/api/inscription.js` | Inscription Alpha : enregistrée dans D1 (aucun e-mail par défaut) |
| `functions/api/places.js` | Places restantes par parcours (le formulaire grise les parcours complets) |
| `functions/api/auth/` | Connexion de l’équipe avec Google, session par cookie signé |
| `functions/api/equipe.js` | Liste, ajout et retrait des membres de l’équipe |
| `functions/api/inscriptions.js`, `src/inscriptions.js` | Page `/inscriptions` : liste des inscrits, réservée à l’équipe |
| `functions/api/export-inscriptions.js` | Liste des inscrits en CSV, réservée à l’équipe |
| `lib/` | Code partagé par les fonctions (envoi d’e-mails, formulaires, table des inscriptions) |
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
| `SESSION_SECRET` | longue chaîne aléatoire (40 caractères ou plus), type « Secret » : signe les sessions de l’équipe |
| `GOOGLE_CLIENT_ID` | identifiant client Google (voir ci-dessous) : connexion de l’équipe avec un compte Google |
| `ADMIN_EMAILS` | ton adresse Google (et celles des autres responsables, séparées par des virgules) : accès de départ, ces adresses ne se retirent pas depuis le site |
| `EXPORT_PASSWORD` | (facultatif, clé de secours) mot de passe pour télécharger l’export sans se connecter |
| `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET` | envoi des e-mails du formulaire de contact depuis le Gmail de l’association (voir ci-dessous) |
| `CONTACT_TO` | destinataires du formulaire de contact (séparés par des virgules) |
| `ALPHA_TO` | (facultatif, désactivé) adresse(s) alertées à chaque inscription |
| `ALPHA_CONFIRMATION` | (facultatif, désactivé) `oui` pour envoyer une confirmation à l’inscrit |
| `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `CONTACT_FROM` | (facultatif, à la place d’Apps Script) envoi par Mailjet |

Les inscriptions n’envoient aucun e-mail : elles sont enregistrées dans la base et consultées sur `/inscriptions`.

### E-mails du formulaire de contact (une seule fois)

Gratuit, sans Mailjet : un petit script Google envoie les messages depuis le Gmail de l’association (environ 100 e-mails par jour au maximum, très largement suffisant ici).

1. Connecté au Gmail de l’association, ouvrir https://script.google.com → **Nouveau projet**, coller le contenu de `docs/envoi-mail.gs`.
2. Paramètres du projet (roue dentée) → **Propriétés du script** → ajouter `SECRET` avec une longue phrase au hasard.
3. **Déployer** → Nouveau déploiement → type « Application Web » → *Exécuter en tant que* : moi ; *Qui a accès* : tout le monde. Accepter les autorisations (envoi d’e-mails). Copier l’URL qui se termine par `/exec`.
4. Dans Cloudflare (Production) : `APPS_SCRIPT_URL` = cette URL, `APPS_SCRIPT_SECRET` = la même phrase que `SECRET`, `CONTACT_TO` = l’adresse qui reçoit les messages. Redéployer.

Les messages arrivent avec l’adresse du visiteur en « Répondre à » : il suffit de répondre. Si le script est modifié plus tard, refaire **Déployer → Gérer les déploiements → modifier → nouvelle version**.


### Connexion Google : obtenir `GOOGLE_CLIENT_ID` (une seule fois)

1. https://console.cloud.google.com → créer un projet (par exemple « Bras Ouverts »).
2. APIs & Services → **OAuth consent screen** : type « External », nom de l’application « Bras Ouverts », ton adresse comme contact. Aucune permission particulière à ajouter. Puis **Publish app** (statut « In production »), sinon seules les adresses listées comme « Test users » peuvent se connecter.
3. APIs & Services → Credentials → Create credentials → **OAuth client ID** → type « Web application » → *Authorized JavaScript origins* : `https://bras-ouverts.pages.dev` (et ton domaine si tu en as un). Pas d’URI de redirection à renseigner.
4. Copier l’identifiant client (se termine par `.apps.googleusercontent.com`) dans la variable `GOOGLE_CLIENT_ID`, redéployer.

### Consulter les inscrits

Ouvrir `https://<site>/inscriptions` et cliquer sur « Se connecter avec Google » : seules les adresses de l’équipe sont acceptées, la session dure 12 heures. La page affiche la liste, les places restantes par parcours et un bouton de téléchargement Excel.

Qui est autorisé : les adresses de `ADMIN_EMAILS` (fixes) et celles ajoutées depuis l’onglet **Équipe** de la page. Ajouter une adresse lui donne accès tout de suite (la personne se connecte avec le compte Google de cette adresse ; il faut la prévenir), « Retirer » coupe son accès immédiatement, même si elle est connectée. Tout membre peut ajouter ou retirer les autres (sauf les adresses fixes et soi-même) : n’ajouter que des personnes de confiance. Cette liste est indépendante de celle de Pages CMS, qui ne donne accès qu’aux textes et photos du site.

Les inscriptions sont des données personnelles : les supprimer après le parcours (durée annoncée dans les mentions légales). Sur la page, « Supprimer » retire une inscription (ce qui libère la place) et, en filtrant sur un parcours, « Supprimer les N inscrits de ce parcours » les retire toutes, par exemple pour effacer des tests. La suppression est définitive.

## Travailler en local

```sh
npm test        # build + tests des fonctions (fausse base, faux Apps Script)
npm run dev     # build + serveur local sur http://localhost:8788 avec une base D1 locale
```

Pour tester l’envoi réel en local, créer un fichier `.dev.vars` (ignoré par git) avec les variables ci-dessus.
