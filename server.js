require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const { init: initDb } = require('./data/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 6 * 1024 * 1024 }); // ~6MB pour couvrir 5Mo + overhead

const PORT = process.env.PORT || 8100;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && (!sessionSecret || /^(REMPLACER|REPLACE|CHANGE-MOI|YOUR_)/i.test(sessionSecret))) {
  throw new Error('SESSION_SECRET doit être configuré avec une valeur privée dans l’environnement de production.');
}
if (!sessionSecret) {
  console.warn('[SECURITY] SESSION_SECRET absent : valeur de développement temporaire utilisée.');
}

app.disable('x-powered-by');
// AlwaysData place généralement l’application derrière un proxy HTTPS.
app.set('trust proxy', 1);

// ---- Vue engine ----
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'partials/layout');

// ---- Middlewares ----
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// GSAP n’est chargé que sur l’accueil ; ses deux fichiers restent servis localement (aucun CDN requis).
app.use('/vendor/gsap', express.static(path.join(__dirname, 'node_modules', 'gsap', 'dist'), { etag: true, maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: true, lastModified: true }));
app.use(session({
  store: new FileStore({
    path: process.env.SESSION_STORE_PATH || path.join(__dirname, 'data', 'sessions'),
    ttl: 60 * 60 * 4,
    reapInterval: 60 * 60,
    retries: 0,
    logFn: () => {}
  }),
  secret: sessionSecret || 'dev-only-secret-change-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 4, // 4h
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  }
}));

// ---- Rendre io accessible dans les routes ----
app.set('io', io);

// ---- Routes ----
app.use('/', require('./routes/pages'));
app.use('/api/contact', require('./routes/contact'));
app.use('/projets/boutique', require('./routes/boutique'));
app.use('/projets/observatoire-benin', require('./routes/observatoire-benin'));
app.use('/projets/sondage', require('./routes/sondage'));
app.use('/projets/jeux', require('./routes/jeux'));
app.use('/projets/salons', require('./routes/salons'));
app.use('/projets/vote', require('./routes/vote'));
app.use('/projets/notes', require('./routes/notes'));
app.use('/projets/blocnotes', require('./routes/blocnotes'));
app.use('/projets/pibody-ia', require('./routes/pibody-ia'));
app.use('/projets/annonces', require('./routes/annonces'));
app.use('/api/pdf', require('./routes/pdf'));

// ---- Socket.IO : salons de discussion éphémères ----
require('./routes/salons-socket')(io);

// ---- 404 ----
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page introuvable' });
});

// ---- Démarrage : on attend que la DB (sql.js, WASM) soit prête avant d'écouter ----
initDb()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] Portfolio Elfried ZANNOU lancé sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[SERVER] Erreur fatale à l\'initialisation de la base de données :', err);
    process.exit(1);
  });
