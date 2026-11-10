const axios = require('axios');
const Candidature = require('../models/Candidature');
const CV = require('../models/CV');

const USER_SERVICE_URL  = () => process.env.USER_SERVICE_URL  || 'http://localhost:3001';
const OFFRE_SERVICE_URL = () => process.env.OFFRE_SERVICE_URL || 'http://localhost:3002';
const SERVICE_TOKEN     = () => process.env.SERVICE_TOKEN;
const internalHeaders   = () => ({ 'x-service-token': SERVICE_TOKEN() });

/**
 * POST /candidatures
 * Submit a candidature.
 * Cross-service validations:
 *   1. Candidate (candidatId) must exist in user-service
 *   2. Offer (offreId) must exist and be active in offre-service
 *   3. CV must belong to the authenticated user
 *   4. No duplicate candidature (same candidatId + offreId)
 */
const creerCandidature = async (req, res) => {
  try {
    const { offreId, cvId, lettreMotivation } = req.body;
    const candidatId = req.user.id;

    // 1 — Verify candidate exists in user-service
    try {
      await axios.get(`${USER_SERVICE_URL()}/internal/users/${candidatId}`, {
        headers: internalHeaders(),
      });
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        return res.status(404).json({ message: 'Candidat introuvable dans user-service' });
      }
      return res.status(502).json({ message: 'Impossible de contacter user-service', detail: err.message });
    }

    // 2 — Verify offer exists and is active in offre-service
    let offre;
    try {
      const offreRes = await axios.get(`${OFFRE_SERVICE_URL()}/internal/offres/${offreId}`, {
        headers: internalHeaders(),
      });
      offre = offreRes.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        return res.status(404).json({ message: 'Offre introuvable dans offre-service' });
      }
      return res.status(502).json({ message: 'Impossible de contacter offre-service', detail: err.message });
    }

    if (offre.statut !== 'active') {
      return res.status(400).json({
        message: `Impossible de postuler : l'offre est "${offre.statut}"`,
      });
    }

    // Check if dateLimite has passed
    if (offre.dateLimite && new Date(offre.dateLimite) < new Date()) {
      return res.status(400).json({ message: "La date limite de candidature est dépassée" });
    }

    // 3 — Verify the CV belongs to this candidate
    const cv = await CV.findById(cvId);
    if (!cv) {
      return res.status(404).json({ message: 'CV non trouvé' });
    }
    if (cv.candidatId !== candidatId) {
      return res.status(403).json({ message: "Ce CV ne vous appartient pas" });
    }

    // 4 — Create candidature (unique index will reject duplicates)
    const candidature = await Candidature.create({
      candidatId,
      offreId,
      cvId,
      lettreMotivation,
    });

    res.status(201).json({
      message: 'Candidature soumise avec succès',
      candidature,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: 'Vous avez déjà postulé à cette offre',
      });
    }
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /candidatures/candidat/:candidatId
 * Get all candidatures submitted by a candidate.
 * The authenticated user can only view their own candidatures.
 */
const getCandidaturesByCandidat = async (req, res) => {
  try {
    if (req.params.candidatId !== req.user.id && req.user.role !== 'recruteur') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const candidatures = await Candidature.find({ candidatId: req.params.candidatId })
      .populate('cvId', 'titre competences')
      .sort({ createdAt: -1 });

    res.json({ total: candidatures.length, candidatures });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /candidatures/offre/:offreId
 * Get all candidatures for a given offer (for recruteurs).
 */
const getCandidaturesByOffre = async (req, res) => {
  try {
    const { statut, page = 1, limit = 20 } = req.query;
    const filter = { offreId: req.params.offreId };
    if (statut) filter.statut = statut;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Candidature.countDocuments(filter);
    const candidatures = await Candidature.find(filter)
      .populate('cvId', 'titre competences langues experiences')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      candidatures,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /candidatures/:id
 * Get a single candidature by ID.
 */
const getCandidatureById = async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id).populate('cvId');
    if (!candidature) return res.status(404).json({ message: 'Candidature non trouvée' });

    // Only the candidate or a recruteur can view
    if (candidature.candidatId !== req.user.id && req.user.role !== 'recruteur') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    res.json(candidature);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /candidatures/:id/statut
 * Update the status of a candidature.
 * Only recruteurs can change statut (vue, acceptée, rejetée).
 * A candidate can retract (delete) but not change statut.
 */
const updateStatut = async (req, res) => {
  try {
    const { statut } = req.body;
    if (!statut) return res.status(400).json({ message: 'Le champ "statut" est requis' });

    const allowedStatuts = ['vue', 'acceptée', 'rejetée'];
    if (!allowedStatuts.includes(statut)) {
      return res.status(400).json({
        message: `Statut invalide. Valeurs acceptées : ${allowedStatuts.join(', ')}`,
      });
    }

    const candidature = await Candidature.findById(req.params.id);
    if (!candidature) return res.status(404).json({ message: 'Candidature non trouvée' });

    candidature.statut = statut;
    await candidature.save(); // triggers pre-save to update dateMiseAJour

    res.json({ message: 'Statut mis à jour', candidature });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /candidatures/:id
 * Withdraw a candidature. Only the candidate can withdraw,
 * and only if statut is still 'envoyée'.
 */
const retirerCandidature = async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);
    if (!candidature) return res.status(404).json({ message: 'Candidature non trouvée' });

    if (candidature.candidatId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez retirer que vos propres candidatures' });
    }

    if (candidature.statut !== 'envoyée') {
      return res.status(400).json({
        message: `Impossible de retirer une candidature avec le statut "${candidature.statut}"`,
      });
    }

    await candidature.deleteOne();
    res.json({ message: 'Candidature retirée avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  creerCandidature,
  getCandidaturesByCandidat,
  getCandidaturesByOffre,
  getCandidatureById,
  updateStatut,
  retirerCandidature,
};
