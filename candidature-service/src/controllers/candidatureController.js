const Candidature = require('../models/Candidature');
const CV = require('../models/CV');

const {
  envoyerConfirmationCandidature
} = require('../services/emailService');

const {
  notifierStatut
} = require('../services/notificationStatutService');

const {
  TRANSITIONS,
  erreur,
  repondreErreur,
  texte,
  identifiant,
  periode,
  filtreStatut,
  lireService,
  offreDuRecruteur,
  offresDuRecruteur,
  lister,
  statistiques,
  sansEmail
} = require('../services/candidatureUtils');

// POST /candidatures
const creerCandidature = async (req, res) => {
  try {
    const body = req.body || {};

    const offreId = identifiant(body.offreId);
    const cvId = identifiant(body.cvId);
    const email = texte(body.email, 'Email', 254);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw erreur(400, 'Adresse email invalide');
    }

    if (
      body.lettreMotivation !== undefined &&
      (
        typeof body.lettreMotivation !== 'string' ||
        body.lettreMotivation.length > 3000
      )
    ) {
      throw erreur(
        400,
        'La lettre doit être un texte de 3000 caractères maximum'
      );
    }

    const cv = await CV.findById(cvId);

    if (!cv) {
      throw erreur(404, 'CV non trouvé');
    }

    if (cv.candidatId !== req.user.id) {
      throw erreur(403, 'Ce CV ne vous appartient pas');
    }

    await lireService('user', req.user.id);

    const offre = await lireService('offre', offreId);

    if (!offre || offre.statut !== 'active') {
      throw erreur(400, 'L’offre n’est pas active');
    }

    if (offre.dateLimite) {
      const limite = new Date(offre.dateLimite).getTime();

      if (!Number.isFinite(limite)) {
        throw erreur(502, 'La date limite de l’offre est invalide');
      }

      if (limite < Date.now()) {
        throw erreur(400, 'La date limite de candidature est dépassée');
      }
    }

    // L’index unique empêche les doublons, même en cas de requêtes simultanées.
    const candidature = await Candidature.create({
      candidatId: req.user.id,
      offreId,
      cvId,
      lettreMotivation: body.lettreMotivation,
      emailNotification: email,
      historiqueStatuts: [
        {
          statut: 'envoyée',
          date: new Date(),
          auteurId: req.user.id
        }
      ]
    });

    let emailEnvoye = false;

    try {
      await envoyerConfirmationCandidature(email, offre.titre);
      emailEnvoye = true;
    } catch {
      console.error(
        'Échec email de confirmation',
        String(candidature._id)
      );
    }

    return res.status(201).json({
      message: 'Candidature soumise avec succès',
      candidature: sansEmail(candidature),
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
    if (req.params.candidatId !== req.user.id) {
      throw erreur(
        403,
        'Vous ne pouvez consulter que vos propres candidatures'
      );
    }

    const filtre = {
      candidatId: req.user.id,
      ...periode(req.query),
      ...filtreStatut(req.query)
    };

    if (req.query.offreId !== undefined) {
      filtre.offreId = identifiant(req.query.offreId);
    }

    return res.json(await lister(filtre, req.query));
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /candidatures/offre/:offreId
const getCandidaturesByOffre = async (req, res) => {
  try {
    const offreId = identifiant(req.params.offreId);

    await offreDuRecruteur(req, offreId);

    const filtre = {
      offreId,
      ...periode(req.query),
      ...filtreStatut(req.query)
    };

    if (req.query.candidatId !== undefined) {
      filtre.candidatId = texte(
        req.query.candidatId,
        'candidatId'
      );
    }

    return res.json(await lister(filtre, req.query));
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /candidatures/:id
const getCandidatureById = async (req, res) => {
  try {
    const candidature = await Candidature.findById(
      identifiant(req.params.id)
    );

    if (!candidature) {
      throw erreur(404, 'Candidature non trouvée');
    }

    if (candidature.candidatId !== req.user.id) {
      await offreDuRecruteur(req, candidature.offreId);
    }

    // L’analyse IA personnelle du CV n’est pas transmise ici.
    await candidature.populate(
      'cvId',
      'titre competences langues experiences formations lienLinkedin'
    );

    return res.json(sansEmail(candidature));
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// PUT /candidatures/:id/statut
const updateStatut = async (req, res) => {
  try {
    const statut = req.body?.statut;

    if (!['vue', 'acceptée', 'rejetée'].includes(statut)) {
      throw erreur(
        400,
        'Statut invalide : vue, acceptée ou rejetée'
      );
    }

    const candidature = await Candidature.findById(
      identifiant(req.params.id)
    ).select('+emailNotification');

    if (!candidature) {
      throw erreur(404, 'Candidature non trouvée');
    }

    const offre = await offreDuRecruteur(
      req,
      candidature.offreId
    );

    // Une répétition ne crée pas un nouvel historique ni un nouvel email.
    if (candidature.statut === statut) {
      return res.json({
        message: 'Statut déjà appliqué',
        candidature: sansEmail(candidature)
      });
    }

    if (!TRANSITIONS[candidature.statut]?.includes(statut)) {
      throw erreur(
        409,
        `Transition interdite : ${candidature.statut} vers ${statut}`
      );
    }

    const date = new Date();

    // Le filtre vérifie que le statut n’a pas changé entre-temps.
    const resultat = await Candidature.findOneAndUpdate(
      {
        _id: candidature._id,
        statut: candidature.statut
      },
      {
        $set: {
          statut,
          dateMiseAJour: date
        },
        $push: {
          historiqueStatuts: {
            statut,
            date,
            auteurId: req.user.id
          }
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!resultat) {
      throw erreur(
        409,
        'La candidature a changé. Rechargez-la avant de réessayer.'
      );
    }

    // Envoyer seulement après l’enregistrement du changement.
    const notification = await notifierStatut(
      candidature.emailNotification,
      offre.titre,
      statut
    );

    return res.json({
      message: 'Statut mis à jour',
      candidature: sansEmail(resultat),
      notification
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// DELETE /candidatures/:id
const retirerCandidature = async (req, res) => {
  try {
    const candidature = await Candidature.findById(
      identifiant(req.params.id)
    );

    if (!candidature) {
      throw erreur(404, 'Candidature non trouvée');
    }

    if (candidature.candidatId !== req.user.id) {
      throw erreur(
        403,
        'Vous ne pouvez retirer que vos propres candidatures'
      );
    }

    if (candidature.statut !== 'envoyée') {
      throw erreur(
        400,
        'Seule une candidature envoyée peut être retirée'
      );
    }

    const resultat = await Candidature.deleteOne({
      _id: candidature._id,
      candidatId: req.user.id,
      statut: 'envoyée'
    });

    if (resultat.deletedCount !== 1) {
      throw erreur(
        409,
        'La candidature a changé. Rechargez-la.'
      );
    }

    return res.json({
      message: 'Candidature retirée avec succès'
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /candidatures/statistiques/candidat
const statistiquesCandidat = async (req, res) => {
  try {
    const filtre = {
      candidatId: req.user.id,
      ...periode(req.query)
    };

    if (req.query.offreId !== undefined) {
      filtre.offreId = identifiant(req.query.offreId);
    }

    return res.json(await statistiques(filtre));
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /candidatures/offre/:offreId/statistiques
const statistiquesOffre = async (req, res) => {
  try {
    const offreId = identifiant(req.params.offreId);

    await offreDuRecruteur(req, offreId);

    const resultat = await statistiques({
      offreId,
      ...periode(req.query)
    });

    return res.json({
      offreId,
      ...resultat
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /candidatures/statistiques/recruteur
const statistiquesRecruteur = async (req, res) => {
  try {
    const dates = periode(req.query);
    const ids = await offresDuRecruteur(req);

    return res.json(
      await statistiques({
        offreId: { $in: ids },
        ...dates
      })
    );
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
  retirerCandidature,
  statistiquesCandidat,
  statistiquesOffre,
  statistiquesRecruteur
};