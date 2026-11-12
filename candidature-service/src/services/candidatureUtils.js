const axios = require('axios');
const Candidature = require('../models/Candidature');

const STATUTS = ['envoyée', 'vue', 'acceptée', 'rejetée'];

const TRANSITIONS = {
  'envoyée': ['vue', 'acceptée', 'rejetée'],
  'vue': ['acceptée', 'rejetée'],
  'acceptée': [],
  'rejetée': []
};

function erreur(status, message) {
  return Object.assign(new Error(message), { status });
}

function repondreErreur(res, err) {
  if (err.status) {
    return res.status(err.status).json({
      message: err.message
    });
  }

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

  console.error('Erreur candidature', {
    name: err.name,
    code: err.code
  });

  return res.status(500).json({
    message: 'Une erreur interne est survenue'
  });
}

function texte(valeur, nom, max = 200) {
  if (
    typeof valeur !== 'string' ||
    !valeur.trim() ||
    valeur.length > max
  ) {
    throw erreur(400, `${nom} invalide`);
  }

  return valeur.trim();
}

function identifiant(valeur) {
  if (
    typeof valeur !== 'string' ||
    !/^[a-f\d]{24}$/i.test(valeur)
  ) {
    throw erreur(400, 'Identifiant invalide');
  }

  return valeur;
}

// Filtrer selon la date de création.
// La date de fin inclut toute la journée, en UTC.
function periode(query) {
  const resultat = {};

  for (const [cle, operateur] of [
    ['dateDebut', '$gte'],
    ['dateFin', '$lt']
  ]) {
    if (query[cle] === undefined) continue;

    const valeur = query[cle];

    if (
      typeof valeur !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(valeur)
    ) {
      throw erreur(400, `${cle} doit être au format AAAA-MM-JJ`);
    }

    const date = new Date(`${valeur}T00:00:00.000Z`);

    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== valeur
    ) {
      throw erreur(400, `${cle} invalide`);
    }

    if (cle === 'dateFin') {
      date.setUTCDate(date.getUTCDate() + 1);
    }

    resultat[operateur] = date;
  }

  if (
    resultat.$gte &&
    resultat.$lt &&
    resultat.$gte >= resultat.$lt
  ) {
    throw erreur(
      400,
      'dateDebut doit être antérieure ou égale à dateFin'
    );
  }

  return Object.keys(resultat).length
    ? { createdAt: resultat }
    : {};
}

function pagination(query) {
  function entier(valeur, defaut, max, nom) {
    if (valeur === undefined) return defaut;

    if (
      typeof valeur !== 'string' ||
      !/^[1-9]\d*$/.test(valeur)
    ) {
      throw erreur(400, `${nom} invalide`);
    }

    const nombre = Number(valeur);

    if (!Number.isSafeInteger(nombre) || nombre > max) {
      throw erreur(400, `${nom} doit être entre 1 et ${max}`);
    }

    return nombre;
  }

  const page = entier(query.page, 1, 100000, 'page');
  const limit = entier(query.limit, 20, 100, 'limit');
  const tri = query.tri ?? 'recent';

  if (!['recent', 'ancien'].includes(tri)) {
    throw erreur(400, 'tri doit être recent ou ancien');
  }

  const sens = tri === 'recent' ? -1 : 1;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sort: {
      createdAt: sens,
      _id: sens
    }
  };
}

function filtreStatut(query) {
  if (query.statut === undefined) return {};

  if (!STATUTS.includes(query.statut)) {
    throw erreur(400, 'Statut invalide');
  }

  return { statut: query.statut };
}

async function lireService(type, id) {
  const base = type === 'offre'
    ? (process.env.OFFRE_SERVICE_URL || 'http://localhost:3002')
    : (process.env.USER_SERVICE_URL || 'http://localhost:3001');

  const route = type === 'offre' ? 'offres' : 'users';

  try {
    const reponse = await axios.get(
      `${base}/internal/${route}/${encodeURIComponent(id)}`,
      {
        headers: {
          'x-service-token': process.env.SERVICE_TOKEN
        },
        timeout: 10000
      }
    );

    return reponse.data;
  } catch (err) {
    if (err.response?.status === 404) {
      throw erreur(
        404,
        type === 'offre'
          ? 'Offre introuvable'
          : 'Candidat introuvable'
      );
    }

    throw erreur(
      502,
      `Le service ${type} est indisponible ou refuse l’appel interne`
    );
  }
}

async function offreDuRecruteur(req, offreId) {
  if (req.user.role !== 'recruteur') {
    throw erreur(403, 'Accès réservé au recruteur de l’offre');
  }

  const offre = await lireService('offre', offreId);

  if (
    !offre ||
    String(offre.recruteurId) !== String(req.user.id)
  ) {
    throw erreur(403, 'Cette offre ne vous appartient pas');
  }

  return offre;
}

// Compatible avec les anciennes candidatures.
// Vérifier les propriétaires via la route interne déjà existante.
async function offresDuRecruteur(req) {
  if (req.user.role !== 'recruteur') {
    throw erreur(403, 'Accès réservé aux recruteurs');
  }

  const ids = await Candidature.distinct('offreId');
  const autorises = [];

  // Limiter à cinq appels simultanés vers offre-service.
  for (let i = 0; i < ids.length; i += 5) {
    const lot = await Promise.all(
      ids.slice(i, i + 5).map(async id => {
        try {
          const offre = await lireService('offre', id);

          return (
            offre &&
            String(offre.recruteurId) === String(req.user.id)
          ) ? id : null;
        } catch (err) {
          // Une offre supprimée n’a plus de propriétaire vérifiable.
          if (err.status === 404) return null;

          // Une panne ne doit pas produire des statistiques partielles.
          throw err;
        }
      })
    );

    autorises.push(...lot.filter(Boolean));
  }

  return autorises;
}

async function lister(filtre, query) {
  const { page, limit, skip, sort } = pagination(query);

  const [total, candidatures] = await Promise.all([
    Candidature.countDocuments(filtre),

    Candidature.find(filtre)
      .populate(
        'cvId',
        'titre competences langues experiences formations'
      )
      .sort(sort)
      .skip(skip)
      .limit(limit)
  ]);

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    candidatures
  };
}

async function statistiques(filtre) {
  const lignes = await Candidature.aggregate([
    {
      $match: filtre
    },
    {
      $group: {
        _id: '$statut',
        nombre: { $sum: 1 }
      }
    }
  ]);

  const parStatut = Object.fromEntries(
    STATUTS.map(statut => [statut, 0])
  );

  let total = 0;

  for (const ligne of lignes) {
    total += ligne.nombre;

    if (STATUTS.includes(ligne._id)) {
      parStatut[ligne._id] = ligne.nombre;
    }
  }

  return {
    total,
    parStatut,

    // Pourcentage accepté parmi toutes les candidatures du périmètre.
    tauxAcceptation: total
      ? Math.round(parStatut['acceptée'] * 10000 / total) / 100
      : 0
  };
}

function sansEmail(candidature) {
  const objet = candidature.toObject();
  delete objet.emailNotification;
  return objet;
}

module.exports = {
  TRANSITIONS,
  erreur,
  repondreErreur,
  texte,
  identifiant,
  periode,
  pagination,
  filtreStatut,
  lireService,
  offreDuRecruteur,
  offresDuRecruteur,
  lister,
  statistiques,
  sansEmail
};