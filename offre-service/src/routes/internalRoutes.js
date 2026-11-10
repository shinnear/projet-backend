const express = require('express');
const router = express.Router();
const Offre = require('../models/Offre');
const { serviceAuthMiddleware } = require('../middleware/auth');

/**
 * GET /internal/offres/:id
 * Returns offre data for other services (e.g. candidature-service).
 * Protected by SERVICE_TOKEN header.
 */
router.get('/internal/offres/:id', serviceAuthMiddleware, async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) {
      return res.status(404).json({ message: 'Offre non trouvée' });
    }
    res.json(offre);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
