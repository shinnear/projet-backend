const express = require('express');
const router = express.Router();
const {
  creerCandidature,
  getCandidaturesByCandidat,
  getCandidaturesByOffre,
  getCandidatureById,
  updateStatut,
  retirerCandidature,
} = require('../controllers/candidatureController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Submit a candidature — candidats only
router.post('/candidatures', authMiddleware, authorize('candidat'), creerCandidature);

// View candidatures by candidate (own or recruteur view)
router.get('/candidatures/candidat/:candidatId', authMiddleware, getCandidaturesByCandidat);

// View candidatures for an offer — recruteurs only
router.get('/candidatures/offre/:offreId', authMiddleware, authorize('recruteur'), getCandidaturesByOffre);

// View a single candidature
router.get('/candidatures/:id', authMiddleware, getCandidatureById);

// Update statut — recruteurs only
router.put('/candidatures/:id/statut', authMiddleware, authorize('recruteur'), updateStatut);

// Withdraw candidature — candidat only (enforced in controller)
router.delete('/candidatures/:id', authMiddleware, authorize('candidat'), retirerCandidature);

module.exports = router;
