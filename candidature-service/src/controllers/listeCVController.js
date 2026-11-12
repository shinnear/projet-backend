const CV = require('../models/CV');

const {
  erreur,
  repondreErreur,
  texte,
  periode,
  pagination
} = require('../services/candidatureUtils');

const getCVsByUser = async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      throw erreur(
        403,
        'Vous ne pouvez consulter que vos propres CVs'
      );
    }

    const filtre = {
      candidatId: req.user.id,
      ...periode(req.query)
    };

    if (req.query.competence !== undefined) {
      filtre.competences = texte(
        req.query.competence,
        'competence'
      );
    }

    if (req.query.langue !== undefined) {
      filtre.langues = texte(
        req.query.langue,
        'langue'
      );
    }

    if (req.query.analyse !== undefined) {
      if (!['oui', 'non'].includes(req.query.analyse)) {
        throw erreur(400, 'analyse doit être oui ou non');
      }

      filtre['analyseIA.dateAnalyse'] = {
        $exists: req.query.analyse === 'oui'
      };
    }

    const { page, limit, skip, sort } = pagination(req.query);

    const [total, cvs] = await Promise.all([
      CV.countDocuments(filtre),

      CV.find(filtre)
        .select('-pdf')
        .sort(sort)
        .skip(skip)
        .limit(limit)
    ]);

    return res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      cvs
    });
  } catch (err) {
    return repondreErreur(res, err);
  }
};

module.exports = { getCVsByUser };