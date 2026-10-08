const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const wordGames = require('../public/js/word-games-engine');
const initSqlJs = require('sql.js');
const observatoryRouter = require('../routes/observatoire-benin');

const projectRoot = path.resolve(__dirname, '..');
let serverProcess;
let baseUrl;
let tempDir;
let logs = '';
let smtpServer;
let smtpPort;
let capturedMail = '';

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function startFakeSmtp() {
  smtpServer = net.createServer(socket => {
    let buffer = '';
    let inData = false;
    let authStage = 0;
    socket.write('220 local-test ESMTP ready\r\n');

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      while (buffer.length) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          capturedMail += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write('250 2.0.0 message accepted\r\n');
          continue;
        }

        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd < 0) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const command = line.toUpperCase();

        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-local-test\r\n250-AUTH PLAIN LOGIN\r\n250-SIZE 10485760\r\n250 8BITMIME\r\n');
        } else if (command.startsWith('AUTH PLAIN')) {
          socket.write('235 2.7.0 authentication successful\r\n');
        } else if (command === 'AUTH LOGIN') {
          authStage = 1;
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (authStage === 1) {
          authStage = 2;
          socket.write('334 UGFzc3dvcmQ6\r\n');
        } else if (authStage === 2) {
          authStage = 0;
          socket.write('235 2.7.0 authentication successful\r\n');
        } else if (command.startsWith('MAIL FROM:') || command.startsWith('RCPT TO:')) {
          socket.write('250 2.1.0 ok\r\n');
        } else if (command === 'DATA') {
          inData = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (command === 'RSET' || command === 'NOOP') {
          socket.write('250 2.0.0 ok\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 2.0.0 bye\r\n');
          socket.end();
        } else {
          socket.write('250 2.0.0 ok\r\n');
        }
      }
    });
  });

  return new Promise((resolve, reject) => {
    smtpServer.once('error', reject);
    smtpServer.listen(0, '127.0.0.1', () => {
      smtpPort = smtpServer.address().port;
      resolve();
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Le serveur a quitté prématurément.\n${logs}`);
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch (error) { /* Le serveur est encore en démarrage. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Le serveur n’a pas démarré dans le délai.\n${logs}`);
}

before(async () => {
  const port = await reservePort();
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'portfolio-pibody-test-'));
  const databasePath = path.join(tempDir, 'portfolio.sqlite');
  const SQL = await initSqlJs();
  const legacyDatabase = new SQL.Database();
  legacyDatabase.run(`CREATE TABLE boutique_produits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    description TEXT,
    prix REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    image TEXT,
    whatsapp_numero TEXT,
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  legacyDatabase.run(`INSERT INTO boutique_produits (nom, description, prix, stock, whatsapp_numero)
    VALUES ('Article de test conservé', 'Fiche héritée utilisée pour vérifier la migration additive.', 12500, 4, '')`);
  legacyDatabase.run(`INSERT INTO boutique_produits (nom, description, prix, stock, whatsapp_numero)
    VALUES ('[DÉMO] Sac de travail Kora', 'Exemple fictif de produit pour tester le catalogue. Aucune commande réelle n’est activée.', 7500, 8, '')`);
  legacyDatabase.run(`CREATE TABLE annonces (
    id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, description TEXT, image TEXT, lien TEXT,
    couleur_accent TEXT DEFAULT '#00f0c0', cree_le DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  legacyDatabase.run(`INSERT INTO annonces (titre, description, lien, couleur_accent)
    VALUES ('[DÉMO] Atelier découverte du développement web', 'Annonce fictive pour présenter le formulaire de publication et les cartes du catalogue. Aucun événement réel n’est annoncé.', '', '#a8c99a')`);
  legacyDatabase.run(`CREATE TABLE sondages (id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, code TEXT UNIQUE NOT NULL, questions_json TEXT NOT NULL, cree_le DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  legacyDatabase.run(`CREATE TABLE sondages_reponses (id INTEGER PRIMARY KEY AUTOINCREMENT, sondage_id INTEGER NOT NULL, reponses_json TEXT NOT NULL, cree_le DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  legacyDatabase.run(`INSERT INTO sondages (titre, code, questions_json) VALUES ('DÉMO — Vos préférences numériques', 'DEMOIA01', '[]')`);
  legacyDatabase.run(`CREATE TABLE votes_evenements (id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, code TEXT UNIQUE NOT NULL, categories_json TEXT NOT NULL, cree_le DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  legacyDatabase.run(`CREATE TABLE votes_bulletins (id INTEGER PRIMARY KEY AUTOINCREMENT, evenement_id INTEGER NOT NULL, categorie TEXT NOT NULL, option_choisie TEXT NOT NULL, ip_hash TEXT NOT NULL, cree_le DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  legacyDatabase.run(`INSERT INTO votes_evenements (titre, code, categories_json) VALUES ('DÉMO — Choisir un thème numérique', 'DEMOEV01', '[]')`);
  await writeFile(databasePath, Buffer.from(legacyDatabase.export()));
  legacyDatabase.close();
  await startFakeSmtp();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SESSION_SECRET: 'smoke-test-session-secret-not-for-production',
      ENCRYPTION_SECRET: 'smoke-test-encryption-secret-not-for-production',
      ADMIN_PASSWORD_BOUTIQUE: 'test-boutique-password',
      ADMIN_PASSWORD_ECOMMERCE: 'test-ecommerce-password',
      ADMIN_PASSWORD_RESTAURANT: 'test-restaurant-password',
      EMAIL_HOST: '127.0.0.1',
      EMAIL_PORT: String(smtpPort),
      EMAIL_USER: 'portfolio@local.test',
      EMAIL_PASSWORD: 'smtp-test-password',
      EMAIL_TO: 'owner@local.test',
      GROQ_API_KEY: '',
      GEMINI_API_KEY: '',
      MISTRAL_API_KEY: '',
      PORTFOLIO_DB_PATH: databasePath,
      SESSION_STORE_PATH: path.join(tempDir, 'sessions')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', chunk => { logs += chunk.toString(); });
  serverProcess.stderr.on('data', chunk => { logs += chunk.toString(); });
  await waitForServer(`${baseUrl}/`, serverProcess);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => {
      const timer = setTimeout(() => { serverProcess.kill('SIGKILL'); resolve(); }, 2500);
      serverProcess.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  if (smtpServer) await new Promise(resolve => smtpServer.close(() => resolve()));
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test('la page d’accueil expose le positionnement IA et la navigation', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Explorer l’IA/);
  assert.match(html, /Pibody IA/);
  assert.match(html, /href="\/projets\/jeux\/mots-mele"/);
  assert.match(html, /href="\/projets\/jeux\/mots-croises"/);
  assert.match(html, /hero-signal-card/);
  assert.match(html, /data-system-story/);
  assert.match(html, /class="portfolio-story system-story-layout"/);
  assert.equal((html.match(/data-system-macro=/g) || []).length, 3);
  assert.equal((html.match(/data-system-segment/g) || []).length, 3);
  assert.match(html, /Groq en premier/);
  assert.match(html, /Gemini n’est appelé qu’en cas d’échec/);
  assert.match(html, /Mistral n’intervient que si Gemini échoue/);
  assert.match(html, /ILLUSTRATION · PAS UNE CAPTURE/);
  assert.match(html, /data-system-path/);
  assert.match(html, /data-system-camera/);
  assert.match(html, /data-route="gemini"/);
  const storyStart = html.indexOf('<section class="section-pad system-story-section"');
  const storyEnd = html.indexOf('</section>', storyStart);
  assert.ok(storyStart >= 0 && storyEnd > storyStart, 'le récit doit former une section complète');
  const storyMarkup = html.slice(storyStart, storyEnd);
  assert.doesNotMatch(storyMarkup, /projet_ecommerce\.jpg|<img\b/i, 'la scène Construire ne doit plus reposer sur une capture latérale');
  assert.match(html, /src="\/js\/system-story\.js"/);
  assert.doesNotMatch(html, /src="\/vendor\/gsap\//, 'GSAP doit être chargé progressivement près du récit');
  assert.match(html, /id="home-ai-form"/);
  assert.match(html, /Aucun résultat n’est simulé/);
  assert.match(html, /Observatoire du numérique/);
  assert.match(html, /id="primary-navigation"/);
  assert.match(html, /id="contact-form"/);
});

test('les bundles GSAP du récit sont servis localement depuis Node', async () => {
  for (const asset of ['gsap.min.js', 'ScrollTrigger.min.js']) {
    const response = await fetch(`${baseUrl}/vendor/gsap/${asset}`);
    assert.equal(response.status, 200, `${asset} devrait être servi en local`);
    assert.match(response.headers.get('content-type') || '', /javascript/);
    assert.ok((await response.text()).length > 1000, `${asset} ne devrait pas être vide`);
  }
});

test('la cascade Pibody valide les messages, ne simule pas de réponse et limite les appels', async () => {
  const endpoint = `${baseUrl}/projets/pibody-ia/chat`;
  const invalid = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 42 })
  });
  assert.equal(invalid.status, 400);

  const tooLong = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'x'.repeat(1201) })
  });
  assert.equal(tooLong.status, 413);

  // Les clés sont vides dans ce processus de test : une question valide doit produire
  // un état d’indisponibilité réel, jamais une réponse de démonstration.
  for (let index = 0; index < 8; index += 1) {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Question de test ${index + 1}` })
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /Aucun fournisseur IA n’a pu répondre/);
  }

  const limited = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Question après la limite' })
  });
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get('retry-after') || '', /^\d+$/);
});

test('les routes des projets existants et de l’observatoire répondent toujours', async () => {
  const paths = [
    '/projets/algo-executeur', '/projets/carte', '/projets/panorama-web',
    '/projets/cv-generator', '/projets/convertisseur', '/projets/markdown',
    '/projets/pomodoro', '/projets/qrcode', '/projets/horloge',
    '/projets/calculatrice', '/projets/facture', '/projets/boutique',
    '/projets/boutique/ecommerce', '/projets/boutique/restaurant',
    '/projets/boutique/gestion-privee-pibody', '/projets/observatoire-benin', '/projets/sondage',
    '/projets/vote', '/projets/jeux', '/projets/jeux/quiz-ia',
    '/projets/jeux/mots-mele', '/projets/jeux/mots-croises',
    '/projets/salons', '/projets/salons/SMOKE01', '/projets/notes',
    '/projets/blocnotes', '/projets/pibody-ia', '/projets/annonces'
  ];
  for (const route of paths) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} devrait répondre 200`);
  }
});

test('les deux nouveaux jeux servent une interface et leurs scripts locaux', async () => {
  const wordSearch = await fetch(`${baseUrl}/projets/jeux/mots-mele`);
  const wordSearchHtml = await wordSearch.text();
  assert.equal(wordSearch.status, 200);
  assert.match(wordSearchHtml, /Mots mêlés/i);
  assert.match(wordSearchHtml, /id="wordGrid"/);

  const crossword = await fetch(`${baseUrl}/projets/jeux/mots-croises`);
  const crosswordHtml = await crossword.text();
  assert.equal(crossword.status, 200);
  assert.match(crosswordHtml, /Mots croisés/i);
  assert.match(crosswordHtml, /id="crosswordGrid"/);

  for (const asset of ['/js/word-games-engine.js', '/js/mots-mele.js', '/js/mots-croises.js']) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert.equal(response.status, 200, `${asset} devrait être servi localement`);
  }
});

test('le moteur construit des mots mêlés valides et une grille de mots croisés cohérente', () => {
  let seed = 1207;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const generated = wordGames.generateWordSearch(['ALGORITHME', 'SERVEUR', 'DONNEES', 'API'], 12, random);
  for (const placement of generated.placements) {
    assert.equal(wordGames.readLine(generated.grid, placement.path), placement.word);
  }
  assert.equal(wordGames.normalizeTerm('Données'), 'DONNEES');

  const crossword = wordGames.createCrossword();
  assert.equal(crossword.entries.length, 8);
  const crossingCells = crossword.grid.flat().filter(cell => cell.entries.length > 1);
  assert.ok(crossingCells.length >= 8, 'les entrées doivent réellement se croiser');
  for (const entry of crossword.entries) {
    const letters = entry.cells.map(({ row, col }) => crossword.grid[row][col].letter).join('');
    assert.equal(letters, entry.answer, `${entry.number}${entry.direction} doit correspondre à sa définition`);
  }
});

test('les ressources locales et le CV sont servis', async () => {
  for (const resource of ['/css/home.css', '/css/system-story.css', '/css/responsive.css', '/css/immersive.css', '/js/system-story.js', '/js/observatoire-benin.js', '/js/arcade-progress.js', '/js/leaderboard.js', '/favicon.svg', '/robots.txt', '/sitemap.xml', '/docs/CV_ZANNOU_Elfried.pdf']) {
    const response = await fetch(`${baseUrl}${resource}`);
    assert.equal(response.status, 200, `${resource} devrait répondre 200`);
  }
});

test('les catalogues n’ajoutent pas de contenu fictif et la migration conserve les fiches héritées', async () => {
  const catalogResponse = await fetch(`${baseUrl}/projets/boutique`);
  const catalogHtml = await catalogResponse.text();
  assert.equal(catalogResponse.status, 200);
  assert.match(catalogHtml, /Article de test conservé/);
  assert.match(catalogHtml, /Autres/);
  assert.match(catalogHtml, /catalogueSearch/);
  assert.doesNotMatch(catalogHtml, /\[DÉMO\]|DEMOIA01|DEMOEV01/i);

  for (const route of ['/projets/boutique/ecommerce', '/projets/boutique/restaurant']) {
    const response = await fetch(`${baseUrl}${route}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Aucun (produit|plat) publié/);
    assert.doesNotMatch(html, /\[DÉMO\]|DEMOIA01|DEMOEV01/i);
  }

  const announcements = await (await fetch(`${baseUrl}/projets/annonces`)).text();
  assert.match(announcements, /Aucune annonce publiée/);
  assert.doesNotMatch(announcements, /Exemple fictif|\[DÉMO\]/i);
  const surveyPage = await (await fetch(`${baseUrl}/projets/sondage`)).text();
  const votePage = await (await fetch(`${baseUrl}/projets/vote`)).text();
  assert.doesNotMatch(surveyPage, /DEMOIA01|\[DÉMO\]/i);
  assert.doesNotMatch(votePage, /DEMOEV01|\[DÉMO\]/i);

  const removedSurvey = await fetch(`${baseUrl}/projets/sondage/api/resultats/DEMOIA01`);
  const removedEvent = await fetch(`${baseUrl}/projets/vote/evenement/DEMOEV01`);
  assert.equal(removedSurvey.status, 404);
  assert.equal(removedEvent.status, 404);
});

test('l’observatoire ignore les observations nulles sans les convertir en zéros', () => {
  const points = observatoryRouter.normalizeObservations([
    { date: '2025', value: null },
    { date: '2024', value: 33.98 },
    { date: '2023', value: '' },
    { date: '2022', value: '0' },
    { date: '2021', value: 'non numérique' }
  ]);
  assert.deepEqual(points, [{ year: 2022, value: 0 }, { year: 2024, value: 33.98 }]);
});

test('la page Observatoire crédite les séries publiques et explique leur portée', async () => {
  const response = await fetch(`${baseUrl}/projets/observatoire-benin`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /IT\.NET\.USER\.ZS/);
  assert.match(html, /IT\.CEL\.SETS\.P2/);
  assert.match(html, /IT\.NET\.BBND\.P2/);
  assert.match(html, /Banque mondiale/);
  assert.match(html, /pas spécifique à Cotonou/);
  assert.match(html, /observatoire-benin\.js/);
});

test('un événement de vote créé par l’utilisateur collecte uniquement les votes soumis', async () => {
  const created = await fetch(`${baseUrl}/projets/vote/creer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titre: 'Vote de test', categories: [{ nom: 'Choix', options: ['A', 'B'] }] })
  });
  const createdBody = await created.json();
  assert.equal(created.status, 200);
  assert.equal(createdBody.success, true);

  const eventResponse = await fetch(`${baseUrl}/projets/vote/evenement/${createdBody.code}`);
  const event = await eventResponse.json();
  assert.equal(eventResponse.status, 200);
  assert.equal(event.categories[0].votes.A, 0);

  const saved = await fetch(`${baseUrl}/projets/vote/evenement/${createdBody.code}/voter`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categorie: 'Choix', option: 'B' })
  });
  assert.equal(saved.status, 200);
  const updated = await (await fetch(`${baseUrl}/projets/vote/evenement/${createdBody.code}`)).json();
  assert.equal(updated.categories[0].votes.B, 1);
  assert.equal(updated.categories[0].dejaVote, true);
});

test('les nouveaux jeux enregistrent un score et les slugs non reconnus sont refusés', async () => {
  const saved = await fetch(`${baseUrl}/projets/jeux/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jeu: 'mots-mele', pseudo: 'Elfried-test', score: 350 })
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).success, true);

  const leaderboard = await fetch(`${baseUrl}/projets/jeux/leaderboard/mots-mele`);
  const leaderboardData = await leaderboard.json();
  assert.equal(leaderboardData.scores[0].pseudo, 'Elfried-test');
  assert.equal(leaderboardData.scores[0].score, 350);

  const rejected = await fetch(`${baseUrl}/projets/jeux/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jeu: 'inconnu', pseudo: '<script>', score: 12 })
  });
  assert.equal(rejected.status, 400);
});

test('le cycle création/réponse d’un sondage utilise la base persistante', async () => {
  const created = await fetch(`${baseUrl}/projets/sondage/creer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titre: 'Test de validation',
      questions: [{ texte: 'Choix ?', type: 'choix', options: ['A', 'B'] }]
    })
  });
  const createdBody = await created.json();
  assert.equal(created.status, 200);
  assert.equal(createdBody.success, true);
  assert.equal(typeof createdBody.code, 'string');

  const responsePage = await fetch(`${baseUrl}/projets/sondage/repondre/${createdBody.code}`);
  assert.equal(responsePage.status, 200);

  const submitted = await fetch(`${baseUrl}/projets/sondage/repondre/${createdBody.code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reponses: ['A'] })
  });
  assert.equal(submitted.status, 200);
  assert.equal((await submitted.json()).success, true);

  const results = await fetch(`${baseUrl}/projets/sondage/api/resultats/${createdBody.code}`);
  const resultsBody = await results.json();
  assert.equal(results.status, 200);
  assert.equal(resultsBody.totalReponses, 1);
  assert.equal(resultsBody.resultats[0].counts.A, 1);
});

test('le formulaire rejette les messages incomplets sans contacter SMTP', async () => {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: '', email: '', message: '' })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

test('un envoi valide utilise Nodemailer et échappe le HTML du message', async () => {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nom: '<script>alert("x")</script>',
      email: 'sender@example.org',
      message: 'Bonjour <img src=x onerror=alert(1)>\nTest du formulaire.'
    })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(capturedMail, /Nouveau message/);
  const htmlStart = capturedMail.toLowerCase().indexOf('content-type: text/html');
  assert.notEqual(htmlStart, -1, 'Le message doit contenir une partie HTML.');
  const htmlPart = capturedMail.slice(htmlStart);
  assert.match(htmlPart, /&lt;script&gt;/);
  assert.match(htmlPart, /&lt;img/);
  assert.doesNotMatch(htmlPart, /<script/);
  assert.doesNotMatch(htmlPart, /<img\s/);
});

test('la connexion admin et sa session persistent sur les pages du catalogue', async () => {
  const login = await fetch(`${baseUrl}/projets/boutique/gestion-privee-pibody/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'boutique', password: 'test-boutique-password' })
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).success, true);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^connect\.sid=/);

  const catalogue = await fetch(`${baseUrl}/projets/boutique`, { headers: { Cookie: cookie } });
  const html = await catalogue.text();
  assert.equal(catalogue.status, 200);
  assert.match(html, /Publier un produit/);
  assert.match(html, /Article de test conservé/);

  const productForm = new FormData();
  productForm.set('nom', 'Article créé pendant le test');
  productForm.set('categorie', 'Informatique');
  productForm.set('prix', '10000');
  productForm.set('stock', '3');
  productForm.set('whatsapp_numero', '229 01 99 00 00 00');
  productForm.set('description', 'Fiche temporaire utilisée uniquement par le test automatisé.');
  const created = await fetch(`${baseUrl}/projets/boutique/boutique/admin/produits`, {
    method: 'POST', headers: { Cookie: cookie }, body: productForm
  });
  assert.equal(created.status, 200);
  assert.equal((await created.json()).success, true);
  const updatedCatalog = await (await fetch(`${baseUrl}/projets/boutique`, { headers: { Cookie: cookie } })).text();
  assert.match(updatedCatalog, /Article créé pendant le test/);
  assert.match(updatedCatalog, /Informatique/);
});

test('les accès administrateur inconnus sont refusés', async () => {
  const response = await fetch(`${baseUrl}/projets/boutique/gestion-privee-pibody/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'inconnu', password: 'anything' })
  });
  assert.equal(response.status, 400);
});
