const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getUser,
  getAllUsers,
  updateUser,
  deleteUser,
} = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');

// Auth routes (public)
router.post('/auth/register', register);
router.post('/auth/login', login);

// User routes (protected)
router.get('/users', authMiddleware, getAllUsers);
router.get('/users/:id', authMiddleware, getUser);
router.put('/users/:id', authMiddleware, updateUser);
router.delete('/users/:id', authMiddleware, deleteUser);

module.exports = router;
