/** Redimensionne et compresse une image côté navigateur avant upload — une
 * photo envoyée depuis un téléphone fait souvent plusieurs Mo à une
 * résolution bien supérieure à la taille réellement affichée (une carte de
 * rôle tient dans ~320px de large, une bannière d'événement dans le
 * tableau de bord), gonflant inutilement le poids téléchargé par CHAQUE
 * joueur qui ouvre une partie ou le tableau de bord. Cible toujours une
 * résolution cohérente avec l'affichage réel (voir les appels), jamais
 * l'originale.
 *
 * `createImageBitmap` est largement supporté par les navigateurs modernes —
 * c'est une fonctionnalité réservée à l'admin (upload d'images), pas besoin
 * de couvrir les très vieux navigateurs ici. En cas d'échec, l'appelant
 * doit retomber sur le fichier original plutôt que de bloquer l'upload. */
export async function compressImageForUpload(
  file: File,
  { maxWidth, maxHeight, quality = 0.82 }: { maxWidth: number; maxHeight: number; quality?: number }
): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Compression indisponible sur ce navigateur.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compression impossible.'))),
        'image/jpeg',
        quality
      )
    })
  } finally {
    bitmap.close()
  }
}
