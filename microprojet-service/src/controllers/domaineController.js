const Domaine = require('../models/Domaine');

/**
 * GET /domaines
 * List all domaines.
 */
const getDomaines = async (req, res) => {
  try {
    const domaines = await Domaine.find().sort({ nom: 1 });
    res.json({ total: domaines.length, domaines });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /domaines/:id
 * Get a single domaine by ID.
 */
const getDomaineById = async (req, res) => {
  try {
    const domaine = await Domaine.findById(req.params.id);
    if (!domaine) return res.status(404).json({ message: 'Domaine non trouvé' });
    res.json(domaine);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /domaines
 * Create a new domaine.
 */
const createDomaine = async (req, res) => {
  try {
    const domaine = await Domaine.create(req.body);
    res.status(201).json({ message: 'Domaine créé avec succès', domaine });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Un domaine avec ce nom existe déjà' });
    }
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /domaines/:id
 * Update a domaine.
 */
const updateDomaine = async (req, res) => {
  try {
    const domaine = await Domaine.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!domaine) return res.status(404).json({ message: 'Domaine non trouvé' });
    res.json({ message: 'Domaine mis à jour', domaine });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Un domaine avec ce nom existe déjà' });
    }
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /domaines/:id
 * Delete a domaine (only if no microprojets reference it).
 */
const deleteDomaine = async (req, res) => {
  try {
    const MicroProjet = require('../models/MicroProjet');
    const linked = await MicroProjet.countDocuments({ domaineId: req.params.id });
    if (linked > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer: ${linked} microprojet(s) utilisent ce domaine`,
      });
    }

    const domaine = await Domaine.findByIdAndDelete(req.params.id);
    if (!domaine) return res.status(404).json({ message: 'Domaine non trouvé' });
    res.json({ message: 'Domaine supprimé avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getDomaines, getDomaineById, createDomaine, updateDomaine, deleteDomaine };
