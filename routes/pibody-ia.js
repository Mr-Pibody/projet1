const express = require('express');
const router = express.Router();
const { askCascade } = require('../data/ia-cascade');

const MAX_MESSAGE_LENGTH = 1200;
const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_REQUEST_LIMIT = 8;
const MAX_CHAT_BUCKETS = 2048;
const chatBuckets = new Map();

function consumeChatLimit(req, now = Date.now()) {
  const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
  let bucket = chatBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    if (!bucket && chatBuckets.size >= MAX_CHAT_BUCKETS) {
      const oldestKey = chatBuckets.keys().next().value;
      if (oldestKey !== undefined) chatBuckets.delete(oldestKey);
    }
    bucket = { count: 0, resetAt: now + CHAT_WINDOW_MS };
    chatBuckets.set(key, bucket);
  }

  if (bucket.count >= CHAT_REQUEST_LIMIT) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { allowed: true };
}

router.get('/', (req, res) => {
  res.render('projets/pibody-ia', { title: 'Pibody IA' });
});

router.post('/chat', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const rawMessage = req.body && req.body.message;

  if (typeof rawMessage !== 'string') {
    return res.status(400).json({ error: 'Le message doit être du texte.' });
  }
  const message = rawMessage.trim();
  if (!message) return res.status(400).json({ error: 'Message vide.' });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(413).json({ error: `Message trop long : ${MAX_MESSAGE_LENGTH} caractères maximum.` });
  }

  const limit = consumeChatLimit(req);
  if (!limit.allowed) {
    res.set('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Limite de tests atteinte. Réessaie dans un instant.' });
  }

  try {
    const { reply, provider } = await askCascade(message);
    res.json({ success: true, reply, provider });
  } catch (err) {
    res.status(503).json({ error: "Aucun fournisseur IA n’a pu répondre. Configure au moins une clé côté serveur (GROQ_API_KEY, GEMINI_API_KEY ou MISTRAL_API_KEY), puis réessaie." });
  }
});

module.exports = router;
