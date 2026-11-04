#!/usr/bin/env bash
# Compresse les effets sonores de public/sounds (fichiers .mp3 qui contiennent en réalité de l'audio non compressé : ~1,4 à
# 2,1 Mb/s, soit 6,9 Mo pour 8 sons de 1 à 8 s). Écrit dans public/sounds-compressed/ SANS toucher aux originaux : écoutez
# les résultats, puis remplacez vous-même (mv) si la qualité vous convient.
#   brew install ffmpeg   # si besoin
#   bash scripts/compress-sounds.sh
# Les deux musiques d'ambiance sont déjà en MP3 64 kb/s : non retraitées.
set -euo pipefail
cd "$(dirname "$0")/../public/sounds"
mkdir -p ../sounds-compressed
for f in click dawn death join-request night-falls request-accepted victory vote-open; do
  ffmpeg -v error -y -i "$f.mp3" -ac 1 -ar 44100 -codec:a libmp3lame -b:a 96k "../sounds-compressed/$f.mp3"
  printf "%-20s %6s KB -> %5s KB\n" "$f" "$(( $(wc -c < "$f.mp3") / 1024 ))" "$(( $(wc -c < "../sounds-compressed/$f.mp3") / 1024 ))"
done
