const express = require('express');
const router = express.Router();
const { db } = require('../data/db');

const SCORED_GAMES = new Set([
  'neon-runner', 'reaction-rapide', 'memory-grid', 'memory-xl',
  'pattern-breaker', 'quick-math', 'snake', 'quiz-ia',
  'mots-mele', 'mots-croises'
]);

router.get('/', (req, res) => {
  res.render('projets/jeux', { title: 'Arcade' });
});

const jeuxList = [
  'neon-runner', 'reaction', 'memory', 'memory-xl', 'pattern', 'quickmath', 'snake',
  'mots-mele', 'mots-croises'
];

jeuxList.forEach(slug => {
  router.get(`/${slug}`, (req, res) => {
    const gameTitle = slug === 'mots-mele' ? 'Mots mêlés' : slug === 'mots-croises' ? 'Mots croisés' : 'Arcade';
    res.render(`projets/jeux/${slug}`, { title: gameTitle });
  });
});

router.use('/quiz-ia', require('./quiz-ia'));

router.post('/score', express.json(), (req, res) => {
  const { jeu, pseudo, score } = req.body || {};
  if (!SCORED_GAMES.has(jeu) || typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0 || score > 10000000) {
    return res.status(400).json({ error: 'Score ou jeu invalide.' });
  }
  if (typeof pseudo !== 'string') return res.status(400).json({ error: 'Pseudo invalide.' });
  const pseudoClean = pseudo.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20);
  if (!pseudoClean) return res.status(400).json({ error: 'Le pseudo ne peut pas être vide.' });

  db.run(
    'INSERT INTO jeux_scores (jeu, pseudo, score) VALUES (?, ?, ?)',
    [jeu, pseudoClean, score],
    function (err) {
      if (err) return res.status(500).json({ error: 'Erreur base de données.' });
      res.json({ success: true });
    }
  );
});

router.get('/leaderboard/:jeu', (req, res) => {
  const { jeu } = req.params;
  if (!SCORED_GAMES.has(jeu)) return res.status(404).json({ error: 'Jeu introuvable.', scores: [] });
  const direction = jeu === 'reaction-rapide' ? 'ASC' : 'DESC';
  db.all(
    `SELECT pseudo, score, cree_le FROM jeux_scores WHERE jeu = ? ORDER BY score ${direction}, cree_le ASC LIMIT 10`,
    [jeu],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Classement indisponible.', scores: [] });
      res.json({ scores: rows || [] });
    }
  );
});

module.exports = router;
