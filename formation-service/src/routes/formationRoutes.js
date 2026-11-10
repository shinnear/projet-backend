const express = require('express');
const router = express.Router();
const {
  createFormation,
  getFormations,
  getFormationById,
  updateFormation,
  deleteFormation,
  inscrire,
  desinscrire,
  getInscrits,
} = require('../controllers/formationController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Anyone authenticated can browse formations
router.get('/formations', authMiddleware, getFormations);
router.get('/formations/:id', authMiddleware, getFormationById);
router.get('/formations/:id/inscrits', authMiddleware, getInscrits);

// Formateur only — create, update, delete
router.post('/formations', authMiddleware, authorize('formateur'), createFormation);
router.put('/formations/:id', authMiddleware, authorize('formateur'), updateFormation);
router.delete('/formations/:id', authMiddleware, authorize('formateur'), deleteFormation);

// Inscription — any authenticated user
router.post('/formations/:id/inscrire', authMiddleware, inscrire);
router.post('/formations/:id/desinscrire', authMiddleware, desinscrire);

module.exports = router;
