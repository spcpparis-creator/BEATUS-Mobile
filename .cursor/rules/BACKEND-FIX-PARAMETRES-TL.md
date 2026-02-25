# CORRECTION BACKEND – Paramètres TL non affichés dans BEATUS Mobile

## Problème

L'admin définit dans l'app web :
- **Facturation** : Auto-facturation
- **Commission** : 50% du (HT - matériel)
- **Secteurs** : 94, 75, 31
- **Activités** : Serrurerie

Le mobile affiche pour le même TL :
- **Facturation** : SPCP (par défaut)
- **Commission** : 30%
- **Secteurs** : Aucun
- **Activités** : Aucune

## Cause

Le backend ne copie pas les paramètres de l'invitation vers le profil du Team Leader à l'inscription.

---

## Corrections à apporter au backend

### 1. Lors de la génération de l'invitation (POST /api/invitations/generate)

Enregistrer en base avec l'invitation :
- `selectedDepartments` (array) : ex. `["94", "75", "31"]`
- `activityIds` (array) : ex. `["uuid-serrurerie"]`
- `billingType` : `"self"` ou `"spcp"`
- `commissionFromAdmin` (number) : ex. `50`

### 2. Lors de l'inscription du TL (POST /api/auth/google avec invitationCode)

Quand un TL s'inscrit avec un code d'invitation valide :

1. Récupérer l'invitation par code
2. Créer le profil Team Leader
3. **Copier** depuis l'invitation vers le profil TL :
   - `selectedDepartments` ← `invitation.selectedDepartments`
   - `activityIds` ← `invitation.activityIds`
   - `billingType` ← `invitation.billingType`
   - `commissionFromAdmin` ← `invitation.commissionFromAdmin`

### 3. GET /api/team-leaders/me

Retourner le TL avec ces champs **depuis la base** (pas des valeurs par défaut) :
```json
{
  "data": {
    "id": "...",
    "name": "...",
    "phone": "...",
    "selectedDepartments": ["94", "75", "31"],
    "activityIds": ["uuid-serrurerie"],
    "billingType": "self",
    "commissionFromAdmin": 50,
    "defaultTechnicianCommission": 30,
    ...
  }
}
```

**Ne pas** renvoyer `spcp` ou `30` par défaut si la base contient `self` et `50`.

---

## Vérification

Après correction, pour un TL invité avec :
- Auto-facturation, 50%, secteurs 94/75/31, Serrurerie

Le mobile doit afficher exactement ces valeurs dans Paramètres.
