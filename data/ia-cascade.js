// Cascade réelle de fournisseurs (Groq -> Gemini -> Mistral), utilisée par Pibody IA et le Quiz IA.
// Un fournisseur est tenté à la fois ; au premier succès, les suivants ne sont pas appelés.
const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 800;

function requestSignal() {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

function nonEmptyText(value, provider) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Réponse vide de ${provider}`);
  }
  return value.trim();
}

async function callGroq(message) {
  if (!process.env.GROQ_API_KEY) throw new Error('Groq non configuré');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: message }],
      max_tokens: MAX_OUTPUT_TOKENS
    }),
    signal: requestSignal()
  });
  if (!response.ok) throw new Error('Erreur Groq');
  const data = await response.json();
  return nonEmptyText(data?.choices?.[0]?.message?.content, 'Groq');
}

async function callGemini(message) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Gemini non configuré');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: message }] }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS }
    }),
    signal: requestSignal()
  });
  if (!response.ok) throw new Error('Erreur Gemini');
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
  return nonEmptyText(text, 'Gemini');
}

async function callMistral(message) {
  if (!process.env.MISTRAL_API_KEY) throw new Error('Mistral non configuré');
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}` },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: message }],
      max_tokens: MAX_OUTPUT_TOKENS
    }),
    signal: requestSignal()
  });
  if (!response.ok) throw new Error('Erreur Mistral');
  const data = await response.json();
  return nonEmptyText(data?.choices?.[0]?.message?.content, 'Mistral');
}

async function askCascade(message) {
  const providers = [
    { name: 'Groq', fn: callGroq },
    { name: 'Gemini', fn: callGemini },
    { name: 'Mistral', fn: callMistral }
  ];

  for (const provider of providers) {
    try {
      const reply = await provider.fn(message);
      return { reply, provider: provider.name };
    } catch (err) {
      console.warn(`[IA-CASCADE] ${provider.name} a échoué :`, err.message);
    }
  }
  throw new Error('Toutes les tentatives de la cascade ont échoué.');
}

module.exports = { askCascade };
