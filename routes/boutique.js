const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { resizeAndSave } = require('../data/image-utils');
const { db } = require('../data/db');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'boutique');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const CATALOGUES = {
  boutique: { titre: 'Catalogue Boutique', passwordEnv: 'ADMIN_PASSWORD_BOUTIQUE', sessionKey: 'isAdminBoutique', itemLabel: 'produit' },
  ecommerce: { titre: 'Boutique E-commerce', passwordEnv: 'ADMIN_PASSWORD_ECOMMERCE', sessionKey: 'isAdminEcommerce', itemLabel: 'produit' },
  restaurant: { titre: 'Menu Restaurant', passwordEnv: 'ADMIN_PASSWORD_RESTAURANT', sessionKey: 'isAdminRestaurant', itemLabel: 'plat' }
};

function getConfig(type) {
  return CATALOGUES[type] || null;
}

function requireAdmin(type) {
  return function (req, res, next) {
    const config = getConfig(type);
    if (config && req.session && req.session[config.sessionKey]) return next();
    return res.status(401).json({ error: 'Non autorisé.' });
  };
}

function normalizeWhatsapp(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  const digits = source.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function registerCatalogueRoutes(type) {
  const config = getConfig(type);

  router.get(`/${type === 'boutique' ? '' : type}`, (req, res) => {
    db.all('SELECT * FROM boutique_produits WHERE type_catalogue = ? ORDER BY cree_le DESC, id DESC', [type], (error, rows) => {
      if (error) {
        console.error(`[${type.toUpperCase()}] Erreur de lecture :`, error);
        return res.status(503).render('projets/boutique', {
          title: config.titre,
          produits: [],
          typeCatalogue: type,
          itemLabel: config.itemLabel,
          isAdmin: !!(req.session && req.session[config.sessionKey]),
          catalogueError: true
        });
      }
      return res.render('projets/boutique', {
        title: config.titre,
        produits: rows || [],
        typeCatalogue: type,
        itemLabel: config.itemLabel,
        isAdmin: !!(req.session && req.session[config.sessionKey]),
        catalogueError: false
      });
    });
  });

  router.post(`/${type}/admin/produits`, requireAdmin(type), upload.single('image'), async (req, res) => {
    const nom = String(req.body.nom || '').trim();
    const description = String(req.body.description || '').trim();
    const categorie = String(req.body.categorie || '').trim() || 'Autres';
    const rawPrice = String(req.body.prix ?? '').trim();
    const price = rawPrice ? Number(rawPrice) : Number.NaN;
    const stockInput = req.body.stock === undefined || req.body.stock === '' ? 0 : Number(req.body.stock);
    const whatsapp = normalizeWhatsapp(req.body.whatsapp_numero);

    if (!nom || nom.length > 120) return res.status(400).json({ error: 'Le nom est obligatoire (120 caractères maximum).' });
    if (description.length > 1200) return res.status(400).json({ error: 'La description doit rester sous 1 200 caractères.' });
    if (categorie.length > 60) return res.status(400).json({ error: 'La catégorie doit rester sous 60 caractères.' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Le prix doit être un nombre positif ou nul.' });
    if (!Number.isInteger(stockInput) || stockInput < 0 || stockInput > 1000000) return res.status(400).json({ error: 'Le stock doit être un entier positif ou nul.' });
    if (whatsapp === null) return res.status(400).json({ error: 'Le numéro WhatsApp doit contenir entre 8 et 15 chiffres.' });
    if (req.file && !String(req.file.mimetype || '').startsWith('image/')) return res.status(400).json({ error: 'Le fichier doit être une image.' });

    let imageName = null;
    try {
      if (req.file) {
        imageName = `${type}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
        await resizeAndSave(req.file.buffer, path.join(UPLOAD_DIR, imageName), 900, 78);
      }

      db.run(
        `INSERT INTO boutique_produits
          (type_catalogue, categorie, nom, description, prix, stock, image, whatsapp_numero)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [type, categorie, nom, description, price, stockInput, imageName, whatsapp],
        function (error) {
          if (error) {
            if (imageName) fs.promises.unlink(path.join(UPLOAD_DIR, imageName)).catch(() => {});
            console.error(`[${type.toUpperCase()}] Erreur SQL :`, error);
            return res.status(500).json({ error: 'Impossible d’enregistrer cet élément.' });
          }
          return res.json({ success: true, id: this.lastID });
        }
      );
    } catch (error) {
      if (imageName) fs.promises.unlink(path.join(UPLOAD_DIR, imageName)).catch(() => {});
      console.error(`[${type.toUpperCase()}] Erreur de traitement :`, error);
      return res.status(500).json({ error: 'Impossible de traiter cet élément.' });
    }
  });

  router.post(`/${type}/admin/produits/:id/supprimer`, requireAdmin(type), (req, res) => {
    db.get('SELECT image FROM boutique_produits WHERE id = ? AND type_catalogue = ?', [req.params.id, type], (readError, row) => {
      if (readError) return res.status(500).json({ error: 'Impossible de lire cet élément.' });
      db.run('DELETE FROM boutique_produits WHERE id = ? AND type_catalogue = ?', [req.params.id, type], function (deleteError) {
        if (deleteError) return res.status(500).json({ error: 'Impossible de supprimer cet élément.' });
        if (row && row.image) {
          const safeName = path.basename(row.image);
          const filePath = path.join(UPLOAD_DIR, safeName);
          if (filePath.startsWith(`${UPLOAD_DIR}${path.sep}`)) fs.promises.unlink(filePath).catch(() => {});
        }
        return res.json({ success: true });
      });
    });
  });

  router.post(`/${type}/admin/logout`, (req, res) => {
    if (req.session) req.session[config.sessionKey] = false;
    return res.json({ success: true });
  });
}

['boutique', 'ecommerce', 'restaurant'].forEach(registerCatalogueRoutes);

router.get('/gestion-privee-pibody', (req, res) => {
  res.render('projets/gestion-privee', { title: 'Gestion privée' });
});

router.post('/gestion-privee-pibody/connexion', express.json(), (req, res) => {
  const { type, password } = req.body || {};
  const config = getConfig(type);
  if (!config) return res.status(400).json({ success: false, error: 'Catalogue inconnu.' });

  const expected = process.env[config.passwordEnv] || process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ success: false, error: 'L’accès administrateur n’est pas encore configuré.' });
  if (typeof password !== 'string') return res.status(400).json({ success: false, error: 'Mot de passe invalide.' });

  const suppliedBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);
  const matches = suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
  if (matches) {
    req.session[config.sessionKey] = true;
    return res.json({ success: true, redirect: type === 'boutique' ? '/projets/boutique' : `/projets/boutique/${type}` });
  }
  return res.status(401).json({ success: false, error: 'Mot de passe incorrect.' });
});

module.exports = router;
