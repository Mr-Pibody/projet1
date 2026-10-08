// Module utilitaire de traitement d'image.
// Utilise Jimp (100% JavaScript, sans binaire natif) plutôt que sharp,
// pour éviter tout problème de compatibilité binaire entre l'OS de développement
// et l'OS du serveur d'hébergement (cause fréquente de plantage au démarrage
// sur hébergement mutualisé type alwaysdata).

const { Jimp, JimpMime } = require('jimp');

/**
 * Redimensionne une image (en préservant son ratio d'aspect, sans déformation)
 * et l'enregistre en JPEG compressé sur disque.
 * @param {Buffer} inputBuffer - le buffer de l'image source (ex: req.file.buffer de multer)
 * @param {string} outputPath - chemin complet du fichier de sortie
 * @param {number} maxDim - dimension maximale (largeur ET hauteur), défaut 700px
 * @param {number} quality - qualité JPEG 0-100, défaut 75
 */
async function resizeAndSave(inputBuffer, outputPath, maxDim = 700, quality = 75) {
  const img = await Jimp.read(inputBuffer);

  const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1); // jamais d'agrandissement
  const newW = Math.round(img.width * ratio);
  const newH = Math.round(img.height * ratio);

  img.resize({ w: newW, h: newH });

  const buffer = await img.getBuffer(JimpMime.jpeg, { quality });
  const fs = require('fs');
  fs.writeFileSync(outputPath, buffer);
}

module.exports = { resizeAndSave };
