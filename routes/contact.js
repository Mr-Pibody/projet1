const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

router.post('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const nom = typeof body.nom === 'string' ? body.nom.trim().replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 120) : '';
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : '';

  if (!nom || !email || !message) {
    return res.status(400).json({ success: false, error: 'Tous les champs sont requis.' });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ success: false, error: 'Veuillez saisir une adresse e-mail valide.' });
  }
  if (message.length < 10) {
    return res.status(400).json({ success: false, error: 'Le message doit contenir au moins 10 caractères.' });
  }

  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const password = process.env.EMAIL_PASSWORD;
  const port = Number.parseInt(process.env.EMAIL_PORT || '587', 10);
  if (!host || !user || !password || !Number.isInteger(port)) {
    console.error('[CONTACT] Configuration SMTP incomplète.');
    return res.status(503).json({ success: false, error: "Le formulaire n'est pas disponible pour le moment. Contactez-moi directement par e-mail." });
  }

  try {
    // On conserve le transport SMTP/Nodemailer déjà utilisé par le portfolio.
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password }
    });

    const safeName = escapeHtml(nom);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
    const subjectName = nom.replace(/[\r\n]/g, ' ').slice(0, 120);

    await transporter.sendMail({
      from: `"Portfolio Elfried ZANNOU" <${user}>`,
      to: process.env.EMAIL_TO || user,
      replyTo: email,
      subject: `Nouveau message de ${subjectName} via le portfolio`,
      text: `Nom: ${nom}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
        <h2>Nouveau message depuis le portfolio</h2>
        <p><strong>Nom :</strong> ${safeName}</p>
        <p><strong>Email :</strong> ${safeEmail}</p>
        <p><strong>Message :</strong></p>
        <p>${safeMessage}</p>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[CONTACT] Erreur envoi mail :', err.message);
    res.status(500).json({ success: false, error: "L'envoi a échoué. Réessayez plus tard ou contactez-moi directement." });
  }
});

module.exports = router;
