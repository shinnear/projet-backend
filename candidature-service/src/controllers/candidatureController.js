const axios = require('axios');
const Candidature = require('../models/Candidature');
const CV = require('../models/CV');
const {
  envoyerConfirmationCandidature
} = require('../services/emailService');

// Adresses des autres services.
const USER_SERVICE_URL = () =>
  process.env.USER_SERVICE_URL || 'http://localhost:3001';

const OFFRE_SERVICE_URL = () =>
  process.env.OFFRE_SERVICE_URL || 'http://localhost:3002';

// Configuration des appels entre services.
const optionsService = () => ({
  headers: {
    'x-service-token': process.env.SERVICE_TOKEN
  },
  timeout: 10000
});

// Gestion commune des erreurs.
function repondreErreur(res, err) {
  if (err.code === 11000) {
    return res.status(409).json({
      message: 'Vous avez déjà postulé à cette offre'
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: err.message
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Identifiant ou valeur invalide'
    });
  }

  console.error('Erreur candidature :', err.message);

  return res.status(500).json({
    message: 'Une erreur interne est survenue'
  });
}

// POST /candidatures
const creerCandidature = async (req, res) => {
  try {
    const body = req.body || {};
    const { offreId, cvId, lettreMotivation } = body;
    const candidatId = req.user.id;

    const email = typeof body.email === 'string'
      ? body.email.trim()
      : '';

    if (
      typeof offreId !== 'string' ||
      offreId.trim() === '' ||
      typeof cvId !== 'string' ||
      cvId.trim() === ''
    ) {
      return res.status(400).json({
        message: 'L’offre et le CV sont obligatoires'
      });
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        message: 'Une adresse email valide est obligatoire'
      });
    }

    // Vérifier que le candidat existe.
    try {
      await axios.get(
        `${USER_SERVICE_URL()}/internal/users/${candidatId}`,
        optionsService()
      );
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({
          message: 'Candidat introuvable dans user-service'
        });
      }

      return res.status(502).json({
        message: 'Impossible de vérifier le candidat auprès de user-service'
      });
    }

    // Récupérer l'offre.
    let offre;

    try {
      const reponse = await axios.get(
        `${OFFRE_SERVICE_URL()}/internal/offres/${offreId}`,
        optionsService()
      );

      offre = reponse.data;
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({
          message: 'Offre introuvable dans offre-service'
        });
      }

      return res.status(502).json({
        message: 'Impossible de vérifier l’offre auprès de offre-service'
      });
    }

    if (offre.statut !== 'active') {
      return res.status(400).json({
        message: 'Impossible de postuler : l’offre n’est pas active'
      });
    }

    if (
      offre.dateLimite &&
      new Date(offre.dateLimite) < new Date()
    ) {
      return res.status(400).json({
        message: 'La date limite de candidature est dépassée'
      });
    }

    // Vérifier que le CV appartient au candidat.
    const cv = await CV.findById(cvId);

    if (!cv) {
      return res.status(404).json({
        message: 'CV non trouvé'
      });
    }

    if (cv.candidatId !== candidatId) {
      return res.status(403).json({
        message: 'Ce CV ne vous appartient pas'
      });
    }

    // L'index unique du modèle empêche les doublons.
    const candidature = await Candidature.create({
      candidatId,
      offreId,
      cvId,
      lettreMotivation
    });

    // Envoyer l'email seulement après l'enregistrement.
    let emailEnvoye = false;

    try {
      await envoyerConfirmationCandidature(email, offre.titre);
      emailEnvoye = true;
    } catch {
      // La candidature reste enregistrée même si l'email échoue.
      console.error(
        'Échec de la notification email pour la candidature',
        candidature._id.toString()
      );
    }

    return res.status(201).json({
      message: 'Candidature soumise avec succès',
      candidature,
      notification: {
        emailEnvoye,
        message: emailEnvoye
          ? 'Email de confirmation accepté par le serveur de messagerie'
          : 'Candidature enregistrée, mais l’envoi de l’email a échoué'
      }
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /candidatures/candidat/:candidatId
const getCandidaturesByCandidat = async (req, res) => {
  try {
    // Cette liste personnelle est réservée au candidat concerné.
    if (req.params.candidatId !== req.user.id) {
      return res.status(403).json({
        message: 'Vous ne pouvez consulter que vos propres candidatures'
      });
    }

    const candidatures = await Candidature.find({
      candidatId: req.user.id
    })
      .populate('cvId', 'titre competences')
      .sort({ createdAt: -1 });

    return res.json({
      total: candidatures.length,
      candidatures
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// Vérifier que l'offre appartient au recruteur connecté.
// Retourne false après avoir envoyé une réponse de refus.
async function verifierRecruteurOffre(offreId, req, res) {
  if (req.user.role !== 'recruteur') {
    res.status(403).json({
      message: 'Accès réservé au recruteur de l’offre'
    });
    return false;
  }

  try {
    const reponse = await axios.get(
      `${OFFRE_SERVICE_URL()}/internal/offres/${offreId}`,
      optionsService()
    );

    if (reponse.data.recruteurId !== req.user.id) {
      res.status(403).json({
        message: 'Cette offre ne vous appartient pas'
      });
      return false;
    }

    return true;
  } catch (err) {
    if (err.response?.status === 404) {
      res.status(404).json({
        message: 'Offre introuvable'
      });
    } else {
      res.status(502).json({
        message: 'Impossible de vérifier le propriétaire de l’offre'
      });
    }

    return false;
  }
}

// GET /candidatures/offre/:offreId
const getCandidaturesByOffre = async (req, res) => {
  try {
    const autorise = await verifierRecruteurOffre(
      req.params.offreId,
      req,
      res
    );

    if (!autorise) return;

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const { statut } = req.query;

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        message: 'page doit être un entier positif et limit un entier entre 1 et 100'
      });
    }

    const statutsAutorises = [
      'envoyée',
      'vue',
      'acceptée',
      'rejetée'
    ];

    if (
      statut !== undefined &&
      !statutsAutorises.includes(statut)
    ) {
      return res.status(400).json({
        message: 'Statut de recherche invalide'
      });
    }

    const filtre = {
      offreId: req.params.offreId
    };

    if (statut) {
      filtre.statut = statut;
    }

    const total = await Candidature.countDocuments(filtre);

    const candidatures = await Candidature.find(filtre)
      .populate('cvId', 'titre competences langues experiences')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      candidatures
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /candidatures/:id
const getCandidatureById = async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);

    if (!candidature) {
      return res.status(404).json({
        message: 'Candidature non trouvée'
      });
    }

    // Le candidat propriétaire ou le recruteur de l'offre peut consulter.
    if (candidature.candidatId !== req.user.id) {
      const autorise = await verifierRecruteurOffre(
        candidature.offreId,
        req,
        res
      );

      if (!autorise) return;
    }

    await candidature.populate('cvId');

    return res.json(candidature);
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// PUT /candidatures/:id/statut
const updateStatut = async (req, res) => {
  try {
    const { statut } = req.body || {};
    const statutsAutorises = ['vue', 'acceptée', 'rejetée'];

    if (!statutsAutorises.includes(statut)) {
      return res.status(400).json({
        message: 'Statut invalide : utilisez vue, acceptée ou rejetée'
      });
    }

    const candidature = await Candidature.findById(req.params.id);

    if (!candidature) {
      return res.status(404).json({
        message: 'Candidature non trouvée'
      });
    }

    const autorise = await verifierRecruteurOffre(
      candidature.offreId,
      req,
      res
    );

    if (!autorise) return;

    candidature.statut = statut;
    await candidature.save();

    return res.json({
      message: 'Statut mis à jour',
      candidature
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// DELETE /candidatures/:id
const retirerCandidature = async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);

    if (!candidature) {
      return res.status(404).json({
        message: 'Candidature non trouvée'
      });
    }

    if (candidature.candidatId !== req.user.id) {
      return res.status(403).json({
        message: 'Vous ne pouvez retirer que vos propres candidatures'
      });
    }

    if (candidature.statut !== 'envoyée') {
      return res.status(400).json({
        message: 'Seule une candidature au statut envoyée peut être retirée'
      });
    }

    await candidature.deleteOne();

    return res.json({
      message: 'Candidature retirée avec succès'
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

module.exports = {
  creerCandidature,
  getCandidaturesByCandidat,
  getCandidaturesByOffre,
  getCandidatureById,
  updateStatut,
  retirerCandidature
};