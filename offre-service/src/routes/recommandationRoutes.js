const express = require('express');
const router = express.Router();
const {
  generateRecommandations,
  getRecommandationsByOffre,
  deleteRecommandation,
} = require('../controllers/recommandationController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Generate recommendations for an offer (recruteur only)
router.post(
  '/recommandations/generate/:offreId',
  authMiddleware,
  authorize('recruteur'),
  generateRecommandations
);

// Get all recommendations for an offer
router.get('/recommandations/offre/:offreId', authMiddleware, getRecommandationsByOffre);

// Delete a recommendation
router.delete(
  '/recommandations/:id',
  authMiddleware,
  authorize('recruteur'),
  deleteRecommandation
);

module.exports = router;
