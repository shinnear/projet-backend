const express = require('express');
const router = express.Router();
const { createCV, getCVsByUser, getCVById, updateCV, deleteCV } = require('../controllers/cvController');
const { authMiddleware } = require('../middleware/auth');

// All CV routes require authentication
router.post('/cvs', authMiddleware, createCV);
router.get('/cvs/user/:userId', authMiddleware, getCVsByUser);
router.get('/cvs/:id', authMiddleware, getCVById);
router.put('/cvs/:id', authMiddleware, updateCV);
router.delete('/cvs/:id', authMiddleware, deleteCV);

module.exports = router;
