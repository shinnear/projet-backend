const express = require('express');
const router = express.Router();
const {
  createOffre,
  getOffres,
  getOffreById,
  updateOffre,
  closeOffre,
  reopenOffre,
  deleteOffre,
  statsGlobales,
  mesStats,
} = require('../controllers/offreController');
const { authMiddleware, authorize } = require('../middleware/auth');
const { validateObjectId } = require('../utils/query');

// ⚠️ Les routes fixes (/stats, /mes-stats) AVANT /offres/:id
router.get('/offres/stats', authMiddleware, statsGlobales);
router.get('/offres/mes-stats', authMiddleware, authorize('recruteur'), mesStats);

// Lecture : tout utilisateur authentifié
router.get('/offres', authMiddleware, getOffres);
router.get('/offres/:id', authMiddleware, validateObjectId('id'), getOffreById);

// Écriture : recruteur uniquement
router.post('/offres', authMiddleware, authorize('recruteur'), createOffre);
router.put('/offres/:id', authMiddleware, authorize('recruteur'), validateObjectId('id'), updateOffre);
router.patch('/offres/:id/close', authMiddleware, authorize('recruteur'), validateObjectId('id'), closeOffre);
router.patch('/offres/:id/reopen', authMiddleware, authorize('recruteur'), validateObjectId('id'), reopenOffre);
router.delete('/offres/:id', authMiddleware, authorize('recruteur'), validateObjectId('id'), deleteOffre);

module.exports = router;