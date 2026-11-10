const express = require('express');
const router = express.Router();
const {
  createMicroProjet,
  getMicroProjets,
  getMicroProjetById,
  updateMicroProjet,
  deleteMicroProjet,
  rejoindre,
  quitter,
  getParticipants,
} = require('../controllers/microprojetController');
const { authMiddleware } = require('../middleware/auth');

// Browse microprojets — any authenticated user
router.get('/microprojets', authMiddleware, getMicroProjets);
router.get('/microprojets/:id', authMiddleware, getMicroProjetById);
router.get('/microprojets/:id/participants', authMiddleware, getParticipants);

// Create — any authenticated user
router.post('/microprojets', authMiddleware, createMicroProjet);

// Update / delete — owner only (enforced in controller)
router.put('/microprojets/:id', authMiddleware, updateMicroProjet);
router.delete('/microprojets/:id', authMiddleware, deleteMicroProjet);

// Participation
router.post('/microprojets/:id/rejoindre', authMiddleware, rejoindre);
router.post('/microprojets/:id/quitter', authMiddleware, quitter);

module.exports = router;
