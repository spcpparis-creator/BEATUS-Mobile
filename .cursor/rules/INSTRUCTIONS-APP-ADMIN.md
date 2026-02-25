# Instructions pour l'application BEATUS Admin

À donner à Cursor (ou au développeur) sur le projet **BEATUS Admin** pour implémenter la génération de codes d'invitation.

---

## Flux global

1. L'admin génère un code d'invitation pour un **Team Leader** ou un **Technicien**
2. Lors de la génération, l'admin saisit : secteurs (départements), activités (plomberie, serrurerie...), type de facturation, commission
3. **Ces données doivent être enregistrées en base** (côté backend) avec l'invitation
4. Quand le TL ou TECH s'inscrit avec le code sur BEATUS Mobile, le backend crée son profil en **recopiant** ces données
5. Le TL/TECH remplit une fois son nom et téléphone → tout est sauvegardé
6. Aux connexions suivantes, il voit directement ses paramètres (secteurs, activités, facturation) dans l'onglet Paramètres

---

## Ce que l'app Admin doit faire

### Formulaire de génération de code

Quand l'admin clique sur "Générer un code d'invitation", afficher un formulaire avec :

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| Type | Oui | Team Leader ou Technicien |
| Email | Non | Email de la personne invité |
| Secteurs (départements) | Oui | Liste de codes (75, 92, 93...) - multi-sélection |
| Activités | Oui | Plomberie, Électricité, Serrurerie... - multi-sélection |
| Type de facturation | Pour TL | SPCP ou Auto-facturation |
| Commission | Oui | % (ex: 30, 50) |

### Appel API

```
POST /api/invitations/generate
Authorization: Bearer <token_admin>
Content-Type: application/json

{
  "type": "team_leader" | "technician",
  "email": "optionnel@email.com",
  "selectedDepartments": ["75", "92", "93"],
  "activityIds": ["uuid-plomberie", "uuid-electricite"],
  "billingType": "spcp" | "self",      // pour TL uniquement
  "commissionFromAdmin": 50,            // pour TL
  "commissionPercentage": 30            // pour TECH
}
```

### Récupérer les activités

```
GET /api/activities
Authorization: Bearer <token_admin>
```

Retourne `{ "activities": [ { "id": "...", "name": "Plomberie" }, ... ] }`

---

## Exigences Backend (à transmettre)

Le backend doit :

1. **Sauvegarder** toutes les données de l'invitation en base (secteurs, activités, commission, billingType)
2. **Lors de l'inscription** du TL/TECH via le code : recopier ces données sur le profil créé
3. **PATCH /api/team-leaders/me** : persister `name` et `phone` en base
4. **GET /api/team-leaders/me** et **GET /api/technicians/check-profile** : retourner les champs `selectedDepartments`, `activityIds`, `billingType`, `commissionFromAdmin` / `commissionPercentage`
