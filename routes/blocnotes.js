const express = require('express');
const router = express.Router();
const multer = require('multer');
const { encrypt, decrypt } = require('../data/crypto');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/', (req, res) => {
  res.render('projets/blocnotes', { title: 'Bloc-notes chiffré' });
});

router.post('/export-chiffre', express.json(), (req, res) => {
  const { contenu } = req.body;
  const encrypted = encrypt({ contenu, exporteLe: new Date().toISOString() });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="bloc_notes.pibody"`);
  res.send(encrypted);
});

router.post('/importer', upload.single('fichier'), (req, res) => {
  try {
    const content = req.file.buffer.toString('utf8');
    const data = decrypt(content);
    res.json({ success: true, contenu: data.contenu });
  } catch (err) {
    res.status(400).json({ error: 'Fichier invalide ou corrompu.' });
  }
});

module.exports = router;
