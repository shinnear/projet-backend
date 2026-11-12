const CV = require('../models/CV');
const Candidature = require('../models/Candidature');
const { genererPdfCV } = require('../services/pdfService');
const { analyserContenuCV } = require('../services/analyseCVService');

const champsAutorises = [
  'titre',
  'experiences',
  'formations',
  'competences',
  'langues',
  'lienLinkedin'
];

function extraireChamps(body) {
  const donnees = {};

  for (const champ of champsAutorises) {
    if (body[champ] !== undefined) {
      donnees[champ] = body[champ];
    }
  }

  return donnees;
}

function sansPdf(cv) {
  const donnees = cv.toObject();
  delete donnees.pdf;
  return donnees;
}

function repondreErreur(res, err) {
  if (err.statusIA) {
    return res.status(err.statusIA).json({
      message: err.message
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

  console.error('Erreur CV', {
    name: err.name,
    code: err.code
  });

  return res.status(500).json({
    message: 'Une erreur interne est survenue'
  });
}

// POST /cvs
const createCV = async (req, res) => {
  try {
    const body = req.body || {};

    if (
      typeof body.titre !== 'string' ||
      body.titre.trim() === ''
    ) {
      return res.status(400).json({
        message: 'Le titre du CV est obligatoire'
      });
    }

    const cv = new CV({
      ...extraireChamps(body),
      candidatId: req.user.id
    });

    await cv.validate();

    cv.pdf = await genererPdfCV(cv);

    await cv.save();

    return res.status(201).json({
      message: 'CV créé avec succès',
      cv: sansPdf(cv)
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /cvs/user/:userId
const getCVsByUser = async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({
        message: 'Vous ne pouvez consulter que vos propres CVs'
      });
    }

    const cvs = await CV.find({
      candidatId: req.user.id
    }).sort({ createdAt: -1 });

    return res.json({
      total: cvs.length,
      cvs
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /cvs/:id
const getCVById = async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);

    if (!cv) {
      return res.status(404).json({
        message: 'CV non trouvé'
      });
    }

    if (cv.candidatId !== req.user.id) {
      return res.status(403).json({
        message: 'Vous ne pouvez consulter que votre propre CV'
      });
    }

    return res.json(sansPdf(cv));
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// PUT /cvs/:id
const updateCV = async (req, res) => {
  try {
    const body = req.body || {};
    const cv = await CV.findById(req.params.id);

    if (!cv) {
      return res.status(404).json({
        message: 'CV non trouvé'
      });
    }

    if (cv.candidatId !== req.user.id) {
      return res.status(403).json({
        message: 'Vous ne pouvez modifier que vos propres CVs'
      });
    }

    if (
      body.titre !== undefined &&
      (
        typeof body.titre !== 'string' ||
        body.titre.trim() === ''
      )
    ) {
      return res.status(400).json({
        message: 'Le titre du CV ne peut pas être vide'
      });
    }

    const modifications = extraireChamps(body);

    if (Object.keys(modifications).length === 0) {
      return res.status(400).json({
        message: 'Aucun champ modifiable fourni'
      });
    }

    cv.set(modifications);

    // Une ancienne analyse ne correspond plus au CV modifié.
    cv.analyseIA = undefined;
    cv.markModified('analyseIA');

    await cv.validate();

    cv.pdf = await genererPdfCV(cv);

    await cv.save();

    return res.json({
      message: 'CV et PDF mis à jour ; ancienne analyse IA supprimée',
      cv: sansPdf(cv)
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// DELETE /cvs/:id
const deleteCV = async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);

    if (!cv) {
      return res.status(404).json({
        message: 'CV non trouvé'
      });
    }

    if (cv.candidatId !== req.user.id) {
      return res.status(403).json({
        message: 'Vous ne pouvez supprimer que vos propres CVs'
      });
    }

    const nombreCandidatures = await Candidature.countDocuments({
      cvId: cv._id
    });

    if (nombreCandidatures > 0) {
      return res.status(409).json({
        message: 'Impossible de supprimer un CV utilisé dans une candidature'
      });
    }

    await cv.deleteOne();

    return res.json({
      message: 'CV supprimé avec succès'
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// GET /cvs/:id/pdf
const telechargerPdfCV = async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id).select('+pdf');

    if (!cv) {
      return res.status(404).json({
        message: 'CV non trouvé'
      });
    }

    if (cv.candidatId !== req.user.id) {
      return res.status(403).json({
        message: 'Vous ne pouvez télécharger que votre propre CV'
      });
    }

    if (!cv.pdf || cv.pdf.length === 0) {
      return res.status(404).json({
        message: 'Aucun PDF disponible pour ce CV'
      });
    }

    res.setHeader('Content-Type', 'application/pdf');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cv-${cv._id}.pdf"`
    );

    res.setHeader('Cache-Control', 'no-store');

    return res.send(cv.pdf);
  } catch (err) {
    return repondreErreur(res, err);
  }
};

// Limites adaptées à notre service lancé dans un seul conteneur.
const analysesEnCours = new Set();
const derniersAppels = new Map();

const nettoyage = setInterval(() => {
  const limite = Date.now() - 60000;

  for (const [id, date] of derniersAppels) {
    if (date < limite) {
      derniersAppels.delete(id);
    }
  }
}, 60000);

nettoyage.unref();

// POST /cvs/:id/analyse
const analyserCV = async (req, res) => {
  const utilisateur = req.user.id;
  let verrouPris = false;

  res.setHeader('Cache-Control', 'no-store');

  try {
    const cv = await CV.findById(req.params.id);

    if (!cv) {
      return res.status(404).json({
        message: 'CV non trouvé'
      });
    }

    if (cv.candidatId !== utilisateur) {
      return res.status(403).json({
        message: 'Vous ne pouvez analyser que votre propre CV'
      });
    }

    // Réutiliser le résultat tant que le CV n’a pas été modifié.
    if (cv.analyseIA) {
      return res.json({
        message: 'Analyse déjà disponible',
        cvId: cv._id,
        analyseIA: cv.analyseIA
      });
    }

    const derniereDate = derniersAppels.get(utilisateur) || 0;

    if (
      analysesEnCours.has(utilisateur) ||
      Date.now() - derniereDate < 60000
    ) {
      res.setHeader('Retry-After', '60');

      return res.status(429).json({
        message: 'Une analyse est en cours ou a été demandée récemment. Patientez une minute.'
      });
    }

    if (analysesEnCours.size >= 4) {
      res.setHeader('Retry-After', '60');

      return res.status(503).json({
        message: 'Le service IA est occupé. Réessayez dans une minute.'
      });
    }

    analysesEnCours.add(utilisateur);
    derniersAppels.set(utilisateur, Date.now());
    verrouPris = true;

    const resultat = await analyserContenuCV(cv);

    const analyseIA = {
      ...resultat,
      dateAnalyse: new Date()
    };

    // Vérifier que le CV n’a pas changé pendant l’appel à l’IA.
    const misAJour = await CV.findOneAndUpdate(
      {
        _id: cv._id,
        candidatId: utilisateur,
        updatedAt: cv.updatedAt
      },
      {
        $set: { analyseIA }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!misAJour) {
      return res.status(409).json({
        message: 'Le CV a changé pendant l’analyse. Rechargez-le et recommencez.'
      });
    }

    return res.json({
      message: 'CV analysé avec succès',
      cvId: cv._id,
      analyseIA: misAJour.analyseIA
    });
  } catch (err) {
    return repondreErreur(res, err);
  } finally {
    if (verrouPris) {
      analysesEnCours.delete(utilisateur);
    }
  }
};

module.exports = {
  createCV,
  getCVsByUser,
  getCVById,
  updateCV,
  deleteCV,
  telechargerPdfCV,
  analyserCV
};