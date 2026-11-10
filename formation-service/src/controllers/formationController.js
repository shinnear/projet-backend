const axios = require('axios');
const Formation = require('../models/Formation');

const USER_SERVICE_URL = () => process.env.USER_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TOKEN = () => process.env.SERVICE_TOKEN;
const internalHeaders = () => ({ 'x-service-token': SERVICE_TOKEN() });

/**
 * Verify that a userId exists in user-service.
 * Returns the user object or throws.
 */
const verifyUser = async (userId) => {
  const response = await axios.get(
    `${USER_SERVICE_URL()}/internal/users/${userId}`,
    { headers: internalHeaders() }
  );
  return response.data;
};

// ─── CRUD ───────────────────────────────────────────────────────────

/**
 * POST /formations
 * Create a new formation. Only formateurs can create.
 */
const createFormation = async (req, res) => {
  try {
    // Verify formateur exists
    try {
      await verifyUser(req.user.id);
    } catch {
      return res.status(404).json({ message: 'Formateur introuvable dans user-service' });
    }

    const formation = await Formation.create({ ...req.body, formateurId: req.user.id });
    res.status(201).json({ message: 'Formation créée avec succès', formation });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /formations
 * List formations with optional filters: statut, categorie, niveau, formateurId.
 */
const getFormations = async (req, res) => {
  try {
    const { statut, categorie, niveau, formateurId, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (statut) filter.statut = statut;
    if (categorie) filter.categorie = categorie;
    if (niveau) filter.niveau = niveau;
    if (formateurId) filter.formateurId = formateurId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Formation.countDocuments(filter);
    const formations = await Formation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), formations });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /formations/:id
 */
const getFormationById = async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id);
    if (!formation) return res.status(404).json({ message: 'Formation non trouvée' });
    res.json(formation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /formations/:id
 * Only the formateur owner can update.
 */
const updateFormation = async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id);
    if (!formation) return res.status(404).json({ message: 'Formation non trouvée' });

    if (formation.formateurId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres formations' });
    }

    const updated = await Formation.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.json({ message: 'Formation mise à jour', formation: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /formations/:id
 * Only the formateur owner can delete.
 */
const deleteFormation = async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id);
    if (!formation) return res.status(404).json({ message: 'Formation non trouvée' });

    if (formation.formateurId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres formations' });
    }

    await formation.deleteOne();
    res.json({ message: 'Formation supprimée avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Inscription ────────────────────────────────────────────────────

/**
 * POST /formations/:id/inscrire
 * Subscribe the authenticated user to a formation.
 * Verifies user exists in user-service before adding.
 */
const inscrire = async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id);
    if (!formation) return res.status(404).json({ message: 'Formation non trouvée' });

    if (formation.statut === 'archivée') {
      return res.status(400).json({ message: "Impossible de s'inscrire à une formation archivée" });
    }

    const userId = req.user.id;

    // Verify user exists
    try {
      await verifyUser(userId);
    } catch {
      return res.status(404).json({ message: 'Utilisateur introuvable dans user-service' });
    }

    if (formation.inscrits.includes(userId)) {
      return res.status(409).json({ message: 'Vous êtes déjà inscrit à cette formation' });
    }

    formation.inscrits.push(userId);
    await formation.save();

    res.json({
      message: 'Inscription réussie',
      formationId: formation._id,
      titre: formation.titre,
      inscritsCount: formation.inscrits.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /formations/:id/desinscrire
 * Unsubscribe the authenticated user from a formation.
 */
const desinscrire = async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id);
    if (!formation) return res.status(404).json({ message: 'Formation non trouvée' });

    const userId = req.user.id;

    if (!formation.inscrits.includes(userId)) {
      return res.status(400).json({ message: "Vous n'êtes pas inscrit à cette formation" });
    }

    formation.inscrits = formation.inscrits.filter((id) => id !== userId);
    await formation.save();

    res.json({
      message: 'Désinscription réussie',
      formationId: formation._id,
      inscritsCount: formation.inscrits.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /formations/:id/inscrits
 * Get the list of enrolled user IDs for a formation.
 */
const getInscrits = async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id).select('titre inscrits');
    if (!formation) return res.status(404).json({ message: 'Formation non trouvée' });

    res.json({
      formationId: formation._id,
      titre: formation.titre,
      total: formation.inscrits.length,
      inscrits: formation.inscrits,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createFormation,
  getFormations,
  getFormationById,
  updateFormation,
  deleteFormation,
  inscrire,
  desinscrire,
  getInscrits,
};
