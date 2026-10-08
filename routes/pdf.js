const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');

function sendPdf(res, filename, drawFn) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  drawFn(doc);
  doc.end();
}

// ---- Générateur de CV (Projet 6) ----
router.post('/cv', (req, res) => {
  const { nom, titre, email, telephone, resume, experiences, formations, competences } = req.body;

  sendPdf(res, `CV_${(nom || 'candidat').replace(/\s+/g, '_')}.pdf`, (doc) => {
    doc.fillColor('#0b6e5c').fontSize(26).text(nom || 'Nom Prénom', { align: 'left' });
    doc.fillColor('#333').fontSize(13).text(titre || '', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#555').text(`${email || ''}   ${telephone || ''}`);
    doc.moveDown(1);

    if (resume) {
      doc.fontSize(13).fillColor('#0b6e5c').text('PROFIL');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#0b6e5c').stroke();
      doc.moveDown(0.5);
      doc.fontSize(10.5).fillColor('#333').text(resume, { align: 'justify' });
      doc.moveDown(1);
    }

    if (experiences) {
      doc.fontSize(13).fillColor('#0b6e5c').text('EXPÉRIENCES');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#0b6e5c').stroke();
      doc.moveDown(0.5);
      doc.fontSize(10.5).fillColor('#333').text(experiences, { align: 'justify' });
      doc.moveDown(1);
    }

    if (formations) {
      doc.fontSize(13).fillColor('#0b6e5c').text('FORMATIONS');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#0b6e5c').stroke();
      doc.moveDown(0.5);
      doc.fontSize(10.5).fillColor('#333').text(formations, { align: 'justify' });
      doc.moveDown(1);
    }

    if (competences) {
      doc.fontSize(13).fillColor('#0b6e5c').text('COMPÉTENCES');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#0b6e5c').stroke();
      doc.moveDown(0.5);
      doc.fontSize(10.5).fillColor('#333').text(competences, { align: 'justify' });
    }
  });
});

// ---- Markdown -> PDF (Projet 8) ----
router.post('/markdown', (req, res) => {
  const { titre, contenu } = req.body;

  sendPdf(res, `${(titre || 'document').replace(/\s+/g, '_')}.pdf`, (doc) => {
    const lines = (contenu || '').split('\n');
    lines.forEach(line => {
      if (line.startsWith('# ')) { doc.fontSize(20).fillColor('#0b6e5c').text(line.replace('# ', '')); doc.moveDown(0.3); }
      else if (line.startsWith('## ')) { doc.fontSize(16).fillColor('#0b6e5c').text(line.replace('## ', '')); doc.moveDown(0.2); }
      else if (line.startsWith('### ')) { doc.fontSize(13).fillColor('#333').text(line.replace('### ', '')); doc.moveDown(0.2); }
      else if (line.startsWith('- ') || line.startsWith('* ')) { doc.fontSize(10.5).fillColor('#333').text('•  ' + line.slice(2)); }
      else if (line.trim() === '') { doc.moveDown(0.4); }
      else { doc.fontSize(10.5).fillColor('#333').text(line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1'), { align: 'justify' }); }
    });
  });
});

// ---- Facture / Devis (Projet 17) ----
router.post('/facture', (req, res) => {
  const { type, numero, clientNom, clientAdresse, lignes, tva } = req.body;
  const items = Array.isArray(lignes) ? lignes : JSON.parse(lignes || '[]');

  sendPdf(res, `${type || 'facture'}_${numero || '001'}.pdf`, (doc) => {
    doc.fontSize(22).fillColor('#0b6e5c').text((type || 'FACTURE').toUpperCase());
    doc.fontSize(10).fillColor('#555').text(`N° ${numero || '001'}`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text(`Date : ${new Date().toLocaleDateString('fr-FR')}`);
    doc.moveDown(1);

    doc.fontSize(11).fillColor('#333').text('Client :', { continued: false });
    doc.fontSize(10.5).fillColor('#555').text(clientNom || '');
    doc.text(clientAdresse || '');
    doc.moveDown(1.5);

    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#fff');
    doc.rect(50, tableTop, 495, 22).fill('#0b6e5c');
    doc.fillColor('#fff').text('Désignation', 58, tableTop + 6, { width: 250 });
    doc.text('Qté', 320, tableTop + 6, { width: 50 });
    doc.text('Prix unit.', 380, tableTop + 6, { width: 70 });
    doc.text('Total', 460, tableTop + 6, { width: 75 });

    let y = tableTop + 22;
    let totalHT = 0;
    items.forEach((item, i) => {
      const qte = parseFloat(item.quantite) || 0;
      const prix = parseFloat(item.prix) || 0;
      const lineTotal = qte * prix;
      totalHT += lineTotal;

      doc.rect(50, y, 495, 22).fillAndStroke(i % 2 === 0 ? '#f4f6fb' : '#ffffff', '#e0e0e0');
      doc.fillColor('#333').fontSize(9.5);
      doc.text(item.designation || '', 58, y + 6, { width: 250 });
      doc.text(String(qte), 320, y + 6, { width: 50 });
      doc.text(prix.toFixed(2) + ' €', 380, y + 6, { width: 70 });
      doc.text(lineTotal.toFixed(2) + ' €', 460, y + 6, { width: 75 });
      y += 22;
    });

    const tvaRate = parseFloat(tva) || 0;
    const tvaAmount = totalHT * (tvaRate / 100);
    const totalTTC = totalHT + tvaAmount;

    y += 14;
    doc.fontSize(10).fillColor('#333');
    doc.text(`Total HT : ${totalHT.toFixed(2)} €`, 350, y, { width: 195, align: 'right' });
    y += 16;
    doc.text(`TVA (${tvaRate}%) : ${tvaAmount.toFixed(2)} €`, 350, y, { width: 195, align: 'right' });
    y += 16;
    doc.fontSize(12).fillColor('#0b6e5c').text(`Total TTC : ${totalTTC.toFixed(2)} €`, 350, y, { width: 195, align: 'right' });
  });
});

module.exports = router;
