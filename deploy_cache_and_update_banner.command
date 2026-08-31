#!/bin/bash
# Double-clique sur ce fichier pour déployer le correctif de cache/mise à
# jour (chargements lents, écran blanc après un déploiement) — pas de
# migration SQL (client + config Vercel uniquement) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Correctif cache / mise à jour — déploiement"
echo "==========================================="
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
  echo "Aucun changement de code à pousser."
else
  echo
  read -p "Message de commit (laisse vide pour un message automatique) : " msg
  if [ -z "$msg" ]; then
    msg="Cache les fichiers JS/CSS en long terme (chargements plus rapides) et affiche un bandeau 'Recharger' quand un nouveau déploiement remplace une version déjà ouverte"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "→ Envoi vers GitHub (Vercel va redéployer automatiquement)..."
  git push
fi

echo
echo "✅ Terminé. Vercel reconstruit le site — 1 à 2 minutes."
echo
echo "Ce correctif répond au problème remonté aujourd'hui (chargement long,"
echo "écran blanc) :"
echo
echo "  1. Les fichiers JS/CSS (noms uniques à chaque build) étaient re-vérifiés"
echo "     au réseau à CHAQUE chargement, même s'ils n'avaient pas changé — sur"
echo "     un réseau mobile, ça peut suffire à rendre le premier chargement lent."
echo "     Ils sont maintenant mis en cache pour de bon (1 an), donc quasi"
echo "     instantanés dès la deuxième visite."
echo "  2. Un onglet resté ouvert (ou repris en veille sur iPhone, plutôt que"
echo "     vraiment rechargé) continuait de tourner sur l'ANCIEN code après"
echo "     chaque déploiement, de plus en plus désynchronisé du serveur au fil"
echo "     des mises à jour — c'est très probablement ce qui causait le"
echo "     ralentissement/écran blanc pendant les tests d'aujourd'hui (5"
echo "     déploiements coup sur coup). Un petit bandeau apparaît maintenant en"
echo "     haut de l'écran ('Nouvelle version disponible — Recharger') dès"
echo "     qu'un onglet ouvert détecte un déploiement plus récent, au lieu de"
echo "     continuer silencieusement sur du code périmé."
echo
echo "À tester : pas grand-chose à vérifier visuellement (le bandeau n'apparaît"
echo "que lors d'un VRAI déploiement pendant qu'un onglet reste ouvert) — mais"
echo "ça vaut le coup de faire un vrai rechargement complet (pas juste revenir"
echo "dans l'onglet) une dernière fois après ce déploiement, pour repartir sur"
echo "une base saine."
echo
read -p "Appuie sur Entrée pour fermer..."
