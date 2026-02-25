# Logs d'erreur à transmettre au backend

## Quand l'erreur se produit

Lorsque la page Paramètres du TL affiche des champs vides, les logs suivants apparaissent dans le terminal :

```
========== ERREUR API - À transmettre au backend ==========
Endpoint: https://beatus-backend.deno.dev/api/team-leaders/me
Méthode: GET
Status HTTP: 500 Internal Server Error
Réponse body: { "error": "Erreur serveur" }
Headers réponse: { ... }
Token présent: true
===========================================================
```

## Informations à donner au backend

1. **Requête** : `GET /api/team-leaders/me`
2. **Headers** : `Authorization: Bearer <token>`, `Content-Type: application/json`
3. **Statut** : 500
4. **Réponse actuelle** : `{ "error": "Erreur serveur" }`

## Ce que le backend doit vérifier

- Les logs serveur au moment de la requête (stack trace, exception)
- Que la table/collection `team_leaders` existe et est accessible
- Que l'utilisateur authentifié a bien un profil Team Leader
- Les jointures (user, tenant, activities, etc.)
- Les champs requis : `commissionFromAdmin`, `billingType`, `selectedDepartments`, `activityIds`, etc.
