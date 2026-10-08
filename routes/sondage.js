const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../data/db');

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function normalizeQuestions(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12) return null;
  const questions = [];
  for (const question of input) {
    const texte = cleanText(question?.texte, 240);
    const type = question?.type;
    if (!texte || !['choix', 'echelle', 'texte'].includes(type)) return null;
    let options = [];
    if (type === 'choix') {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 12) return null;
      options = question.options.map(option => cleanText(option, 100));
      if (options.some(option => !option)) return null;
      if (new Set(options.map(option => option.toLocaleLowerCase('fr'))).size !== options.length) return null;
    } else if (type === 'echelle') {
      options = ['1', '2', '3', '4', '5'];
    }
    questions.push({ texte, type, options });
  }
  return questions;
}

function readQuestions(row) {
  try {
    const questions = JSON.parse(row.questions_json);
    return Array.isArray(questions) ? questions : null;
  } catch (error) {
    return null;
  }
}

function validateResponses(questions, responses) {
  if (!Array.isArray(responses) || responses.length !== questions.length) return null;
  const cleaned = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const answer = responses[index];
    if (question.type === 'texte') {
      const value = cleanText(answer, 1000);
      if (!value) return null;
      cleaned.push(value);
    } else {
      const value = typeof answer === 'string' ? answer.trim() : '';
      if (!question.options.includes(value)) return null;
      cleaned.push(value);
    }
  }
  return cleaned;
}

router.get('/', (req, res) => {
  res.render('projets/sondage', { title: "Questionnaire d'enquête" });
});

router.get('/repondre/:code', (req, res) => {
  db.get('SELECT * FROM sondages WHERE code = ?', [req.params.code], (err, survey) => {
    if (err) return res.status(500).render('404', { title: 'Sondage indisponible' });
    if (!survey) return res.status(404).render('404', { title: 'Sondage introuvable' });
    const questions = readQuestions(survey);
    if (!questions) return res.status(500).render('404', { title: 'Questionnaire invalide' });
    res.render('projets/sondage-repondre', { title: survey.titre, sondage: { ...survey, questions } });
  });
});

router.get('/resultats/:code', (req, res) => {
  db.get('SELECT * FROM sondages WHERE code = ?', [req.params.code], (err, survey) => {
    if (err) return res.status(500).render('404', { title: 'Sondage indisponible' });
    if (!survey) return res.status(404).render('404', { title: 'Sondage introuvable' });
    const questions = readQuestions(survey);
    if (!questions) return res.status(500).render('404', { title: 'Questionnaire invalide' });
    res.render('projets/sondage-resultats', { title: survey.titre, sondage: { ...survey, questions } });
  });
});

router.post('/creer', express.json({ limit: '64kb' }), (req, res) => {
  const titre = cleanText(req.body?.titre, 120);
  const questions = normalizeQuestions(req.body?.questions);
  if (!titre || !questions) {
    return res.status(400).json({ error: 'Ajoute un titre (120 caractères maximum) et 1 à 12 questions valides.' });
  }
  const code = uuidv4().slice(0, 8).toUpperCase();
  db.run('INSERT INTO sondages (titre, code, questions_json) VALUES (?, ?, ?)', [titre, code, JSON.stringify(questions)], function (err) {
    if (err) return res.status(500).json({ error: 'Erreur lors de la création du sondage.' });
    res.json({ success: true, code });
  });
});

router.post('/repondre/:code', express.json({ limit: '64kb' }), (req, res) => {
  db.get('SELECT * FROM sondages WHERE code = ?', [req.params.code], (err, survey) => {
    if (err) return res.status(500).json({ error: 'Sondage indisponible.' });
    if (!survey) return res.status(404).json({ error: 'Sondage introuvable.' });
    const questions = readQuestions(survey);
    const responses = validateResponses(questions || [], req.body?.reponses);
    if (!questions || !responses) return res.status(400).json({ error: 'Les réponses ne correspondent pas aux questions.' });

    db.run('INSERT INTO sondages_reponses (sondage_id, reponses_json) VALUES (?, ?)', [survey.id, JSON.stringify(responses)], function (insertError) {
      if (insertError) return res.status(500).json({ error: 'Erreur lors de l’enregistrement.' });
      const io = req.app.get('io');
      if (io) io.to(`sondage-${req.params.code}`).emit('nouvelle-reponse');
      res.json({ success: true });
    });
  });
});

router.get('/api/resultats/:code', (req, res) => {
  db.get('SELECT id, questions_json FROM sondages WHERE code = ?', [req.params.code], (err, survey) => {
    if (err) return res.status(500).json({ error: 'Résultats indisponibles.' });
    if (!survey) return res.status(404).json({ error: 'Sondage introuvable.' });
    const questions = readQuestions(survey);
    if (!questions) return res.status(500).json({ error: 'Questionnaire invalide.' });

    db.all('SELECT reponses_json FROM sondages_reponses WHERE sondage_id = ?', [survey.id], (responseError, rows) => {
      if (responseError) return res.status(500).json({ error: 'Résultats indisponibles.' });
      const allResponses = [];
      for (const row of rows || []) {
        try {
          const parsed = JSON.parse(row.reponses_json);
          if (Array.isArray(parsed)) allResponses.push(parsed);
        } catch (error) { /* Ignore les lignes historiques endommagées sans faire tomber le rapport. */ }
      }

      const resultats = questions.map((question, questionIndex) => {
        if (question.type === 'texte') {
          return { question: question.texte, type: 'texte', reponses: allResponses.map(response => response[questionIndex]).filter(value => typeof value === 'string' && value) };
        }
        const counts = Object.fromEntries(question.options.map(option => [option, 0]));
        allResponses.forEach(response => {
          const value = response[questionIndex];
          if (Object.hasOwn(counts, value)) counts[value] += 1;
        });
        return { question: question.texte, type: question.type, counts };
      });

      res.set('Cache-Control', 'no-store');
      res.json({ totalReponses: allResponses.length, resultats });
    });
  });
});

module.exports = router;
