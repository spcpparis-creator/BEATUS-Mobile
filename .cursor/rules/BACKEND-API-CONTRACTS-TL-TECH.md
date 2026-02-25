# Contrats API Backend – Inscription TL et TECH

**But :** Vérifier que les réponses du backend correspondent exactement à ce que l'app mobile BEATUS attend lors de l'inscription d'un Team Leader ou d'un Technicien.

---

## 1. POST /api/invitations/validate

**Request:**
```json
{ "code": "ABC-123" }
```

**Response 200 (succès):**
```json
{
  "valid": true,
  "invitation": {
    "id": "uuid",
    "code": "ABC-123",
    "type": "team_leader",
    "tenantId": "uuid",
    "createdBy": "uuid",
    "creatorName": "Nom de l'admin ou du TL"
  }
}
```
- `type` doit être `"team_leader"` ou `"technician"`
- Tous ces champs sont utilisés par l'app

**Response en erreur:**
```json
{
  "valid": false,
  "error": "Message optionnel"
}
```
- L'app vérifie `data.valid === true` et `data.invitation`

---

## 2. POST /api/auth/google (inscription avec code d'invitation)

**Request:**
```json
{
  "token": "google_id_token",
  "role": "team_leader",
  "tenantId": "uuid",
  "invitationCode": "ABC-123"
}
```
- `role` = `"team_leader"` ou `"technician"` selon l'invitation
- Le backend doit créer le profil TL ou TECH en recopiant les paramètres de l'invitation (secteurs, activités, commission, billingType)

**Response 200 (succès):**
```json
{
  "token": "jwt_access_token",
  "user": {
    "id": "uuid",
    "email": "user@gmail.com",
    "name": "Prénom Nom",
    "role": "team_leader",
    "tenantId": "uuid"
  }
}
```
- L'app exige `data.token` et `data.user`
- `data.user.role` doit être `"technician"` ou `"team_leader"` (sinon accès refusé)

**Response en erreur:**
```json
{
  "error": "Message d'erreur"
}
```

---

## 3. POST /api/invitations/use

**Request:** `Authorization: Bearer <token>`, body `{ "code": "ABC-123" }`

**Response 200:** Corps non utilisé par l'app (peut être vide ou `{}`)

---

## 4. GET /api/team-leaders/me

**Response 200 (succès):** L'app accepte soit `{ data: {...} }` soit `{ teamLeader: {...} }` soit l'objet TL à la racine.

**Structure attendue du Team Leader:**
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "name": "Nom du TL",
    "phone": "06 12 34 56 78",
    "email": "tl@example.com",
    "selectedDepartments": ["75", "92", "93"],
    "activityIds": ["uuid-1", "uuid-2"],
    "activities": [{ "id": "uuid-1", "name": "Plomberie" }],
    "billingType": "self",
    "commissionFromAdmin": 50,
    "defaultTechnicianCommission": 30
  }
}
```

- L'app accepte aussi les variantes snake_case : `user_id`, `selected_departments`, `activity_ids`, `billing_type`, `commission_from_admin`, `default_technician_commission`
- Un sous-objet `user` avec `name`, `phone`, `email` est utilisé en fallback
- **Profil complet** (condition mobile) : `phone` non vide ET (`email` non vide OU `name` non vide)

**Response 4xx/5xx:** Si erreur, l'app affiche le formulaire « Compléter mon profil » à chaque ouverture.

---

## 5. GET /api/technicians/check-profile

**Response 200 (succès):**
```json
{
  "complete": true,
  "technician": {
    "id": "uuid",
    "name": "Nom du TECH",
    "phone": "06 12 34 56 78",
    "email": "tech@example.com",
    "selectedDepartments": ["75", "92"],
    "activityIds": ["uuid-1"],
    "billingType": "spcp",
    "commissionPercentage": 30,
    "teamLeaderId": "uuid",
    "teamLeaderName": "Nom du TL"
  },
  "availableSectors": ["75", "92", "93"],
  "availableActivityIds": ["uuid-1", "uuid-2"]
}
```

- L'app vérifie `data.complete === true` pour considérer le profil complet
- Variantes snake_case acceptées : `selected_departments`, `activity_ids`, `commission_percentage`, `teamLeaderId` / `teamLeaderName`

---

## 6. PATCH /api/team-leaders/me

**Request:**
```json
{
  "name": "Nom complet",
  "phone": "06 12 34 56 78",
  "email": "tl@example.com",
  "selectedDepartments": ["75", "92"],
  "activityIds": ["uuid-1", "uuid-2"]
}
```

- **Obligatoire :** persister `name` et `phone` en base sur la ligne du TL
- Ces champs doivent apparaître au prochain `GET /api/team-leaders/me`

**Response 200:** Corps non critique (peut être `{}` ou l'objet TL mis à jour)

**Response en erreur:**
```json
{
  "error": "Message d'erreur"
}
```

---

## 7. PATCH /api/technicians/profile

**Request:**
```json
{
  "name": "Nom complet",
  "phone": "06 12 34 56 78",
  "email": "tech@example.com",
  "selectedDepartments": ["75", "92"],
  "activityIds": ["uuid-1"]
}
```

- **Obligatoire :** persister `name` et `phone` en base sur la ligne du Technicien

**Response 200:** Corps non critique

**Response en erreur:**
```json
{
  "error": "Message d'erreur"
}
```

---

## Checklist de vérification

- [ ] `POST /invitations/validate` retourne `valid: true` et `invitation` avec `id`, `code`, `type`, `tenantId`, `createdBy`, `creatorName`
- [ ] `POST /auth/google` avec `invitationCode` crée le profil TL/TECH en recopiant les paramètres de l'invitation (secteurs, activités, commission, billingType)
- [ ] `POST /auth/google` retourne `{ token, user }` avec `user.role` = `team_leader` ou `technician`
- [ ] `GET /team-leaders/me` retourne 200 avec `name`, `phone`, `email`, `selectedDepartments`, `activityIds`, `billingType`, `commissionFromAdmin` (pas de valeurs par défaut si la base en contient d'autres)
- [ ] `GET /technicians/check-profile` retourne `complete: true` quand le profil est rempli et inclut `technician` avec les champs attendus
- [ ] `PATCH /team-leaders/me` persiste `name` et `phone` en base
- [ ] `PATCH /technicians/profile` persiste `name` et `phone` en base
- [ ] Pas d'erreur 500 sur `GET /team-leaders/me` (sinon le TL voit « Compléter mon profil » à chaque connexion)
