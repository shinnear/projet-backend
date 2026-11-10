const express = require('express');
const router = express.Router();
const {
  createQuizz,
  getQuizzByFormation,
  getQuizzById,
  updateQuizz,
  deleteQuizz,
  submitQuizz,
} = require('../controllers/quizzController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Get quizzes for a formation — any authenticated user
router.get('/quizz/formation/:formationId', authMiddleware, getQuizzByFormation);
router.get('/quizz/:id', authMiddleware, getQuizzById);

// Formateur only — create, update, delete
router.post('/quizz', authMiddleware, authorize('formateur'), createQuizz);
router.put('/quizz/:id', authMiddleware, authorize('formateur'), updateQuizz);
router.delete('/quizz/:id', authMiddleware, authorize('formateur'), deleteQuizz);

// Submit quizz — any authenticated user (candidat or inscrit)
router.post('/quizz/:id/submit', authMiddleware, submitQuizz);

module.exports = router;
