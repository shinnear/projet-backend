const express = require('express');
const router = express.Router();
const {
  generateRecommandations,
  createRecommandation,
  getRecommandationsByOffre,
  getRecommandationById,
  getMesRecommandations,
  recalculateRecommandation,
  deleteRecommandation,
  deleteAllByOffre,
  getStatsByOffre,
} = require('../controllers/recommandationController');
const { authMiddleware, authorize } = require('../middleware/auth');
const { validateObjectId } = require('../utils/query');

// Routes fixes d'abord (avant /recommandations/:id)
router.get('/recommandations/me', authMiddleware, authorize('candidat'), getMesRecommandations);
router.get('/recommandations/stats/offre/:offreId', authMiddleware, authorize('recruteur'), validateObjectId('offreId'), getStatsByOffre);
router.get('/recommandations/offre/:offreId', authMiddleware, authorize('recruteur'), validateObjectId('offreId'), getRecommandationsByOffre);
router.post('/recommandations/generate/:offreId', authMiddleware, authorize('recruteur'), validateObjectId('offreId'), generateRecommandations);
router.delete('/recommandations/offre/:offreId', authMiddleware, authorize('recruteur'), validateObjectId('offreId'), deleteAllByOffre);
router.post('/recommandations', authMiddleware, authorize('recruteur'), createRecommandation);

// Routes avec :id ensuite
router.get('/recommandations/:id', authMiddleware, validateObjectId('id'), getRecommandationById);
router.put('/recommandations/:id/recalculate', authMiddleware, authorize('recruteur'), validateObjectId('id'), recalculateRecommandation);
router.delete('/recommandations/:id', authMiddleware, authorize('recruteur'), validateObjectId('id'), deleteRecommandation);

module.exports = router;