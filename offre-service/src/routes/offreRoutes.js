const express = require('express');
const router = express.Router();
const {
  createOffre,
  getOffres,
  getOffreById,
  updateOffre,
  deleteOffre,
} = require('../controllers/offreController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Public — anyone authenticated can view offers
router.get('/offres', authMiddleware, getOffres);
router.get('/offres/:id', authMiddleware, getOffreById);

// Recruteur only — create, update, delete
router.post('/offres', authMiddleware, authorize('recruteur'), createOffre);
router.put('/offres/:id', authMiddleware, authorize('recruteur'), updateOffre);
router.delete('/offres/:id', authMiddleware, authorize('recruteur'), deleteOffre);

module.exports = router;
