# BEATUS Mobile – Contexte et fonctionnement

Ce document décrit l’application mobile BEATUS (Team leaders et Techniciens), son lien avec le backend commun et la version web, et comment faire coexister les deux dans le même workspace.

---

## 1. Rôle de l’app mobile dans l’écosystème BEATUS

| Projet | Emplacement | Utilisateurs | Rôle |
|--------|-------------|--------------|------|
| **BEATUS** (web) | `../BEATUS` ou workspace racine | Admin | Création interventions, clients, secteurs, activités, invitations TL/Tech, devis/factures, abonnement. |
| **BEATUS-Mobile** | Ce dossier | Team leaders + Techniciens | Voir/prendre/assigner interventions, compléter, devis/facture (TL), paramètres, invitations techniciens (TL). |
| **Backend** | `../BEATUS/backend` | — | API unique : `https://beatus-backend.deno.dev/api`. |

- **Même backend** pour web et mobile : mêmes données, mêmes endpoints.
- **Pas de communication directe** entre l’app web et l’app mobile ; tout passe par l’API.
- **Objectif workspace** : développer et faire tourner **web et mobile en parallèle** (backend commun, deux clients distincts).

---

## 2. Stack technique (BEATUS-Mobile)

- **Expo** (~54), **React Native**, **TypeScript**.
- **Navigation** : `@react-navigation/native` + `native-stack` (pas de tabs ; pile d’écrans).
- **Stockage sécurisé** : `expo-secure-store` (authToken, authUser).
- **OAuth** : ouverture du frontend web pour Google (redirect vers l’app via deep link avec token/user).
- **Notifications** : `expo-notifications` ; token Expo Push envoyé au backend (`/notifications/subscribe`).
- **Config** : `src/config/api.ts` (API_BASE_URL, GOOGLE_CLIENT_ID, couleurs, libellés de statuts).  
  URL API en dur : `https://beatus-backend.deno.dev/api` (identique à `app.json` → `extra.apiBaseUrl`).

---

## 3. Authentification

- **Réservée** aux rôles `technician` et `team_leader`. Un compte `admin` ou `client` qui tente de se connecter à l’app reçoit une erreur explicite.
- **Flux “J’ai déjà un compte”**  
  1. L’utilisateur tape “J’ai déjà un compte” → “Continuer avec Google”.  
  2. Ouverture de `WEB_FRONTEND_URL/auth/mobile-oauth?redirect=...` (ex. `https://beatus-gamma.vercel.app/auth/mobile-oauth?...`) dans le navigateur.  
  3. Le frontend web gère l’OAuth Google puis redirige vers l’app avec un **deep link** contenant `token` et `user` (ex. `beatus://auth?token=...&user=...`).  
  4. `WelcomeScreen` écoute l’événement `url` (Linking) et `getInitialURL` (cold start). Dès que l’URL contient `token=` et `user=`, parsing → vérification du rôle → `login(token, user)` (SecureStore + contexte).  
  5. Aucun appel direct à `POST /auth/google` depuis l’app dans ce flux ; le web fait l’échange code → token et renvoie token + user à l’app.
- **Flux “Code d’invitation”**  
  1. L’utilisateur entre un code (format XXX-XXX, formaté côté UI).  
  2. `POST /invitations/validate` avec `{ code }` (sans auth). Réponse : `{ valid, invitation }` (type, tenantId, creatorName, etc.).  
  3. Si valide, affichage “Créer mon compte avec Google” avec invitation pré-remplie.  
  4. Ouverture de la même page mobile-oauth en ajoutant `invitationCode`, `role`, `tenantId` dans l’URL.  
  5. Le web appelle le backend avec ce contexte ; le backend crée le user + profil technician ou team_leader et marque l’invitation comme utilisée.  
  6. Redirection vers l’app avec token + user (même deep link).  
  Optionnel : après login, l’app peut appeler `POST /invitations/use` avec le code ; le backend a déjà marqué l’invitation comme utilisée lors de la création du compte.
- **Persistance** : au démarrage, `AuthContext` lit `authToken` et `authUser` dans SecureStore, puis appelle `GET /auth/me` pour rafraîchir l’utilisateur. Si 401/erreur → logout (suppression SecureStore).
- **Push** : après un login réussi (technician ou team_leader), `registerAndSubscribe()` est appelé (permissions → Expo Push Token → `POST /notifications/subscribe` avec `{ expoPushToken }`).

---

## 4. Navigation et écrans

- **Point d’entrée** : `App.tsx` → `SafeAreaProvider` → `AuthProvider` → `AppNavigator`.
- **AppNavigator** (`src/navigation/AppNavigator.tsx`) :  
  - Si pas de `user` → **Welcome** (WelcomeScreen).  
  - Si `user` mais **profil incomplet** (technician : `GET /technicians/check-profile` → `complete`; team_leader : `GET /team-leaders/me` → vérification phone/email/name) → **ProfileCompletion** (ProfileCompletionScreen).  
  - Si **team_leader** et profil complet : pile d’écrans TL (TeamLeaderHome, InviteTechnician, InterventionDetail, DocumentSettings, EmailSettings, TechnicianDefaults, TechnicianEdit, CreateQuote, CreateInvoice, MyDocuments, BillingSettings, QuoteDetail, InvoiceDetail).  
  - Si **technician** et profil complet : pile Technicien (TechnicianHome, TechnicianSettings, InterventionDetail, CreateQuote, CreateInvoice, MyDocuments, QuoteDetail, InvoiceDetail).
- **Notification tap** : `Notifications.addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync` ; si `data.interventionId` → `navigationRef.navigate('InterventionDetail', { interventionId })`.
- **Badge** : `Notifications.setBadgeCountAsync(0)` au focus de l’app.

---

## 5. Service API (`src/services/api.ts`)

- **Client** : `fetch` vers `API_BASE_URL` (depuis config). En-tête `Authorization: Bearer ${token}` avec token lu dans SecureStore à chaque requête (`getHeaders()`).
- **Méthodes principales** :  
  - Auth : `loginWithGoogle(token)`, `getMe()`.  
  - Interventions : `getInterventions(params)`, `getIntervention(id)`, `acceptIntervention(id, location?)`, `cancelIntervention`, `completeIntervention`, `updateInterventionStatus`.  
  - Techniciens : `getTechnicians`, `getTechnician`, `checkTechnicianProfile`, `getTechnicianProfile`, `updateTechnician`, `updateLocation`, `toggleAvailability`.  
  - Team leaders : `getTeamLeaderMe()` (normalisation snake_case → camelCase, fusion invitation), `updateTeamLeader`, `getTeamLeaderTechnicians`, `getTeamLeaderStats`, `updateTechnicianCommission`, `updateTechnicianByTeamLeader`.  
  - Sector assignments : `getSectorAssignments`, `selfAssignSector`, `assignSectorToTechnician`, `deleteSectorAssignment`.  
  - Invitations : `generateInvitation`, `validateInvitation`.  
  - Activités : `getActivities()`.  
  - Notifications : `getNotifications`, `markNotificationRead`, `subscribeToNotifications({ expoPushToken })`.  
  - Billing settings : `getBillingSettings`, `saveBillingSettings`, `uploadLogo`, `deleteLogo`.  
  - Devis / factures : `getQuotes`, `getQuote`, `createQuote`, `updateQuote`, etc. ; `getInvoices`, `getInvoice`, `createInvoice`, etc.  
- En cas de `!response.ok`, log détaillé via `logErrorDetailed` puis throw avec `error.error` ou `error.message`.

---

## 6. Écrans principaux (résumé)

- **WelcomeScreen** : Choix “J’ai déjà un compte” / “J’ai un code d’invitation”. Connexion Google via web + deep link, ou validation du code puis Google avec invitation.  
- **ProfileCompletionScreen** : Complétion nom, téléphone, secteurs (départements), activités (technicien/TL). Enregistrement via PATCH technicien ou team_leader.  
- **TechnicianHomeScreen** : Liste interventions (disponibles, en cours, terminées), stats, bascule disponibilité, mise à jour position (expo-location). Appels à `getInterventions`, `checkTechnicianProfile`, `updateLocation`, `toggleAvailability`.  
- **TeamLeaderHomeScreen** : Stats (techniciens, interventions, revenus, commissions), liste des techniciens, interventions disponibles / assignées / actives. Assignation d’une intervention à un technicien, création devis/facture, accès paramètres (documents, email, commissions par défaut, invitation technicien, billing settings).  
- **InterventionDetailScreen** : Détail d’une intervention ; acceptation, refus, complétion (photos, notes, montants) ; création devis/facture si besoin.  
- **InviteTechnicianScreen** : Génération d’invitation technicien (secteurs, activités, commission, etc.) via `generateInvitation`, partage du code.  
- **CreateQuoteScreen / CreateInvoiceScreen** : Création devis/facture liée à une intervention (items, TVA, client).  
- **BillingSettingsScreen** : Paramètres de facturation (TL ou technicien) : société, SIRET, adresse, logo, textes email.  
- **QuoteDetailScreen / InvoiceDetailScreen** : Consultation et actions sur un devis/facture.

---

## 7. Notifications push

- **notificationService.ts** :  
  - `registerForPushNotifications()` : appareil physique, permissions, canal Android, `Notifications.getExpoPushTokenAsync({ projectId })` (projectId depuis `Constants.expoConfig?.extra?.eas?.projectId`).  
  - `subscribeToBackend(expoPushToken)` : `api.subscribeToNotifications({ expoPushToken })` → `POST /notifications/subscribe`.  
  - `registerAndSubscribe()` : permission + token + envoi au backend.  
- Le backend enregistre le token dans `push_subscriptions` (un enregistrement par user). Les notifications (ex. nouvelle intervention) sont envoyées via l’API Expo Push avec `data: { interventionId }` pour permettre la navigation vers InterventionDetail.

---

## 8. Coexistence Web + Mobile dans le workspace

- **Backend** : un seul projet (ex. `BEATUS/backend`). Toute modification des routes ou de la logique sert **web et mobile**. Déploiement : `deployctl deploy` (Deno).  
- **Frontend web** : `BEATUS/src` (Vite, React). Modifications UI admin, auth web, pages client. Déploiement : `npm run build` puis Vercel.  
- **Mobile** : ce projet BEATUS-Mobile. Modifications des écrans TL/Technicien, auth mobile, appels API. Build : `npx eas build --profile preview --platform ios` (ou android). Ne pas déployer le web pour changer l’app mobile ; l’app pointe toujours vers la même URL d’API (production ou override en dev).  
- **URLs à garder cohérentes** :  
  - Backend : `https://beatus-backend.deno.dev/api` (config mobile dans `src/config/api.ts` et `app.json`).  
  - Frontend web (pour OAuth mobile) : `WEB_FRONTEND_URL` dans WelcomeScreen (ex. `https://beatus-gamma.vercel.app`).  
- **Deep link** : scheme `beatus` (app.json). Redirect OAuth depuis le web vers `beatus://auth?token=...&user=...` pour que l’app mobile reprenne la main.  
- **Règles Cursor** (`.cursor/rules`) : rappellent que BEATUS = admin web, BEATUS-Mobile = app TL/Techniciens, et quand déployer backend / frontend / mobile après modification.

---

## 9. Fichiers clés (BEATUS-Mobile)

| Fichier | Rôle |
|---------|------|
| `App.tsx` | Point d’entrée ; AuthProvider + AppNavigator. |
| `src/contexts/AuthContext.tsx` | État user/token, login/logout, loginWithGoogle, loginWithGoogleAndInvitation, chargement SecureStore + /auth/me, enregistrement push après login. |
| `src/navigation/AppNavigator.tsx` | Choix Welcome / ProfileCompletion / TL stack / Technicien stack ; écoute deep link notification → InterventionDetail. |
| `src/screens/WelcomeScreen.tsx` | Choix connexion / invitation, validation code, ouverture OAuth web, écoute deep link token+user. |
| `src/config/api.ts` | API_BASE_URL, GOOGLE_CLIENT_ID, COLORS, STATUS_*, TYPE_*. |
| `src/services/api.ts` | Toutes les requêtes vers le backend (auth, interventions, techniciens, team-leaders, invitations, notifications, billing, quotes, invoices). |
| `src/services/notificationService.ts` | Permissions, Expo Push Token, envoi du token au backend. |
| `src/screens/ProfileCompletionScreen.tsx` | Complétion profil (nom, phone, secteurs, activités). |
| `src/screens/technician/TechnicianHomeScreen.tsx` | Accueil technicien : interventions, stats, disponibilité, position. |
| `src/screens/teamleader/TeamLeaderHomeScreen.tsx` | Accueil TL : stats, techniciens, interventions, assignation, paramètres. |
| `app.json` | Nom, scheme `beatus`, `extra.apiBaseUrl`, `extra.eas.projectId`, permissions iOS/Android. |

---

## 10. Commandes utiles

- **Démarrer l’app en dev** : `npx expo start` (ou `npx expo start --dev-client` si build dev client).  
- **Build iOS (preview)** : `npx eas build --profile preview --platform ios` (optionnel `--local`).  
- **Backend (depuis BEATUS)** : `cd ../BEATUS/backend && deployctl deploy --project=beatus-backend --entrypoint=src/main.ts`.  
- **Frontend web (depuis BEATUS)** : `cd ../BEATUS && npm run build && vercel --prod`.

---

Ce fichier sert de contexte pour continuer le développement de l’app mobile tout en gardant le lien avec le backend et la version web dans un workspace commun.
