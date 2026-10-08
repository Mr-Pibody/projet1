// Salons éphémères en mémoire vive uniquement — aucune table BDD, conforme au cahier des charges.
const salons = {}; // { code: { participants: Set, lastActivity: timestamp } }

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo
const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000; // 2h

module.exports = function (io) {
  io.on('connection', (socket) => {

    socket.on('rejoindre-salon', ({ code }) => {
      if (!code) return;
      socket.join(code);
      if (!salons[code]) salons[code] = { participants: new Set(), lastActivity: Date.now() };
      salons[code].participants.add(socket.id);
      salons[code].lastActivity = Date.now();

      io.to(code).emit('participant-rejoint', { count: salons[code].participants.size });
    });

    socket.on('message-texte', ({ code, pseudo, texte }) => {
      if (!code || !salons[code]) return;
      salons[code].lastActivity = Date.now();
      io.to(code).emit('nouveau-message', {
        type: 'texte', pseudo, contenu: texte, heure: new Date().toLocaleTimeString('fr-FR')
      });
    });

    socket.on('message-media', ({ code, pseudo, type, data, taille }) => {
      if (!code || !salons[code]) return;
      if (taille > MAX_FILE_SIZE) {
        socket.emit('erreur', { message: 'Fichier trop volumineux (max 5 Mo).' });
        return;
      }
      salons[code].lastActivity = Date.now();
      io.to(code).emit('nouveau-message', {
        type, pseudo, contenu: data, heure: new Date().toLocaleTimeString('fr-FR')
      });
    });

    socket.on('disconnect', () => {
      Object.keys(salons).forEach(code => {
        if (salons[code].participants.has(socket.id)) {
          salons[code].participants.delete(socket.id);
          io.to(code).emit('participant-parti', { count: salons[code].participants.size });
          if (salons[code].participants.size === 0) {
            // Salon vide : suppression immédiate de la mémoire (aucune trace conservée)
            delete salons[code];
          }
        }
      });
    });
  });

  // Nettoyage périodique des salons inactifs (sécurité supplémentaire)
  setInterval(() => {
    const now = Date.now();
    Object.keys(salons).forEach(code => {
      if (now - salons[code].lastActivity > INACTIVITY_LIMIT_MS) {
        io.to(code).emit('salon-expire');
        delete salons[code];
      }
    });
  }, 10 * 60 * 1000); // vérification toutes les 10 min
};
