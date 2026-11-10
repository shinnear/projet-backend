const axios = require('axios');
const MicroProjet = require('../models/MicroProjet');
const Domaine = require('../models/Domaine');

const USER_SERVICE_URL = () => process.env.USER_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TOKEN = () => process.env.SERVICE_TOKEN;
const internalHeaders = () => ({ 'x-service-token': SERVICE_TOKEN() });

/**
 * Verify that a userId exists in user-service.
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
 * POST /microprojets
 * Create a new microprojet. Any authenticated user can create.
 */
const createMicroProjet = async (req, res) => {
  try {
    // Verify owner exists in user-service
    try {
      await verifyUser(req.user.id);
    } catch {
      return res.status(404).json({ message: 'Propriétaire introuvable dans user-service' });
    }

    // Verify domaine exists
    const domaine = await Domaine.findById(req.body.domaineId);
    if (!domaine) {
      return res.status(404).json({ message: 'Domaine non trouvé' });
    }

    const projet = await MicroProjet.create({ ...req.body, proprietaireId: req.user.id });
    const populated = await projet.populate('domaineId', 'nom icone');
    res.status(201).json({ message: 'MicroProjet créé avec succès', projet: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /microprojets
 * List all microprojets. Supports filters: domaineId, statut, proprietaireId.
 */
const getMicroProjets = async (req, res) => {
  try {
    const { domaineId, statut, proprietaireId, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (domaineId) filter.domaineId = domaineId;
    if (statut) filter.statut = statut;
    if (proprietaireId) filter.proprietaireId = proprietaireId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await MicroProjet.countDocuments(filter);
    const projets = await MicroProjet.find(filter)
      .populate('domaineId', 'nom icone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      projets,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /microprojets/:id
 * Get a single microprojet by ID.
 */
const getMicroProjetById = async (req, res) => {
  try {
    const projet = await MicroProjet.findById(req.params.id).populate('domaineId', 'nom icone description');
    if (!projet) return res.status(404).json({ message: 'MicroProjet non trouvé' });
    res.json(projet);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /microprojets/:id
 * Update a microprojet. Only the proprietaire can update.
 */
const updateMicroProjet = async (req, res) => {
  try {
    const projet = await MicroProjet.findById(req.params.id);
    if (!projet) return res.status(404).json({ message: 'MicroProjet non trouvé' });

    if (projet.proprietaireId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres microprojets' });
    }

    const updated = await MicroProjet.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('domaineId', 'nom icone');

    res.json({ message: 'MicroProjet mis à jour', projet: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /microprojets/:id
 * Delete a microprojet. Only the proprietaire can delete.
 */
const deleteMicroProjet = async (req, res) => {
  try {
    const projet = await MicroProjet.findById(req.params.id);
    if (!projet) return res.status(404).json({ message: 'MicroProjet non trouvé' });

    if (projet.proprietaireId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres microprojets' });
    }

    await projet.deleteOne();
    res.json({ message: 'MicroProjet supprimé avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Participation ───────────────────────────────────────────────────

/**
 * POST /microprojets/:id/rejoindre
 * Join a microprojet as a participant.
 * - Verifies user exists in user-service
 * - Project must be 'ouvert' to accept new participants
 * - Prevents the owner from joining their own project
 * - Prevents duplicate participation
 */
const rejoindre = async (req, res) => {
  try {
    const projet = await MicroProjet.findById(req.params.id);
    if (!projet) return res.status(404).json({ message: 'MicroProjet non trouvé' });

    if (projet.statut !== 'ouvert') {
      return res.status(400).json({
        message: `Impossible de rejoindre un projet avec le statut "${projet.statut}"`,
      });
    }

    const userId = req.user.id;

    if (projet.proprietaireId === userId) {
      return res.status(400).json({ message: 'Le propriétaire ne peut pas rejoindre son propre projet' });
    }

    if (projet.participants.includes(userId)) {
      return res.status(409).json({ message: 'Vous participez déjà à ce projet' });
    }

    // Verify user exists in user-service
    try {
      await verifyUser(userId);
    } catch {
      return res.status(404).json({ message: 'Utilisateur introuvable dans user-service' });
    }

    projet.participants.push(userId);
    await projet.save();

    res.json({
      message: 'Vous avez rejoint le projet avec succès',
      projetId: projet._id,
      titre: projet.titre,
      participantsCount: projet.participants.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /microprojets/:id/quitter
 * Leave a microprojet as a participant.
 */
const quitter = async (req, res) => {
  try {
    const projet = await MicroProjet.findById(req.params.id);
    if (!projet) return res.status(404).json({ message: 'MicroProjet non trouvé' });

    const userId = req.user.id;

    if (!projet.participants.includes(userId)) {
      return res.status(400).json({ message: "Vous ne participez pas à ce projet" });
    }

    projet.participants = projet.participants.filter((id) => id !== userId);
    await projet.save();

    res.json({
      message: 'Vous avez quitté le projet',
      projetId: projet._id,
      participantsCount: projet.participants.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /microprojets/:id/participants
 * Get the participants list for a microprojet.
 */
const getParticipants = async (req, res) => {
  try {
    const projet = await MicroProjet.findById(req.params.id).select('titre participants proprietaireId');
    if (!projet) return res.status(404).json({ message: 'MicroProjet non trouvé' });

    res.json({
      projetId: projet._id,
      titre: projet.titre,
      proprietaireId: projet.proprietaireId,
      total: projet.participants.length,
      participants: projet.participants,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createMicroProjet,
  getMicroProjets,
  getMicroProjetById,
  updateMicroProjet,
  deleteMicroProjet,
  rejoindre,
  quitter,
  getParticipants,
};
