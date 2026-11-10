const Avis = require('../models/Avis');

/**
 * POST /avis
 * Create a new avis. auteurId comes from the authenticated user.
 */
const createAvis = async (req, res) => {
  try {
    const { cibleId, note, commentaire } = req.body;
    const auteurId = req.user.id;

    // Can't review yourself
    if (auteurId === cibleId) {
      return res.status(400).json({ message: 'Vous ne pouvez pas vous évaluer vous-même' });
    }

    const avis = await Avis.create({ auteurId, cibleId, note, commentaire });
    res.status(201).json({ message: 'Avis créé avec succès', avis });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Vous avez déjà laissé un avis pour cet utilisateur' });
    }
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /avis/user/:userId
 * Get all avis for a specific user (the target / cible).
 */
const getAvisByUser = async (req, res) => {
  try {
    const avis = await Avis.find({ cibleId: req.params.userId })
      .populate('auteurId', 'nom prenom avatar')
      .sort({ createdAt: -1 });

    // Calculate average rating
    const moyenne =
      avis.length > 0
        ? (avis.reduce((sum, a) => sum + a.note, 0) / avis.length).toFixed(1)
        : null;

    res.json({ total: avis.length, moyenne, avis });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /avis/:id
 * Get a single avis by ID.
 */
const getAvisById = async (req, res) => {
  try {
    const avis = await Avis.findById(req.params.id)
      .populate('auteurId', 'nom prenom avatar')
      .populate('cibleId', 'nom prenom');
    if (!avis) {
      return res.status(404).json({ message: 'Avis non trouvé' });
    }
    res.json(avis);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /avis/:id
 * Update an avis. Only the author can update.
 */
const updateAvis = async (req, res) => {
  try {
    const avis = await Avis.findById(req.params.id);
    if (!avis) {
      return res.status(404).json({ message: 'Avis non trouvé' });
    }

    if (avis.auteurId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres avis' });
    }

    const { note, commentaire } = req.body;
    if (note !== undefined) avis.note = note;
    if (commentaire !== undefined) avis.commentaire = commentaire;
    await avis.save();

    res.json({ message: 'Avis mis à jour', avis });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /avis/:id
 * Delete an avis. Only the author can delete.
 */
const deleteAvis = async (req, res) => {
  try {
    const avis = await Avis.findById(req.params.id);
    if (!avis) {
      return res.status(404).json({ message: 'Avis non trouvé' });
    }

    if (avis.auteurId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres avis' });
    }

    await avis.deleteOne();
    res.json({ message: 'Avis supprimé avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createAvis, getAvisByUser, getAvisById, updateAvis, deleteAvis };
