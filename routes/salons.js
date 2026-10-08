const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('projets/salons', { title: 'Salons éphémères' });
});

router.get('/:code', (req, res) => {
  res.render('projets/salon-room', { title: 'Salon ' + req.params.code, code: req.params.code });
});

module.exports = router;
