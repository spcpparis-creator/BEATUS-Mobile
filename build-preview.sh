#!/bin/bash
# Build BEATUS Mobile - profil preview (installation interne iPhone)
# Inclut les corrections pending + notified pour TL et techniciens

set -e
cd "$(dirname "$0")"

echo "📱 Build BEATUS Mobile (preview iOS)"
echo ""

# Vérifier la connexion EAS
if ! npx eas whoami &>/dev/null; then
    echo "⚠️  Connexion Expo requise. Lancez :"
    echo "   npx eas login"
    echo ""
    exit 1
fi

echo "🚀 Lancement du build..."
# --non-interactive : utilise les credentials déjà configurés
npx eas build --profile preview --platform ios --non-interactive

echo ""
echo "✅ Build terminé !"
echo "   Installez l'app via le lien fourni par EAS (sur votre iPhone)."
