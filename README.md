# PharmaPulse — API

API REST de **PharmaPulse**, plateforme SaaS de gestion de pharmacies : stock, lots, ventes, réceptions, inventaires, commandes en ligne et abonnements, avec un panel **Super Admin** pour gérer toute la plateforme.

> Le front (Vue 3) est dans un dépôt séparé : [`pharmapulse`](https://github.com/Mangassouba/pharmapulse).

**Stack :** Node.js 24 · Express 4 · Drizzle ORM · PostgreSQL · Nodemailer · JWT

---

## Sommaire

1. [Démarrage rapide (en local)](#1-démarrage-rapide-en-local)
2. [Variables d'environnement](#2-variables-denvironnement)
3. [Scripts npm](#3-scripts-npm)
4. [Structure du projet](#4-structure-du-projet)
5. [Fonctionnement](#5-fonctionnement)
6. [Base de données et migrations](#6-base-de-données-et-migrations)
7. [Déploiement (Render + Supabase)](#7-déploiement-render--supabase)
8. [Dépannage](#8-dépannage)

---

## 1. Démarrage rapide (en local)

**Prérequis :** Node.js 24 et PostgreSQL 14 ou plus.

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier .env (voir section 2) avec au minimum :
#    DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, PORT=3001

# 3. Créer les tables
npm run db:migrate

# 4. (Optionnel) Charger les données de démo
npm run db:seed

# 5. Lancer l'API (redémarre à chaque modification)
npm run dev
```

L'API répond sur `http://localhost:3001/api`. Pour vérifier : `http://localhost:3001/api/health` doit renvoyer `"status": "healthy"`.

### Comptes de démo (après `npm run db:seed`)

| Rôle | Email | Mot de passe |
|---|---|---|
| Super Admin | `superadmin@pharmapulse.com` | `SuperAdmin2024!` |
| Admin — Pharmacie Chifa (active) | `admin@pharmaciechifa.mr` | `Admin1234!` |
| Manager / Caissier / Stock — Chifa | `manager@…`, `caissier@…`, `stock@pharmaciechifa.mr` | `Manager1234!`, `Caissier1234!`, `Stock1234!` |
| Admin — Pharmacie Ennour (en essai) | `admin@pharmacieennour.mr` | `Admin1234!` |
| Admin — Pharmacie Essalam (suspendue) | `admin@pharmacieessalam.mr` | `Admin1234!` |

> ⚠️ Ne lancez **jamais** le seed sur la base de production : ces mots de passe sont publics.

---

## 2. Variables d'environnement

À mettre dans `.env` en local, et dans les **Environment Variables** de Render en production. Le fichier `.env` n'est jamais commité.

### Essentielles

| Variable | Exemple | Rôle |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/pharmapulse` | Connexion PostgreSQL |
| `DATABASE_SSL` | `true` | Connexion chiffrée, **obligatoire pour Supabase**. À laisser vide en local. |
| `JWT_SECRET` | *(longue valeur aléatoire)* | Signe les sessions et les liens de réinitialisation |
| `JWT_REFRESH_SECRET` | *(autre valeur aléatoire)* | Signe les jetons de rafraîchissement |
| `PORT` | `3001` | Port de l'API (fourni automatiquement par Render) |
| `NODE_ENV` | `development` / `production` | En `development`, les requêtes SQL sont affichées |
| `FRONTEND_URL` | `http://localhost:5173` | Adresse du front, utilisée dans les liens des emails |
| `CORS_ORIGINS` | `http://localhost:5173` | Origines autorisées à appeler l'API (séparées par des virgules) |

Pour générer un secret :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Emails (SMTP)

| Variable | Exemple | Rôle |
|---|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` | Serveur d'envoi |
| `SMTP_PORT` | `587` | `587` (STARTTLS) ou `465` (SSL) |
| `SMTP_SECURE` | `false` | `true` uniquement avec le port 465 |
| `SMTP_USER` / `SMTP_PASS` | | Identifiants du serveur SMTP |
| `MAIL_FROM` | `no-reply@mondomaine.com` | Adresse d'expédition. Le **nom** affiché est le nom du site (réglable par le Super Admin). |

Sans SMTP configuré, l'application fonctionne mais aucun email ne part : les erreurs sont écrites dans `logs/error.log`.

### Optionnelles

| Variable | Défaut | Rôle |
|---|---|---|
| `TRUST_PROXY` | *(vide)* | `1` derrière un proxy (Render, Nginx) pour lire la vraie IP des visiteurs |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Fenêtre de la limite de requêtes |
| `RATE_LIMIT_MAX` | `300` | Requêtes autorisées par fenêtre, **par utilisateur connecté** (par IP pour les visiteurs) |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `7d` / `30d` | Durée des sessions |
| `JWT_RESET_EXPIRES_IN` | `1h` | Validité des liens « mot de passe oublié » |
| `LOG_LEVEL` | `info` | Niveau des logs |

---

## 3. Scripts npm

| Commande | Action |
|---|---|
| `npm run dev` | Lance l'API avec rechargement automatique (nodemon) |
| `npm start` | Lance l'API (production) |
| `npm run db:migrate` | Applique les migrations en attente |
| `npm run db:generate -- --name <nom>` | Génère une migration après une modification de `src/db/schema.js` |
| `npm run db:seed` | Charge les données de démo (**jamais en production**) |
| `npm run db:studio` | Ouvre Drizzle Studio pour explorer la base |

---

## 4. Structure du projet

```
pharmapulse-api/
├── drizzle/                 Migrations SQL (générées, à commiter)
├── src/
│   ├── index.js             Point d'entrée : sécurité, limites, routes, démarrage
│   ├── config/              Base de données, JWT, logs, emails (mailer.js)
│   ├── db/schema.js         Schéma de toutes les tables
│   ├── routes/              Déclaration des routes
│   ├── controllers/         Lecture de la requête → appel du service → réponse
│   ├── services/            Logique métier
│   ├── validators/          Validation des données reçues
│   ├── middlewares/         Authentification, validation, erreurs
│   ├── jobs/                Tâches planifiées (rappels de fin d'essai)
│   ├── utils/               Audit, images, abonnements, réponses…
│   └── i18n/                Messages en français et anglais
├── drizzle.config.js        Configuration des migrations
└── render.yaml              Configuration du déploiement Render
```

### Groupes de routes

| Préfixe | Accès |
|---|---|
| `/api/auth` | Connexion, inscription, profil, mot de passe, logo de la pharmacie |
| `/api/products`, `/sales`, `/receptions`, `/inventories`, `/movements`, `/orders`, `/batches`, `/categories`, `/users`, `/notifications`, `/dashboard` | Utilisateur connecté **et** pharmacie active |
| `/api/super/auth` | Connexion et mot de passe du Super Admin |
| `/api/super` | Panel Super Admin (pharmacies, utilisateurs, journaux, réglages du site) |
| `/api/public` | Sans connexion : vitrine, recherche, commandes en ligne, logos |

Les rôles d'une pharmacie sont `ADMIN`, `MANAGER`, `CAISSIER` et `STOCK_MANAGER`.

---

## 5. Fonctionnement

### Emails envoyés

| Événement | Destinataire |
|---|---|
| Inscription d'une pharmacie | Bienvenue à l'administrateur de la pharmacie, et notification à tous les Super Admins |
| Mot de passe oublié | L'utilisateur (lien valable 1 h, utilisable une seule fois) |
| Essai gratuit qui se termine (7 jours avant, puis la veille) | Les administrateurs de la pharmacie, avec aussi une notification dans l'application |

Les modèles sont dans `src/config/mailer.js`. Un email qui échoue ne bloque jamais l'action en cours.

### Tâche planifiée

Les rappels de fin d'essai (`src/jobs/trialReminders.js`) sont vérifiés **au démarrage puis toutes les heures**, à l'intérieur de l'API. Chaque rappel n'est envoyé qu'une fois : il est noté dans le journal d'audit.

> ⚠️ L'API doit donc **tourner en permanence** et en **une seule instance**. Avec plusieurs instances, les rappels partiraient en double.

### Logos et nom du site

- **Logo d'une pharmacie :** chaque administrateur l'ajoute dans *Paramètres*. Il s'affiche dans le menu, sur les reçus et sur la vitrine.
- **Logo et nom du site :** le Super Admin les règle dans *Paramètres*. Ils s'affichent dans l'interface, l'onglet du navigateur et les emails.
- **Formats :** PNG, JPEG ou WebP, 512 Ko au maximum. Le contenu est vérifié et les SVG sont refusés. Les images sont stockées en base, il n'y a donc pas de dossier de fichiers à sauvegarder.

### Sécurité

- **Limite de requêtes par utilisateur connecté :** les employés d'une même pharmacie ne se bloquent pas entre eux.
- **Limites plus strictes par adresse IP** sur la connexion, l'inscription et le mot de passe oublié.
- **Journal d'audit :** chaque action sensible est enregistrée (table `auditLogs` pour les pharmacies, `super_admin_logs` pour le Super Admin).

---

## 6. Base de données et migrations

Le schéma est défini dans `src/db/schema.js`. Pour le modifier :

```bash
# 1. Modifier src/db/schema.js
# 2. Générer la migration
npm run db:generate -- --name ajout_colonne_x
# 3. Relire le SQL généré dans drizzle/, puis l'appliquer
npm run db:migrate
# 4. Commiter le schéma ET le dossier drizzle/
```

> N'utilisez pas `db:push` sur une base partagée : il modifie la base sans créer de migration, et les déploiements suivants échoueraient.

---

## 7. Déploiement (Render + Supabase)

Architecture : **Vercel** (front) → **Render** (cette API) → **Supabase** (PostgreSQL).

### 7.1 Supabase

1. Créez le projet dans la région **`eu-central-1` (Frankfurt)**, la même que l'API.
2. **Connect → Session pooler** : copiez l'URL (port 5432). N'utilisez pas la connexion « directe », qui passe en IPv6 et que Render ne gère pas.
3. N'ajoutez pas `?sslmode=…` à l'URL : c'est `DATABASE_SSL=true` qui active le chiffrement.

### 7.2 Render

Le fichier [`render.yaml`](render.yaml) décrit tout le service.

1. Poussez le dépôt sur GitHub.
2. Sur Render : **New → Blueprint**, puis choisissez ce dépôt.
3. Renseignez les variables demandées : `DATABASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` et `MAIL_FROM`. Les secrets JWT sont générés automatiquement.

À chaque push, Render :
1. installe les dépendances (`npm ci --include=dev`) ;
2. **applique les migrations** (`npm run db:migrate`). Si elles échouent, le déploiement s'arrête et l'ancienne version reste en ligne ;
3. démarre l'API, puis vérifie `/api/health`.

### 7.3 Vercel (front)

Ajoutez `VITE_API_URL=https://<votre-service>.onrender.com/api`, puis redéployez le front.

### Coûts indicatifs

| Service | Plan | Prix |
|---|---|---|
| Render | Starter (toujours allumé) | ~7 $/mois |
| Supabase | Pro (sauvegardes, pas de pause) | ~25 $/mois |
| Vercel | Pro (nécessaire pour un usage commercial) | ~20 $/mois |

> Le plan **gratuit** de Render ne convient pas : il met l'API en veille après 15 minutes, ce qui suspend les rappels de fin d'essai et fait échouer la première requête au réveil.

---

## 8. Dépannage

| Symptôme | Cause probable |
|---|---|
| Erreur `429 Trop de requêtes` | `RATE_LIMIT_MAX` trop bas, ou `TRUST_PROXY` absent derrière Render |
| `self-signed certificate` / connexion refusée à Supabase | `DATABASE_SSL=true` manquant, ou `?sslmode=` ajouté à l'URL |
| Aucun email reçu | SMTP non configuré : voir `logs/error.log`. Vérifiez aussi que l'adresse de `MAIL_FROM` est autorisée par votre fournisseur. |
| Erreur CORS dans le navigateur | L'adresse du front manque dans `CORS_ORIGINS` |
| Liens des emails vers `localhost` | `FRONTEND_URL` non défini en production |
| Le déploiement échoue à l'étape des migrations | Base créée hors migrations (avec `db:push` ou du SQL) : vérifiez la table `drizzle.__drizzle_migrations` |
