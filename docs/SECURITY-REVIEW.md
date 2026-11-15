# Revue de sécurité — backend (lot 8)

Revue menée à la fin de la refonte (lots 1-7), sur la base OWASP Top 10 / ASVS niveau 1.
Chaque point coché renvoie à la preuve automatisée qui l'empêche de régresser.
Légende : ✅ conforme · ⚠️ accepté / à suivre · ❌ bloquant avant une vraie mise en production.

## 1. Authentification

- ✅ Mots de passe argon2id ; hashes bcrypt legacy vérifiés puis ré-hashés au login (`Argon2PasswordHasher`, tests unit identity).
- ✅ JWT d'accès courts (`JWT_ACCESS_TTL`, 15 min par défaut) + refresh token opaque, haché en base (sha-256), **rotation à chaque usage**, révocation au logout (`auth.e2e-spec`).
- ✅ 2FA OTP opt-in : code haché, TTL, nombre d'essais borné (`OTP_MAX_ATTEMPTS`), délai de renvoi (`OTP_RESEND_COOLDOWN_SECONDS`).
- ✅ **Limitation de débit** : `ThrottlerGuard` global (avant l'authentification) — `RATE_LIMIT_PER_MINUTE` par IP sur toutes les routes, `AUTH_RATE_LIMIT_PER_MINUTE` (10) par IP et par endpoint sur login / OTP verify / OTP resend / refresh / register → `429` (`security.e2e-spec` : 4ᵉ tentative de login refusée). `/health` exempté.
- ✅ En production, refus de démarrer avec des secrets JWT faibles (< 32 caractères), de développement ou identiques entre accès et refresh (`env.schema.spec`).
- ⚠️ Compteur de débit **en mémoire, par instance** : à remplacer par un stockage partagé (Redis) si l'API tourne sur plusieurs instances. Derrière un reverse proxy, régler `TRUST_PROXY` sinon toutes les requêtes partagent l'IP du proxy.
- ⚠️ Pas de verrouillage de compte après N échecs (seulement le débit par IP). Suffisant au lancement ; à reconsidérer si attaques distribuées.
- ⚠️ Conversion apporteur : mot de passe temporaire envoyé par e-mail (lot 5) — à remplacer par un lien d'invitation à usage unique.

## 2. Autorisation (contrôle d'accès par ressource)

- ✅ `JwtAuthGuard` global : toute route est authentifiée sauf `@Public()`. **Liste des routes publiques figée par test** (`security.e2e-spec`) : `GET /health`, `POST /auth/{login,otp/verify,otp/resend,refresh,register}`.
- ✅ **Chaque route non publique déclare ses rôles** (`@Roles`) ; les seules exceptions (« tout utilisateur connecté » : `/me`, `/auth/me`, `/auth/logout`, `GET|PUT /users/:id` contrôlés « soi-même ou admin » dans le use case) sont figées par test.
- ✅ Permissions granulaires réellement appliquées (`admin ≠ superadmin`) : `manage-quotes`, `assign-consultants`, `validate-deliverables`, `validate-payments`, `pay-consultants`, `pay-apporteurs`, `manage-users`, `view-statistics` — vérifiées par le guard **et** dans le use case (`requireAdminWith`).
- ✅ Propriété des ressources vérifiée dans les use cases ; une ressource d'un autre utilisateur renvoie **404** (pas de fuite d'existence). Tests e2e d'ownership par module (devis, contrats, missions, livrables, paiements, factures, prospects, commissions, avis).
- ✅ Inscription publique limitée aux rôles auto-attribuables (`Role.SELF_ASSIGNABLE`) : impossible de s'inscrire admin.
- ✅ Les livrables ne sont visibles du client qu'après validation admin ; la vue client masque l'identité du consultant.

## 3. Entrées, fichiers, injection

- ✅ `ValidationPipe` global `whitelist` + `forbidNonWhitelisted` : tout champ inconnu → 400.
- ✅ Paramètres d'identifiant validés (`ParseUUIDPipe`).
- ✅ SQL : Prisma (requêtes paramétrées) ; le SQL brut du reporting utilise exclusivement des templates `$queryRaw` paramétrés (aucune concaténation de valeur utilisateur ; le seul `Prisma.raw` est un nom de table issu d'un type littéral).
- ✅ Uploads : taille max par intercepteur (`MAX_UPLOAD_BYTES`) sur **tous** les `FileInterceptor` / `FileFieldsInterceptor` ; extension vérifiée par politique de fichier du domaine (`assertFileAllowed`) ; fichier vide refusé.
- ✅ **Anti path-traversal** : les clés de stockage sont construites côté serveur (`<contexte>/<id>/<uuid>.<ext>`), le nom d'origine n'est jamais utilisé comme chemin ; `LocalFileStorageAdapter` refuse toute clé sortant de la racine (`local-file-storage.adapter.spec`).
- ✅ Téléchargements : `Content-Disposition: attachment; filename*=UTF-8''…` encodé (pas d'injection d'en-tête), servis en pièce jointe.
- ⚠️ Le type réel du fichier (magic bytes) n'est pas vérifié, seulement l'extension ; les fichiers ne sont jamais exécutés ni servis inline, risque faible. Antivirus : non prévu.

## 4. Données sensibles & secrets

- ✅ Aucun secret dans le dépôt : `.env` ignoré ; seuls `.env.example` / `.env.test` (valeurs factices) sont versionnés.
- ✅ Validation de l'environnement au démarrage (zod) ; arrêt si une variable manque.
- ✅ Les e-mails ne sont jamais journalisés avec leur corps (OTP / mot de passe temporaire) ; tampon mémoire du transport `log` borné (fuite mémoire corrigée en lot 8).
- ✅ Réponses d'erreur normalisées `{ statusCode, error, message, details?, path, timestamp }` : pas de stack ni de message interne sur les 500 (journalisés côté serveur uniquement).
- ✅ Hashes de mots de passe / tokens jamais renvoyés par l'API (DTO de sortie explicites).

## 5. Configuration HTTP

- ✅ `helmet` : CSP stricte (assouplie uniquement pour `/api/docs`), HSTS, `nosniff`, `frameguard`, etc. ; `x-powered-by` retiré (`security.e2e-spec`).
- ✅ CORS **désactivé par défaut** ; liste blanche explicite via `CORS_ORIGINS` (pas de cookies : `credentials: false`, auth par bearer).
- ✅ Swagger UI désactivé par défaut en production (`SWAGGER_ENABLED` pour forcer).
- ✅ Image Docker : utilisateur non root, `tini` comme PID 1, dépendances de prod uniquement, healthcheck sur `/api/health` (503 si la base ne répond pas).

## 6. Journalisation & audit

- ✅ Journal d'audit append-only des transitions métier : devis, contrats (client et consultant), missions, livrables (**ajouté en lot 8** : dépôt, validation admin, validation client), paiements, factures, prospects, commissions, avis. Vérifié par le parcours critique e2e.
- ✅ Logs HTTP structurés (pino).

## 7. Dépendances

- ✅ `npm audit fix` appliqué (lot 8). CI : `npm audit --omit=dev --audit-level=critical`.
- ⚠️ 3 avis `high` restants, tous dans **la CLI Prisma** (`deepmerge-ts`, déni de service sur objets récursifs lors du chargement de la configuration Prisma — entrée contrôlée par nous, non exposée aux utilisateurs). Correctif = Prisma 7 (montée majeure) : à planifier.

## 8. Bloquants avant une vraie mise en production

- ❌ **Envoi d'e-mails réel** : `MAIL_DRIVER=smtp` n'est pas implémenté (seul `log` existe) — OTP, factures, mots de passe temporaires ne partent pas. Le démarrage en production refuse `smtp` tant qu'il n'est pas implémenté.
- ❌ **Stockage S3** non implémenté : en production, utiliser `STORAGE_DRIVER=local` avec un **volume persistant sauvegardé** (`/app/storage`), ou implémenter l'adaptateur S3.
- ⚠️ Sauvegardes de la base et du volume de fichiers : à mettre en place côté hébergement.
