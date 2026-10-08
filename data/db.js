// Module DB basé sur sql.js (SQLite compilé en WebAssembly).
// Choix volontaire : zéro compilation native requise, donc compatible avec l’hébergement mutualisé.
// La base vit en mémoire et est sauvegardée sur disque après chaque écriture (persist()).

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// En production, conserver l’emplacement historique par défaut. L’override sert aux tests/staging.
const DB_PATH = process.env.PORTFOLIO_DB_PATH
  ? path.resolve(process.env.PORTFOLIO_DB_PATH)
  : path.join(__dirname, 'portfolio.sqlite');

let SQL = null;
let dbInstance = null;

function countRows(sql, params = []) {
  const statement = dbInstance.prepare(sql);
  statement.bind(params);
  const count = statement.step() ? Number(statement.getAsObject().count) || 0 : 0;
  statement.free();
  return count;
}

function readRow(sql, params = []) {
  const statement = dbInstance.prepare(sql);
  statement.bind(params);
  const row = statement.step() ? statement.getAsObject() : null;
  statement.free();
  return row;
}

// Retire uniquement les lignes correspondant exactement aux fiches d’exemple
// connues de l’ancienne version. Toute ligne modifiée par un gestionnaire est préservée.
function cleanPreviousIllustrativeRecords() {
  const previousProducts = [
    ['boutique', '[DÉMO] Sac de travail Kora', 'Exemple fictif de produit pour tester le catalogue. Aucune commande réelle n’est activée.', 7500, 8],
    ['boutique', '[DÉMO] Carnet de projet A5', 'Exemple fictif de produit pour tester les fiches et les stocks.', 2500, 12],
    ['boutique', '[DÉMO] Lampe de bureau LED', 'Exemple fictif de produit ; prix et stock uniquement illustratifs.', 9500, 5],
    ['ecommerce', '[DÉMO] Clavier compact USB', 'Accessoire informatique fictif pour parcourir une boutique de démonstration.', 12500, 7],
    ['ecommerce', '[DÉMO] Support réglable pour ordinateur', 'Article fictif de démonstration ; aucune commande réelle n’est traitée.', 8000, 9],
    ['ecommerce', '[DÉMO] Batterie externe 10 000 mAh', 'Exemple fictif pour tester une fiche produit et un stock.', 18000, 4],
    ['restaurant', '[DÉMO] Riz aux légumes', 'Exemple de plat fictif pour illustrer un menu et son parcours de commande.', 1800, 0],
    ['restaurant', '[DÉMO] Poulet braisé & accompagnement', 'Plat d’exemple ; prix indicatif fictif, commande désactivée.', 3500, 0],
    ['restaurant', '[DÉMO] Jus de bissap maison', 'Boisson fictive ajoutée uniquement pour la démonstration du catalogue.', 800, 0]
  ];
  const removeProduct = dbInstance.prepare(`DELETE FROM boutique_produits
    WHERE type_catalogue = ? AND nom = ? AND description = ? AND prix = ? AND stock = ?
      AND COALESCE(image, '') = '' AND COALESCE(whatsapp_numero, '') = ''`);
  previousProducts.forEach(product => removeProduct.run(product));
  removeProduct.free();

  const previousAnnouncements = [
    ['[DÉMO] Atelier découverte du développement web', 'Annonce fictive pour présenter le formulaire de publication et les cartes du catalogue. Aucun événement réel n’est annoncé.', '#a8c99a'],
    ['[DÉMO] Exemple de projet : site vitrine', 'Publication de démonstration, sans client ni prestation réellement proposée.', '#7db6ae'],
    ['[DÉMO] Ressource numérique à partager', 'Exemple fictif destiné à montrer les champs titre, description et lien.', '#d2b681']
  ];
  const removeAnnouncement = dbInstance.prepare(`DELETE FROM annonces
    WHERE titre = ? AND description = ? AND COALESCE(image, '') = ''
      AND COALESCE(lien, '') = '' AND couleur_accent = ?`);
  previousAnnouncements.forEach(([title, description, color]) => removeAnnouncement.run([title, description, color]));
  removeAnnouncement.free();

  const previousSurvey = readRow('SELECT id FROM sondages WHERE code = ? AND titre = ?', [
    'DEMOIA01', 'DÉMO — Vos préférences numériques'
  ]);
  if (previousSurvey) {
    const responseCount = countRows('SELECT COUNT(*) AS count FROM sondages_reponses WHERE sondage_id = ?', [previousSurvey.id]);
    if (responseCount === 0) {
      dbInstance.run('DELETE FROM sondages WHERE id = ?', [previousSurvey.id]);
    } else {
      // Si des personnes ont déjà répondu, on garde le sondage et leurs réponses,
      // mais on enlève l’intitulé artificiel. Le code reste inchangé pour préserver les liens.
      dbInstance.run('UPDATE sondages SET titre = ? WHERE id = ?', ['Vos préférences numériques', previousSurvey.id]);
    }
  }

  const previousEvent = readRow('SELECT id FROM votes_evenements WHERE code = ? AND titre = ?', [
    'DEMOEV01', 'DÉMO — Choisir un thème numérique'
  ]);
  if (previousEvent) {
    const ballotCount = countRows('SELECT COUNT(*) AS count FROM votes_bulletins WHERE evenement_id = ?', [previousEvent.id]);
    if (ballotCount === 0) {
      dbInstance.run('DELETE FROM votes_evenements WHERE id = ?', [previousEvent.id]);
    } else {
      // Les votes reçus sont conservés et l’événement devient une entrée ordinaire.
      dbInstance.run('UPDATE votes_evenements SET titre = ? WHERE id = ?', ['Choisir un thème numérique', previousEvent.id]);
    }
  }
}

async function init() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  dbInstance.run(`CREATE TABLE IF NOT EXISTS boutique_produits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_catalogue TEXT NOT NULL DEFAULT 'boutique',
    categorie TEXT NOT NULL DEFAULT 'Autres',
    nom TEXT NOT NULL,
    description TEXT,
    prix REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    image TEXT,
    whatsapp_numero TEXT,
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migrations additives : elles conservent toutes les fiches déjà présentes.
  try { dbInstance.run('ALTER TABLE boutique_produits ADD COLUMN type_catalogue TEXT NOT NULL DEFAULT \'boutique\''); } catch (error) { /* colonne déjà présente */ }
  try { dbInstance.run("ALTER TABLE boutique_produits ADD COLUMN categorie TEXT NOT NULL DEFAULT 'Autres'"); } catch (error) { /* colonne déjà présente */ }
  dbInstance.run('CREATE INDEX IF NOT EXISTS idx_boutique_type_category ON boutique_produits(type_catalogue, categorie)');

  dbInstance.run(`CREATE TABLE IF NOT EXISTS annonces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    description TEXT,
    image TEXT,
    lien TEXT,
    couleur_accent TEXT DEFAULT '#00f0c0',
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  dbInstance.run(`CREATE TABLE IF NOT EXISTS jeux_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jeu TEXT NOT NULL,
    pseudo TEXT NOT NULL,
    score INTEGER NOT NULL,
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  dbInstance.run(`CREATE TABLE IF NOT EXISTS sondages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    questions_json TEXT NOT NULL,
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  dbInstance.run(`CREATE TABLE IF NOT EXISTS sondages_reponses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sondage_id INTEGER NOT NULL,
    reponses_json TEXT NOT NULL,
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sondage_id) REFERENCES sondages(id)
  )`);

  dbInstance.run(`CREATE TABLE IF NOT EXISTS votes_evenements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    categories_json TEXT NOT NULL,
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  dbInstance.run(`CREATE TABLE IF NOT EXISTS votes_bulletins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evenement_id INTEGER NOT NULL,
    categorie TEXT NOT NULL,
    option_choisie TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    cree_le DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evenement_id) REFERENCES votes_evenements(id)
  )`);

  cleanPreviousIllustrativeRecords();
  persist();
  console.log('[DB] sql.js initialisé et tables prêtes.');
}

function persist() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ---- Wrapper compatible avec le style "sqlite3" utilisé dans les routes ----
function sanitizeParams(params) {
  return (params || []).map(parameter => (parameter === undefined ? null : parameter));
}

function run(sql, params, callback) {
  if (typeof params === 'function') { callback = params; params = []; }
  try {
    const statement = dbInstance.prepare(sql);
    statement.bind(sanitizeParams(params));
    statement.step();
    statement.free();

    let lastID = null;
    const idResult = dbInstance.exec('SELECT last_insert_rowid() AS id');
    if (idResult.length && idResult[0].values.length) lastID = idResult[0].values[0][0];

    persist();
    if (callback) callback.call({ lastID }, null);
  } catch (error) {
    if (callback) callback(error);
  }
}

function get(sql, params, callback) {
  if (typeof params === 'function') { callback = params; params = []; }
  try {
    const statement = dbInstance.prepare(sql);
    statement.bind(sanitizeParams(params));
    const row = statement.step() ? statement.getAsObject() : null;
    statement.free();
    callback(null, row);
  } catch (error) {
    callback(error);
  }
}

function all(sql, params, callback) {
  if (typeof params === 'function') { callback = params; params = []; }
  try {
    const statement = dbInstance.prepare(sql);
    statement.bind(sanitizeParams(params));
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    callback(null, rows);
  } catch (error) {
    callback(error);
  }
}

module.exports = { init, db: { run, get, all } };
