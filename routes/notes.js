const express = require('express');
const router = express.Router();
const multer = require('multer');
const { encrypt, decrypt } = require('../data/crypto');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType } = require('docx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/', (req, res) => {
  res.render('projets/notes', { title: 'Gestion de notes élèves' });
});

function calculerMoyennesEtRangs(matieres, eleves) {
  // eleves = [{ nom, notes: { matiereId: note } }]
  const totalCoef = matieres.reduce((acc, m) => acc + (parseFloat(m.coef) || 1), 0);

  const resultats = eleves.map(eleve => {
    let sommePonderee = 0;
    matieres.forEach(m => {
      const note = parseFloat(eleve.notes[m.id]) || 0;
      sommePonderee += note * (parseFloat(m.coef) || 1);
    });
    const moyenne = totalCoef > 0 ? sommePonderee / totalCoef : 0;
    return { ...eleve, moyenne: Math.round(moyenne * 100) / 100 };
  });

  resultats.sort((a, b) => b.moyenne - a.moyenne);
  resultats.forEach((r, i) => { r.rang = i + 1; });
  return resultats;
}

// ---- Calculer (sans sauvegarder) ----
router.post('/calculer', express.json(), (req, res) => {
  const { matieres, eleves } = req.body;
  if (!matieres || !eleves) return res.status(400).json({ error: 'Données manquantes.' });
  const resultats = calculerMoyennesEtRangs(matieres, eleves);
  res.json({ success: true, resultats });
});

// ---- Export Word ----
router.post('/export-word', express.json(), async (req, res) => {
  const { titre, matieres, eleves } = req.body;
  const resultats = calculerMoyennesEtRangs(matieres, eleves);

  const headerCells = ['Rang', 'Élève', ...matieres.map(m => m.nom), 'Moyenne'].map(text =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] })
  );

  const rows = resultats.map(r => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph(String(r.rang))] }),
      new TableCell({ children: [new Paragraph(r.nom)] }),
      ...matieres.map(m => new TableCell({ children: [new Paragraph(String(r.notes[m.id] || '-'))] })),
      new TableCell({ children: [new Paragraph(String(r.moyenne))] })
    ]
  }));

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: titre || 'Bulletin de notes', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `Généré le ${new Date().toLocaleDateString('fr-FR')}`, spacing: { after: 300 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: headerCells }), ...rows]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${(titre || 'bulletin').replace(/\s+/g, '_')}.docx"`);
  res.send(buffer);
});

// ---- Export fichier chiffré (sauvegarde d'espace) ----
router.post('/export-chiffre', express.json(), (req, res) => {
  const { titre, matieres, eleves } = req.body;
  const encrypted = encrypt({ titre, matieres, eleves, exporteLe: new Date().toISOString() });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="espace_notes.pibody"`);
  res.send(encrypted);
});

// ---- Récupérer un espace depuis le fichier chiffré ----
router.post('/importer', upload.single('fichier'), (req, res) => {
  try {
    const content = req.file.buffer.toString('utf8');
    const data = decrypt(content);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(400).json({ error: 'Fichier invalide ou corrompu. Impossible de le déchiffrer.' });
  }
});

module.exports = router;
