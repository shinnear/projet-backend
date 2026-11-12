const axios = require('axios');
const Offre = require('../models/Offre');
const Recommandation = require('../models/Recommandation');
const { paginate, paginationMeta, buildSort, escapeRegex } = require('../utils/query');

const USER_SERVICE_URL = () => process.env.USER_SERVICE_URL || 'http://localhost:3001';
const internalHeaders = () => ({ 'x-service-token': process.env.SERVICE_TOKEN });

// Champs que le client a le droit d'envoyer (empêche de modifier recruteurId, etc.)
const EDITABLE = ['titre', 'description', 'domaine', 'competencesRequises',
                  'typeContrat', 'localisation', 'salaire', 'dateLimite', 'statut'];
const pick = (body) => Object.fromEntries(
  Object.entries(body).filter(([k]) => EDITABLE.includes(k))
);

const checkDateLimite = (d) => d && new Date(d) <= new Date();

/* ---------- CREATE ---------- */
const createOffre = async (req, res) => {
  try {
    try {
      await axios.get(`${USER_SERVICE_URL()}/internal/users/${req.user.id}`,
        { headers: internalHeaders() });
    } catch {
      return res.status(404).json({ message: 'Recruteur introuvable dans user-service' });
    }
    const data = pick(req.body);
    if (checkDateLimite(data.dateLimite))
      return res.status(400).json({ message: 'dateLimite doit être dans le futur' });

    const offre = await Offre.create({ ...data, recruteurId: req.user.id });
    res.status(201).json({ message: 'Offre créée avec succès', offre });
  } catch (err) {
    res.status(err.name === 'ValidationError' ? 400 : 500).json({ message: err.message });
  }
};

/* ---------- READ (liste : filtres + recherche + tri + pagination) ---------- */
const getOffres = async (req, res) => {
  try {
    const { q, domaine, statut, typeContrat, recruteurId, localisation,
            salaireMin, salaireMax, competences, sort } = req.query;
    const { page, limit, skip } = paginate(req.query);
    const filter = {};

    if (domaine) filter.domaine = domaine;
    if (typeContrat) filter.typeContrat = typeContrat;
    if (recruteurId) filter.recruteurId = recruteurId;
    if (localisation) filter.localisation = new RegExp(escapeRegex(localisation), 'i');

    // Un candidat ne voit que les offres actives par défaut
    if (statut) filter.statut = statut;
    else if (req.user.role !== 'recruteur') filter.statut = 'active';

    if (salaireMin || salaireMax) {
      filter.salaire = {};
      if (salaireMin) filter.salaire.$gte = Number(salaireMin);
      if (salaireMax) filter.salaire.$lte = Number(salaireMax);
    }
    if (competences) {   // ?competences=node,react
      filter.competencesRequises = {
        $in: competences.split(',').map((c) => new RegExp(`^${escapeRegex(c.trim())}$`, 'i')),
      };
    }
    if (q) {             // recherche par mot-clé
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ titre: rx }, { description: rx }, { competencesRequises: rx }];
    }

    const sortObj = buildSort(sort, ['datePublication', 'salaire', 'dateLimite', 'titre'],
                              { datePublication: -1 });
    const [total, offres] = await Promise.all([
      Offre.countDocuments(filter),
      Offre.find(filter).sort(sortObj).skip(skip).limit(limit),
    ]);
    res.json({ ...paginationMeta(total, page, limit), offres });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ---------- READ (détail) ---------- */
const getOffreById = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) return res.status(404).json({ message: 'Offre non trouvée' });
    res.json(offre);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- UPDATE ---------- */
const updateOffre = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) return res.status(404).json({ message: 'Offre non trouvée' });
    if (offre.recruteurId !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres offres' });

    const data = pick(req.body);
    if (checkDateLimite(data.dateLimite))
      return res.status(400).json({ message: 'dateLimite doit être dans le futur' });

    Object.assign(offre, data);
    await offre.save();            // save() applique tous les validateurs
    res.json({ message: 'Offre mise à jour', offre });
  } catch (err) {
    res.status(err.name === 'ValidationError' ? 400 : 500).json({ message: err.message });
  }
};

/* ---------- CLOSE / REOPEN (métier) ---------- */
const setStatut = (statut) => async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) return res.status(404).json({ message: 'Offre non trouvée' });
    if (offre.recruteurId !== req.user.id)
      return res.status(403).json({ message: 'Accès refusé' });
    if (statut === 'active' && offre.dateLimite && offre.dateLimite <= new Date())
      return res.status(400).json({ message: 'Modifiez la dateLimite avant de rouvrir' });
    offre.statut = statut;
    await offre.save();
    res.json({ message: `Offre ${statut}`, offre });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- DELETE (avec cascade) ---------- */
const deleteOffre = async (req, res) => {
  try {
    const offre = await Offre.findById(req.params.id);
    if (!offre) return res.status(404).json({ message: 'Offre non trouvée' });
    if (offre.recruteurId !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres offres' });

    await Recommandation.deleteMany({ offreId: offre._id });  // évite les orphelins
    await offre.deleteOne();
    res.json({ message: 'Offre supprimée avec succès' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- STATS ---------- */
const getStats = (scope) => async (req, res) => {
  try {
    const match = scope === 'me' ? { recruteurId: req.user.id } : {};
    const [r] = await Offre.aggregate([
      { $match: match },
      { $facet: {
          total:      [{ $count: 'n' }],
          parStatut:  [{ $group: { _id: '$statut', count: { $sum: 1 } } }],
          parContrat: [{ $group: { _id: '$typeContrat', count: { $sum: 1 } } }],
          parDomaine: [{ $group: { _id: '$domaine', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          salaire:    [{ $match: { salaire: { $gt: 0 } } },
                       { $group: { _id: null, moyen: { $avg: '$salaire' },
                                   min: { $min: '$salaire' }, max: { $max: '$salaire' } } }],
          parMois:    [{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$datePublication' } },
                                   count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          bientotExpirees: [{ $match: { statut: 'active',
                              dateLimite: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 864e5) } } },
                            { $count: 'n' }],
      } },
    ]);
    res.json({
      total: r.total[0]?.n || 0,
      parStatut: r.parStatut,
      parContrat: r.parContrat,
      parDomaine: r.parDomaine,
      salaire: r.salaire[0] || null,
      parMois: r.parMois,
      bientotExpirees: r.bientotExpirees[0]?.n || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createOffre,
  getOffres,
  getOffreById,
  updateOffre,
  closeOffre: setStatut('fermée'),
  reopenOffre: setStatut('active'),
  deleteOffre,
  statsGlobales: getStats('global'),
  mesStats: getStats('me'),
};