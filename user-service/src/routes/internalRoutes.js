const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { serviceAuthMiddleware } = require('../middleware/auth');

/**
 * GET /internal/users/:id
 * Returns basic user data for other services.
 * Protected by SERVICE_TOKEN header.
 */
router.get('/internal/users/:id', serviceAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /internal/users/:id/competences
 * Returns only the competences array of a user.
 * Used by offre-service for recommendation scoring.
 */
router.get('/internal/users/:id/competences', serviceAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('competences nom prenom');
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    res.json({ userId: user._id, nom: user.nom, prenom: user.prenom, competences: user.competences });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /internal/users
 * Returns all active users with their competences.
 * Used by offre-service to generate recommendations.
 */
router.get('/internal/users', serviceAuthMiddleware, async (req, res) => {
  try {
    const users = await User.find({ isActive: true, role: 'candidat' }).select(
      'nom prenom email competences'
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
