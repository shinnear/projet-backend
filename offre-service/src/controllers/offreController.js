const axios = require('axios');
const Offre = require('../models/Offre');

const USER_SERVICE_URL = () => process.env.USER_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TOKEN = () => process.env.SERVICE_TOKEN;

const internalHeaders = () => ({ 'x-service-token': SERVICE_TOKEN() });

/**
 * POST /offres
 * Create a new offre. Only recruteurs can create offers.
 */
const createOffre = async (req, res) => {
  try {
    // Verify the recruiter exists in user-service
    try {
      await axios.get(`${USER_SERVICE_URL()}/internal/users/${req.user.id}`, {
        headers: internalHeaders(),
      });
    } catch {
      return res.status(404).json({ message: 'Recruteur introuvable dans user-service' });
    }

    const offre = await Offre.create({ ...req.body, recruteurId: req.user.id });
    res.status(201).json({ message: 'Offre créée avec succès', offre });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /offres
 * List all offres with optional filters: domaine, statut, typeContrat, recruteurId.
 */
const getOffres = async (req, res) => {
  try {
    const { domaine, statut, typeContrat, recruteurId, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (domaine) filter.domaine = domaine;
    if (statut) filter.statut = statut;
    if (typeContrat) filter.typeContrat = typeContrat;
    if (recruteurId) filter.recruteurId = recruteurId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Offre.countDocuments(filter);
    const offres = await Offre.find(filter)
      .sort({ datePublication: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      offres,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /offres/:id
 * Get a single offre by ID.
 */
const getOffreById = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) return res.status(404).json({ message: 'Offre non trouvée' });
    res.json(offre);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /offres/:id
 * Update an offre. Only the owner recruteur can update.
 */
const updateOffre = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) return res.status(404).json({ message: 'Offre non trouvée' });

    if (offre.recruteurId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres offres' });
    }

    const updated = await Offre.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.json({ message: 'Offre mise à jour', offre: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /offres/:id
 * Delete an offre. Only the owner recruteur can delete.
 */
const deleteOffre = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) return res.status(404).json({ message: 'Offre non trouvée' });

    if (offre.recruteurId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres offres' });
    }

    await offre.deleteOne();
    res.json({ message: 'Offre supprimée avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createOffre, getOffres, getOffreById, updateOffre, deleteOffre };
