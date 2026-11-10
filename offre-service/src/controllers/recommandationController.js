const axios = require('axios');
const Offre = require('../models/Offre');
const Recommandation = require('../models/Recommandation');

const USER_SERVICE_URL = () => process.env.USER_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TOKEN = () => process.env.SERVICE_TOKEN;

const internalHeaders = () => ({ 'x-service-token': SERVICE_TOKEN() });

/**
 * Compute the matching score between an offer's required competences
 * and a candidate's competences (case-insensitive intersection).
 * Returns { score (0-100), competencesCorrespondantes, raisonRecommandation }
 */
const computeScore = (competencesRequises, userCompetences) => {
  if (!competencesRequises || competencesRequises.length === 0) {
    return { score: 0, competencesCorrespondantes: [], raisonRecommandation: 'Aucune compétence requise définie' };
  }

  const required = competencesRequises.map((c) => c.toLowerCase().trim());
  const candidate = (userCompetences || []).map((c) => c.toLowerCase().trim());

  const matched = competencesRequises.filter((c) =>
    candidate.includes(c.toLowerCase().trim())
  );

  const score = Math.round((matched.length / required.length) * 100);
  const raisonRecommandation =
    matched.length > 0
      ? `Compétences correspondantes: ${matched.join(', ')}`
      : 'Aucune compétence correspondante trouvée';

  return { score, competencesCorrespondantes: matched, raisonRecommandation };
};

/**
 * POST /recommandations/generate/:offreId
 * Fetches all candidat users from user-service, computes a match score
 * for each against the offre's competencesRequises, and upserts Recommandation docs.
 * Returns the ranked list sorted by score descending.
 */
const generateRecommandations = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.offreId);
    if (!offre) {
      return res.status(404).json({ message: 'Offre non trouvée' });
    }

    if (offre.statut !== 'active') {
      return res.status(400).json({ message: "Impossible de générer des recommandations pour une offre fermée" });
    }

    // Fetch all candidat users from user-service
    let users;
    try {
      const response = await axios.get(`${USER_SERVICE_URL()}/internal/users`, {
        headers: internalHeaders(),
      });
      users = response.data;
    } catch (err) {
      return res.status(502).json({ message: 'Impossible de contacter user-service', detail: err.message });
    }

    if (!users || users.length === 0) {
      return res.json({ message: 'Aucun candidat trouvé', recommandations: [] });
    }

    // Compute scores and upsert recommendations
    const results = [];
    for (const user of users) {
      const { score, competencesCorrespondantes, raisonRecommandation } = computeScore(
        offre.competencesRequises,
        user.competences
      );

      const doc = await Recommandation.findOneAndUpdate(
        { offreId: offre._id, candidatId: user._id.toString() },
        {
          offreId: offre._id,
          candidatId: user._id.toString(),
          candidatNom: user.nom,
          candidatPrenom: user.prenom,
          score,
          raisonRecommandation,
          competencesCorrespondantes,
          dateGeneree: new Date(),
        },
        { upsert: true, new: true }
      );

      results.push(doc);
    }

    // Return sorted by score descending
    results.sort((a, b) => b.score - a.score);

    res.json({
      message: `${results.length} recommandations générées`,
      offreId: offre._id,
      offreTitre: offre.titre,
      recommandations: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /recommandations/offre/:offreId
 * Get all recommendations for an offer, sorted by score.
 */
const getRecommandationsByOffre = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.offreId);
    if (!offre) {
      return res.status(404).json({ message: 'Offre non trouvée' });
    }

    const recommandations = await Recommandation.find({ offreId: req.params.offreId }).sort({
      score: -1,
    });

    res.json({
      total: recommandations.length,
      offreId: req.params.offreId,
      offreTitre: offre.titre,
      recommandations,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /recommandations/:id
 * Delete a single recommendation.
 */
const deleteRecommandation = async (req, res) => {
  try {
    const rec = await Recommandation.findByIdAndDelete(req.params.id);
    if (!rec) return res.status(404).json({ message: 'Recommandation non trouvée' });
    res.json({ message: 'Recommandation supprimée' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { generateRecommandations, getRecommandationsByOffre, deleteRecommandation };
