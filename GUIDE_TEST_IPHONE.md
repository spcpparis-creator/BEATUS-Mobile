# Tester l'app BEATUS sur iPhone (sans serveur de dev)

## Problème
Le development build nécessite une connexion au serveur Expo (tunnel/LAN) qui ne fonctionne pas chez toi.

## Solution : Build Preview (standalone)

Un **build preview** est une app **autonome** : pas de serveur de dev, pas de connexion. Tu l’installes et elle fonctionne directement.

---

## Étape 1 : Créer le build

```bash
cd /Users/gt/Desktop/BEATUS-Mobile
eas build --profile preview --platform ios
```

- Réponds **Y** aux questions (Apple, certificats, etc.)
- Attends 15–30 min

---

## Étape 2 : Installer sur ton iPhone

1. Quand le build est terminé, EAS affiche un **lien**
2. Ouvre ce lien **sur ton iPhone** (Safari)
3. Télécharge et installe l’app
4. Si demandé : **Réglages** → **Général** → **VPN et gestion des appareils** → Faire confiance au développeur

---

## Étape 3 : Utiliser l’app

- Ouvre **BEATUS Mobile** sur ton iPhone
- Connecte-toi avec ton compte Google (TL ou Tech)
- L’app est autonome : backend `beatus-backend.deno.dev`, pas de serveur Expo

---

## Étape 4 : Tester les notifications

1. L’app enregistre ton token push à la connexion
2. Le backend doit envoyer les push via l’API Expo quand une intervention est créée
3. Test manuel : [expo.dev/notifications](https://expo.dev/notifications) → colle ton token

---

## Récapitulatif

| Composant | URL / Méthode |
|-----------|----------------|
| **Frontend web** | https://beatus-gamma.vercel.app (Vercel) |
| **Backend API** | https://beatus-backend.deno.dev/api (Deno) |
| **App mobile** | Build preview installé sur iPhone (standalone) |

---

## Commande unique

```bash
eas build --profile preview --platform ios
```

Puis installe via le lien fourni par EAS.
