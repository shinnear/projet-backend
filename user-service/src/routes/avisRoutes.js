const express = require('express');
const router = express.Router();
const {
  createAvis,
  getAvisByUser,
  getAvisById,
  updateAvis,
  deleteAvis,
} = require('../controllers/avisController');
const { authMiddleware } = require('../middleware/auth');

router.post('/avis', authMiddleware, createAvis);
router.get('/avis/user/:userId', authMiddleware, getAvisByUser);
router.get('/avis/:id', authMiddleware, getAvisById);
router.put('/avis/:id', authMiddleware, updateAvis);
router.delete('/avis/:id', authMiddleware, deleteAvis);

module.exports = router;
