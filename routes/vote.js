const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../data/db');

function hashIp(ip) {
  const salt = process.env.SESSION_SECRET || 'sel-defaut';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function getCategories(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) return null;
  const seenNames = new Set();
  const categories = [];
  for (const item of input) {
    const nom = cleanText(item?.nom, 80);
    if (!nom || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 12) return null;
    const nameKey = nom.toLocaleLowerCase('fr');
    if (seenNames.has(nameKey)) return null;
    seenNames.add(nameKey);
    const options = item.options.map(option => cleanText(option, 80));
    if (options.some(option => !option)) return null;
    const optionKeys = options.map(option => option.toLocaleLowerCase('fr'));
    if (new Set(optionKeys).size !== optionKeys.length) return null;
    categories.push({ nom, options });
  }
  return categories;
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

router.get('/', (req, res) => {
  res.render('projets/vote', { title: 'Plateforme de vote' });
});

router.post('/creer', express.json({ limit: '64kb' }), (req, res) => {
  const titre = cleanText(req.body?.titre, 120);
  const categories = getCategories(req.body?.categories);
  if (!titre || !categories) {
    return res.status(400).json({ error: 'Ajoute un titre (120 caractères maximum) et 1 à 8 catégories avec 2 à 12 options chacune.' });
  }

  const code = uuidv4().slice(0, 8).toUpperCase();
  db.run(
    'INSERT INTO votes_evenements (titre, code, categories_json) VALUES (?, ?, ?)',
    [titre, code, JSON.stringify(categories)],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erreur lors de la création de l’événement.' });
      res.json({ success: true, code });
    }
  );
});

router.get('/evenement/:code', (req, res) => {
  const code = cleanText(req.params.code, 32);
  db.get('SELECT * FROM votes_evenements WHERE code = ?', [code], (err, event) => {
    if (err) return res.status(500).json({ error: 'Événement indisponible.' });
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });

    db.all('SELECT categorie, option_choisie, ip_hash FROM votes_bulletins WHERE evenement_id = ?', [event.id], (votesError, ballots) => {
      if (votesError) return res.status(500).json({ error: 'Résultats indisponibles.' });
      let categories;
      try { categories = JSON.parse(event.categories_json); }
      catch (error) { return res.status(500).json({ error: 'Configuration de l’événement invalide.' }); }
      const ipHash = hashIp(getClientIp(req));
      const resultats = categories.map(category => {
        const voteCounts = Object.fromEntries(category.options.map(option => [option, 0]));
        (ballots || []).forEach(ballot => {
          if (ballot.categorie === category.nom && Object.hasOwn(voteCounts, ballot.option_choisie)) {
            voteCounts[ballot.option_choisie] += 1;
          }
        });
        const dejaVote = (ballots || []).some(ballot => ballot.categorie === category.nom && ballot.ip_hash === ipHash);
        return { nom: category.nom, options: category.options, votes: voteCounts, dejaVote };
      });
      res.set('Cache-Control', 'no-store');
      res.json({ titre: event.titre, code: event.code, categories: resultats });
    });
  });
});

router.post('/evenement/:code/voter', express.json({ limit: '16kb' }), (req, res) => {
  const code = cleanText(req.params.code, 32);
  const categorie = cleanText(req.body?.categorie, 80);
  const option = cleanText(req.body?.option, 80);
  if (!categorie || !option) return res.status(400).json({ error: 'Catégorie ou option invalide.' });

  db.get('SELECT * FROM votes_evenements WHERE code = ?', [code], (err, event) => {
    if (err) return res.status(500).json({ error: 'Événement indisponible.' });
    if (!event) return res.status(404).json({ error: 'Événement introuvable.' });
    let categories;
    try { categories = JSON.parse(event.categories_json); }
    catch (error) { return res.status(500).json({ error: 'Configuration de l’événement invalide.' }); }
    const selectedCategory = categories.find(item => item.nom === categorie);
    if (!selectedCategory || !selectedCategory.options.includes(option)) {
      return res.status(400).json({ error: 'Cette option ne fait pas partie de l’événement.' });
    }

    const ipHash = hashIp(getClientIp(req));
    db.get(
      'SELECT id FROM votes_bulletins WHERE evenement_id = ? AND categorie = ? AND ip_hash = ?',
      [event.id, categorie, ipHash],
      (lookupError, existing) => {
        if (lookupError) return res.status(500).json({ error: 'Impossible de vérifier votre vote.' });
        if (existing) return res.status(403).json({ error: 'Vous avez déjà voté dans cette catégorie.' });

        db.run(
          'INSERT INTO votes_bulletins (evenement_id, categorie, option_choisie, ip_hash) VALUES (?, ?, ?, ?)',
          [event.id, categorie, option, ipHash],
          function (insertError) {
            if (insertError) return res.status(500).json({ error: 'Erreur lors de l’enregistrement du vote.' });
            res.json({ success: true });
          }
        );
      }
    );
  });
});

module.exports = router;
