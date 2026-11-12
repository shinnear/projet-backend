const express = require('express');
const router = express.Router();

const {
  createCV,
  getCVsByUser,
  getCVById,
  updateCV,
  deleteCV,
  telechargerPdfCV,
  analyserCV
} = require('../controllers/cvController');

const { authMiddleware } = require('../middleware/auth');

router.post('/cvs', authMiddleware, createCV);

router.get('/cvs/user/:userId', authMiddleware, getCVsByUser);

router.post('/cvs/:id/analyse', authMiddleware, analyserCV);

router.get('/cvs/:id/pdf', authMiddleware, telechargerPdfCV);

router.get('/cvs/:id', authMiddleware, getCVById);

router.put('/cvs/:id', authMiddleware, updateCV);

router.delete('/cvs/:id', authMiddleware, deleteCV);

module.exports = router;