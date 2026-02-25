# Assets BEATUS Mobile

## Icône de notification (Android)

Pour une icône personnalisée dans la barre de notifications Android :

1. Créez une image **blanche sur fond transparent** (PNG, 96x96 px recommandé)
2. Nommez-la `notification-icon.png`
3. Placez-la dans ce dossier
4. Ajoutez dans `app.json` :
   ```json
   "android": {
     "notification": {
       "icon": "./assets/notification-icon.png",
       "color": "#3b82f6"
     }
   }
   ```

L'icône doit être monochrome (blanc) pour s'afficher correctement dans la barre de statut Android.
