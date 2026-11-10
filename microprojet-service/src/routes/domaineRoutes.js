const express = require('express');
const router = express.Router();
const {
  getDomaines,
  getDomaineById,
  createDomaine,
  updateDomaine,
  deleteDomaine,
} = require('../controllers/domaineController');
const { authMiddleware } = require('../middleware/auth');

// Anyone authenticated can view domaines
router.get('/domaines', authMiddleware, getDomaines);
router.get('/domaines/:id', authMiddleware, getDomaineById);

// Any authenticated user can manage domaines (admin-level in a full app)
router.post('/domaines', authMiddleware, createDomaine);
router.put('/domaines/:id', authMiddleware, updateDomaine);
router.delete('/domaines/:id', authMiddleware, deleteDomaine);

module.exports = router;
