#!/bin/bash
# Double-clique sur ce fichier dans le Finder (ou lance-le depuis un
# terminal) pour finir la mise en place des notifications push web :
#
#   1. Applique la migration SQL 0105 (table push_subscriptions) sur ton
#      projet Supabase "Loup Garou" — éditeur SQL ouvert automatiquement,
#      le contenu est déjà copié dans le presse-papiers.
#   2. Enregistre les 4 variables d'environnement nécessaires sur Vercel
#      (clé VAPID publique déjà connue et pré-remplie, clé VAPID privée et
#      clé service_role Supabase demandées à la saisie — jamais écrites
#      dans ce fichier, qui est versionné sur GitHub).
#   3. Vérifie le code (TypeScript + grants RPC + build), commit et push —
#      Vercel redéploie automatiquement dès réception du push.
#
# À lancer une seule fois. Si tu dois relancer ce script après une
# variable déjà ajoutée, supprime-la d'abord :
#   npx vercel env rm NOM_DE_LA_VARIABLE production

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"
VAPID_PUBLIC_KEY="BCgqViidAbpMNtcRWXOmlbarzydJF9eIbUMID1VW-cstYlGVb3bNiSbfB8JUbi_XvKN8YupxgOKsAXFRhHVxY0M"

echo "==========================================="
echo " Loup Garou d'Afrique — Notifications push"
echo "==========================================="
echo

# --- 1. Migration SQL --------------------------------------------------
echo "→ Étape 1/3 : appliquer la migration SQL"
echo
pbcopy < supabase/migrations/0105_push_subscriptions.sql
echo "Le contenu de supabase/migrations/0105_push_subscriptions.sql a été"
echo "copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Dans l'éditeur SQL qui vient de s'ouvrir : colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois la migration exécutée avec succès..."

# --- 2. Variables d'environnement Vercel --------------------------------
echo
echo "→ Étape 2/3 : variables d'environnement Vercel"
echo

echo "-- VAPID_PUBLIC_KEY (déjà connue, pré-remplie) --"
printf '%s' "$VAPID_PUBLIC_KEY" | npx vercel env add VAPID_PUBLIC_KEY production

echo
echo "-- VITE_VAPID_PUBLIC_KEY (même valeur, lue côté client) --"
printf '%s' "$VAPID_PUBLIC_KEY" | npx vercel env add VITE_VAPID_PUBLIC_KEY production

echo
echo "-- VAPID_PRIVATE_KEY --"
echo "Colle la clé privée donnée par Claude plus tôt dans la conversation"
echo "(jamais stockée dans ce script ni dans le dépôt)."
read -s -p "Clé VAPID privée : " VAPID_PRIVATE_KEY
echo
printf '%s' "$VAPID_PRIVATE_KEY" | npx vercel env add VAPID_PRIVATE_KEY production
unset VAPID_PRIVATE_KEY

echo
echo "-- SUPABASE_SERVICE_ROLE_KEY --"
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/api"
echo "→ Sur la page qui vient de s'ouvrir : copie la clé 'service_role'."
read -s -p "Clé service_role Supabase : " SUPABASE_SERVICE_ROLE_KEY
echo
printf '%s' "$SUPABASE_SERVICE_ROLE_KEY" | npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
unset SUPABASE_SERVICE_ROLE_KEY

# --- 3. Vérification + déploiement --------------------------------------
echo
echo "→ Étape 3/3 : vérification et déploiement"
echo

echo "→ Vérification TypeScript..."
npx tsc -b

echo
echo "→ Vérification des grants RPC..."
npm run check:rpc

echo
echo "→ Build de production..."
npm run build

echo
echo "→ Fichiers modifiés :"
git status --short

CHANGES=$(git status --porcelain)
if [ -z "$CHANGES" ]; then
  echo
  echo "Aucun changement de code à pousser (les variables Vercel sont déjà enregistrées)."
else
  echo
  read -p "Message de commit (laisse vide pour un message automatique) : " msg
  if [ -z "$msg" ]; then
    msg="Ajoute les notifications push web"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "→ Envoi vers GitHub (Vercel va redéployer automatiquement)..."
  git push
fi

echo
echo "✅ Terminé. Vercel reconstruit le site avec les nouvelles variables — ça prend"
echo "   en général 1 à 2 minutes (à suivre sur vercel.com)."
echo
echo "Pour tester : va sur https://www.loupgarouafrique.com/compte, section"
echo "'Notifications' → Activer, puis 'Envoyer un test'."
echo
read -p "Appuie sur Entrée pour fermer..."
