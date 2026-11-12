const express = require('express');
const router = express.Router();

const {
  creerCandidature,
  getCandidaturesByCandidat,
  getCandidaturesByOffre,
  getCandidatureById,
  updateStatut,
  retirerCandidature,
  statistiquesCandidat,
  statistiquesOffre,
  statistiquesRecruteur
} = require('../controllers/candidatureController');

const {
  authMiddleware,
  authorize
} = require('../middleware/auth');

// Statistiques
router.get(
  '/candidatures/statistiques/candidat',
  authMiddleware,
  authorize('candidat'),
  statistiquesCandidat
);

router.get(
  '/candidatures/statistiques/recruteur',
  authMiddleware,
  authorize('recruteur'),
  statistiquesRecruteur
);

router.get(
  '/candidatures/offre/:offreId/statistiques',
  authMiddleware,
  authorize('recruteur'),
  statistiquesOffre
);

// Création
router.post(
  '/candidatures',
  authMiddleware,
  authorize('candidat'),
  creerCandidature
);

// Listes
router.get(
  '/candidatures/candidat/:candidatId',
  authMiddleware,
  authorize('candidat'),
  getCandidaturesByCandidat
);

router.get(
  '/candidatures/offre/:offreId',
  authMiddleware,
  authorize('recruteur'),
  getCandidaturesByOffre
);

// Consultation
router.get(
  '/candidatures/:id',
  authMiddleware,
  getCandidatureById
);

// Changement de statut
router.put(
  '/candidatures/:id/statut',
  authMiddleware,
  authorize('recruteur'),
  updateStatut
);

// Retrait
router.delete(
  '/candidatures/:id',
  authMiddleware,
  authorize('candidat'),
  retirerCandidature
);

module.exports = router;