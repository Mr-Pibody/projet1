const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resizeAndSave } = require('../data/image-utils');
const { db } = require('../data/db');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'annonces');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });

const COULEURS = ['#00f0c0', '#7c5cff', '#ff5c7a', '#ffd166', '#4cc9f0'];

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function safeLink(value) {
  const link = cleanText(value, 2000);
  if (!link) return '';
  try {
    const parsed = new URL(link);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch (error) {
    return null;
  }
}

router.get('/', (req, res) => {
  db.all('SELECT * FROM annonces ORDER BY cree_le DESC LIMIT 60', (err, rows) => {
    res.render('projets/annonces', { title: "Petites Annonces", annonces: rows || [] });
  });
});

router.post('/publier', upload.single('image'), async (req, res) => {
  try {
    const titre = cleanText(req.body?.titre, 100);
    const description = cleanText(req.body?.description, 500);
    const lien = safeLink(req.body?.lien);
    if (!titre) return res.status(400).json({ error: 'Titre requis (max 100 caractères).' });
    if (lien === null) return res.status(400).json({ error: 'Le lien doit utiliser une URL HTTP ou HTTPS valide.' });

    let imageName = null;
    if (req.file) {
      imageName = `annonce_${Date.now()}.jpg`;
      await resizeAndSave(req.file.buffer, path.join(UPLOAD_DIR, imageName), 800, 78);
    }

    const couleur = COULEURS[Math.floor(Math.random() * COULEURS.length)];

    db.run(
      'INSERT INTO annonces (titre, description, image, lien, couleur_accent) VALUES (?, ?, ?, ?, ?)',
      [titre, description || '', imageName, lien || '', couleur],
      function (err) {
        if (err) { console.error('[ANNONCES] Erreur SQL :', err); return res.status(500).json({ error: 'Erreur base de données.' }); }
        res.json({ success: true, id: this.lastID });
      }
    );
  } catch (err) {
    console.error('[ANNONCES] Erreur traitement :', err);
    res.status(500).json({ error: "Erreur lors du traitement de l'annonce." });
  }
});

module.exports = router;
