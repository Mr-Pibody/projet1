const express = require('express');
const router = express.Router();
const { askCascade } = require('../data/ia-cascade');

router.get('/', (req, res) => {
  res.render('projets/jeux/quiz-ia', { title: 'Quiz IA' });
});

function buildPrompt(categorie, type) {
  if (type === 'qcm') {
    return `Génère UNE question de culture générale sur le thème "${categorie}", avec 4 propositions de réponse dont une seule est correcte. Réponds UNIQUEMENT en JSON valide, sans aucun texte autour, sans balises markdown, exactement sous cette forme : {"question":"...","options":["...","...","...","..."],"bonneReponse":"..."} où "bonneReponse" doit être copié EXACTEMENT comme une des 4 options.`;
  }
  return `Génère UNE question de culture générale sur le thème "${categorie}", à laquelle on répond par un mot ou une courte expression précise (pas de QCM). Réponds UNIQUEMENT en JSON valide, sans aucun texte autour, sans balises markdown, exactement sous cette forme : {"question":"...","reponse":"..."}`;
}

function extractJson(text) {
  // Les IA ajoutent parfois des balises ```json autour, ou du texte avant/après — on extrait le premier bloc { ... }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Pas de JSON trouvé dans la réponse IA.');
  return JSON.parse(match[0]);
}

router.post('/question', express.json(), async (req, res) => {
  const { categorie } = req.body;
  if (!categorie) return res.status(400).json({ error: 'Catégorie manquante.' });

  // Alterne aléatoirement entre QCM et réponse libre, comme demandé
  const type = Math.random() < 0.6 ? 'qcm' : 'libre';

  try {
    const { reply } = await askCascade(buildPrompt(categorie, type));
    const parsed = extractJson(reply);

    if (type === 'qcm') {
      if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length !== 4 || !parsed.bonneReponse) {
        throw new Error('Format QCM invalide reçu de l\'IA.');
      }
      res.json({ success: true, type: 'qcm', question: parsed.question, options: parsed.options, bonneReponse: parsed.bonneReponse });
    } else {
      if (!parsed.question || !parsed.reponse) throw new Error('Format libre invalide reçu de l\'IA.');
      res.json({ success: true, type: 'libre', question: parsed.question, reponse: parsed.reponse });
    }
  } catch (err) {
    console.error('[QUIZ-IA] Erreur génération question :', err.message);
    res.status(503).json({ error: "Impossible de générer une question pour le moment (IA indisponible ou clé API manquante). Configure GROQ_API_KEY, GEMINI_API_KEY ou MISTRAL_API_KEY." });
  }
});

module.exports = router;
