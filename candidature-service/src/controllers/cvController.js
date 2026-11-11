const CV = require('../models/CV');

/**
 * POST /cvs
 * Create a new CV for the authenticated user.
 */
const createCV = async (req, res) => {
  try {

//controle saisie
    const { titre } = req.body;

if (typeof titre !== 'string' || titre.trim() === '') {
  return res.status(400).json({
    message: 'Le titre du CV est obligatoire'
  });
}

    const cv = await CV.create({ ...req.body, candidatId: req.user.id });
    res.status(201).json({ message: 'CV créé avec succès', cv });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /cvs/user/:userId
 * Get all CVs for a given user.
 */
const getCVsByUser = async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
  return res.status(403).json({
    message: 'Vous ne pouvez consulter que vos propres CVs'
  });
}
    const cvs = await CV.find({ candidatId: req.params.userId }).sort({ createdAt: -1 });
    res.json({ total: cvs.length, cvs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /cvs/:id
 * Get a single CV by ID.
 */
const getCVById = async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);
    if (!cv) return res.status(404).json({ message: 'CV non trouvé' });

    // Only the owner can view their CV in full detail
    if (cv.candidatId !== req.user.id && req.user.role !== 'recruteur') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    res.json(cv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /cvs/:id
 * Update a CV. Only the owner can update.
 */
const updateCV = async (req, res) => {
  try {

    //controle saisie 
    const { titre } = req.body;

if (
  titre !== undefined &&
  (typeof titre !== 'string' || titre.trim() === '')
) {
  return res.status(400).json({
    message: 'Le titre du CV ne peut pas être vide'
  });
}

    const cv = await CV.findById(req.params.id);
    if (!cv) return res.status(404).json({ message: 'CV non trouvé' });

    if (cv.candidatId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres CVs' });
    }

    const champsAutorises = [
  'titre',
  'experiences',
  'formations',
  'competences',
  'langues',
  'lienLinkedin'
];

const modifications = {};

for (const champ of champsAutorises) {
  if (req.body[champ] !== undefined) {
    modifications[champ] = req.body[champ];
  }
}

const updated = await CV.findByIdAndUpdate(
  req.params.id,
  { $set: modifications },
  {
    new: true,
    runValidators: true
  }
);

    res.json({ message: 'CV mis à jour', cv: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /cvs/:id
 * Delete a CV. Only the owner can delete.
 * Cannot delete a CV that is linked to an active candidature.
 */
const deleteCV = async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);
    if (!cv) return res.status(404).json({ message: 'CV non trouvé' });

    if (cv.candidatId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres CVs' });
    }

    // Check if any candidature references this CV
    const Candidature = require('../models/Candidature');
    const linked = await Candidature.countDocuments({ cvId: req.params.id });
    if (linked > 0) {
      return res.status(409).json({
        message: `Impossible de supprimer: ce CV est utilisé dans ${linked} candidature(s)`,
      });
    }

    await cv.deleteOne();
    res.json({ message: 'CV supprimé avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createCV, getCVsByUser, getCVById, updateCV, deleteCV };
