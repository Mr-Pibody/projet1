# Portfolio d’Elfried ZANNOU

Portfolio en **Node.js, Express, EJS et SQLite (`sql.js`)**. Le site conserve son architecture et ses projets existants, avec une présentation orientée développement logiciel et progression vers l’intelligence artificielle.

## Pré-requis et lancement

- Node.js **20 ou plus récent** et npm.
- Une configuration SMTP privée pour l’envoi des messages de contact.
- Une ou plusieurs clés IA uniquement si Pibody IA et le quiz associé doivent appeler leurs fournisseurs.

```bash
npm ci
cp .env.example .env
npm start
```

Le serveur écoute sur le port indiqué par `PORT` (8100 par défaut). En développement, utiliser `npm run dev`. Pour les tests automatisés :

```bash
npm test
```

Les tests utilisent une base SQLite temporaire, un SMTP local simulé et des contenus réservés au test. Ils ne modifient pas la base de production et n’envoient aucun courriel réel.

## Architecture conservée

- `server.js` : Express, EJS, sessions et montage des routes.
- `routes/` : pages, contact, catalogues, observatoire, sondages, votes, jeux, salons, notes et autres outils.
- `views/` et `views/partials/` : pages et sections du portfolio.
- `public/css/` et `public/js/` : présentation et interactions.
- `data/` : SQLite, traitements d’images, chiffrement et intégration IA.
- `tests/` : tests de fumée des routes, migrations, jeux, formulaires, catalogues et flux de données.

La base reste une **SQLite persistante via `sql.js`**, dans `data/portfolio.sqlite` par défaut. Aucune migration MariaDB n’est nécessaire. La colonne de catégorie du catalogue est ajoutée de manière additive aux bases plus anciennes ; les fiches déjà présentes reçoivent la catégorie neutre « Autres » et restent en place.

## Données existantes et mise à jour

La base réelle et les fichiers téléversés ne sont pas inclus dans le dépôt ni dans l’archive du code. Avant un déploiement, sauvegarder puis conserver le fichier SQLite de production et `public/uploads/`. Ne jamais remplacer une base qui contient déjà des données par une base vide.

Au démarrage, le code enlève uniquement les anciennes fiches d’illustration connues qui correspondent à leurs signatures d’origine : titre, description, prix/stock et absence d’image/numéro (catalogues), ou titre/description/lien/couleur (annonces). Les autres produits et annonces ne sont pas supprimés. Pour les deux anciennes entrées de sondage et de vote, le code et le titre doivent correspondre exactement ; une entrée sans participation est retirée, tandis qu’une entrée avec réponses ou bulletins est conservée et seul son ancien intitulé artificiel est neutralisé. Les réponses, votes et autres données des utilisateurs ne sont pas réinitialisés.

Aucun catalogue, sondage, événement ou annonce n’est alimenté automatiquement. Les catalogues restent vides jusqu’à la publication d’éléments dans l’espace de gestion. Les commandes sont des prises de contact WhatsApp ; aucun paiement en ligne n’est traité par le site. Les visuels de portfolio décrivent des interfaces de projet et ne constituent pas des offres commerciales.

## Fonctionnalités principales

- Présentation du profil, du CV, de la formation, de l’expérience et des projets.
- Accueil narratif en trois chapitres : scène SVG originale synchronisée au scroll natif sur ordinateur, avec GSAP/ScrollTrigger chargés localement et à l’approche du récit. La cascade principale et ses replis conditionnels restent distincts ; l’illustration de construction n’est pas présentée comme une capture produit. Sur mobile, l’affichage privilégie la lecture et les animations complexes ne sont pas chargées ; `prefers-reduced-motion` conserve un parcours utilisable. Aucun CDN, vidéo ou WebGL obligatoire.
- Pibody IA : intégration de services conversationnels tiers ; aucune revendication d’entraînement d’un modèle propriétaire.
- Catalogues boutique, e-commerce et restaurant : gestion administrative, catégories, recherche, tri, détails et contact WhatsApp ; un produit épuisé n’est pas commandable lorsqu’un stock est suivi.
- Observatoire du numérique au Bénin : séries annuelles publiques sur l’usage d’Internet, les abonnements mobiles et le haut débit fixe. Les indicateurs sont nationaux, pas propres à Cotonou.
- Arcade : jeux existants, mots mêlés et mots croisés, avec classement serveur. Les meilleurs scores et parties terminées peuvent aussi être mémorisés localement sur l’appareil ; cette progression locale est distincte du classement partagé.
- Sondages, votes, annonces, salons Socket.IO, outils de notes, PDF et autres pages de projet conservés.
- Formulaire de contact utilisant le système Nodemailer/SMTP existant.

## Données de l’Observatoire

La page demande les séries à l’**API publique de la Banque mondiale**, sans clé API. Les données sont mises en cache en mémoire pendant six heures. L’année affichée est celle de la dernière observation disponible pour chaque indicateur : elle peut varier selon la série. En cas d’indisponibilité, aucune valeur de remplacement n’est inventée ; la page indique l’erreur et garde les liens vers la source.

La page crédite la Banque mondiale et l’Union internationale des télécommunications (ITU), fournit les codes d’indicateur et renvoie aux **conditions d’utilisation des données de la Banque mondiale**. Elle n’implique aucun soutien ou approbation de la Banque mondiale.

## Variables d’environnement et confidentialité

`.env.example` ne contient que des noms de variables et des valeurs de configuration non secrètes. **Ne publiez jamais un vrai `.env`, mot de passe, secret SMTP ou clé API.** Les secrets doivent rester dans l’environnement privé de l’hébergement.

| Variable | Usage |
| --- | --- |
| `PORT` | Port d’écoute ; l’hébergement peut le définir automatiquement. |
| `SESSION_SECRET` | Secret des sessions ; obligatoire en production et à remplacer par une valeur aléatoire privée. |
| `ENCRYPTION_SECRET` | Chiffrement des exports des outils Notes/Bloc-notes. Conserver exactement la valeur déjà utilisée pour relire les anciens exports. |
| `ADMIN_PASSWORD_BOUTIQUE` | Accès à la gestion du catalogue Boutique. |
| `ADMIN_PASSWORD_ECOMMERCE` | Accès à la gestion du catalogue E-commerce. |
| `ADMIN_PASSWORD_RESTAURANT` | Accès à la gestion du catalogue Restaurant. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_TO` | SMTP/Nodemailer du formulaire de contact. |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY` | Clés facultatives pour les fonctions IA. |
| `PORTFOLIO_DB_PATH` | Chemin facultatif réservé aux tests ou au staging. Laisser le chemin de production inchangé sans raison. |
| `SESSION_STORE_PATH` | Chemin facultatif du stockage des sessions. |

Les mots de passe administrateur ne sont pas intégrés au code. Sans mot de passe configuré, l’accès de gestion reste refusé. La progression des jeux stockée dans le navigateur peut être effacée depuis le panneau Arcade ; elle ne remplace ni ne modifie les scores serveur.

## Déploiement

1. Sauvegarder les fichiers actuels, en particulier `data/portfolio.sqlite` et `public/uploads/`.
2. Déployer le code avec la version LTS de Node disponible sur l’hébergement et installer les dépendances :
   ```bash
   npm ci --omit=dev
   ```
3. Démarrer `server.js` depuis le dossier du projet, avec `NODE_ENV=production` et les variables privées configurées dans l’hébergement.
4. Conserver les dossiers `data/` et `public/uploads/` accessibles en écriture par Node. Garder les données existantes pendant la mise à jour.
5. Après redémarrage, contrôler le portfolio, les catalogues, le contact SMTP, les pages IA (si leurs clés sont configurées), l’observatoire et les jeux.

Générer un secret de session sur une machine de confiance, par exemple avec `openssl rand -hex 32`, puis le renseigner uniquement dans l’environnement privé de l’hébergement.

## Vérifications

`npm test` vérifie notamment les routes existantes, les bundles GSAP locaux de l’accueil, l’interface et les scripts des jeux, la génération des grilles, l’ajout de catégorie à une ancienne base, la conservation d’une fiche héritée, l’absence de contenu automatiquement publié, la création/réponse d’un sondage, la collecte d’un vote, l’accès administrateur du catalogue et l’utilisation du SMTP simulé.

Les tests ne valident pas l’accès à des clés privées IA ni la livraison d’un courriel dans une boîte externe. L’API de la Banque mondiale est appelée par la page de l’Observatoire dans le navigateur via le serveur ; elle peut être indisponible temporairement sans empêcher le reste du site de fonctionner.

## Documentation complémentaire

- `DOCUMENTATION_TECHNIQUE.md` décrit l’architecture, le récit interactif, les intégrations IA et données, ainsi que les limites vérifiées.
- `GUIDE_UTILISATEUR.md` explique comment parcourir le portfolio, essayer Pibody IA et comprendre les indicateurs de l’Observatoire.
