const axios = require('axios');
const Offre = require('../models/Offre');
const Recommandation = require('../models/Recommandation');
const { paginate, paginationMeta, buildSort } = require('../utils/query');

const USER_SERVICE_URL = () => process.env.USER_SERVICE_URL || 'http://localhost:3001';
const internalHeaders = () => ({ 'x-service-token': process.env.SERVICE_TOKEN });

/* ---------- Calcul du score ----------
   Score = % des compétences requises que le candidat possède (0 à 100).
   Si votre ancien computeScore était différent, remplacez cette fonction
   par la vôtre (elle doit renvoyer les mêmes 3 champs). */
const normalize = (s) => String(s).trim().toLowerCase();

const computeScore = (requises = [], possedees = []) => {
  const req = (requises || []).map((c) => ({ raw: c, key: normalize(c) }));
  const have = new Set((possedees || []).map(normalize));

  if (req.length === 0) {
    return {
      score: 0,
      competencesCorrespondantes: [],
      raisonRecommandation: "L'offre ne précise aucune compétence requise",
    };
  }

  const competencesCorrespondantes = req.filter((c) => have.has(c.key)).map((c) => c.raw);
  const score = Math.round((competencesCorrespondantes.length / req.length) * 100);

  const raisonRecommandation = competencesCorrespondantes.length
    ? `${competencesCorrespondantes.length}/${req.length} compétences en commun : ${competencesCorrespondantes.join(', ')}`
    : 'Aucune compétence requise en commun';

  return { score, competencesCorrespondantes, raisonRecommandation };
};

// Vérifie que l'offre existe ET appartient au recruteur connecté
const getOwnedOffre = async (offreId, userId, res) => {
  const offre = await Offre.findById(offreId);
  if (!offre) { res.status(404).json({ message: 'Offre non trouvée' }); return null; }
  if (offre.recruteurId !== userId) {
    res.status(403).json({ message: 'Cette offre ne vous appartient pas' }); return null;
  }
  return offre;
};

/* ---------- CREATE en masse (bulkWrite au lieu de N requêtes) ---------- */
const generateRecommandations = async (req, res) => {
  try {
    const offre = await getOwnedOffre(req.params.offreId, req.user.id, res);
    if (!offre) return;
    if (offre.statut !== 'active')
      return res.status(400).json({ message: 'Offre fermée : génération impossible' });

    let users;
    try {
      ({ data: users } = await axios.get(`${USER_SERVICE_URL()}/internal/users`,
                                         { headers: internalHeaders() }));
    } catch (err) {
      return res.status(502).json({ message: 'Impossible de contacter user-service' });
    }
    if (!Array.isArray(users) || !users.length)
      return res.json({ message: 'Aucun candidat trouvé', total: 0 });

    const ops = users.map((u) => {
      const { score, competencesCorrespondantes, raisonRecommandation } =
        computeScore(offre.competencesRequises, u.competences);
      return { updateOne: {
        filter: { offreId: offre._id, candidatId: String(u._id || u.userId || u.id) },
        update: { $set: { candidatNom: u.nom, candidatPrenom: u.prenom, score,
                          raisonRecommandation, competencesCorrespondantes,
                          dateGeneree: new Date() } },
        upsert: true } };
    });
    await Recommandation.bulkWrite(ops);

    res.status(201).json({ message: `${ops.length} recommandations générées`,
                           offreId: offre._id, offreTitre: offre.titre });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- CREATE unitaire ---------- */
// POST /recommandations  { offreId, candidatId }
const createRecommandation = async (req, res) => {
  try {
    const { offreId, candidatId } = req.body;
    if (!offreId || !candidatId)
      return res.status(400).json({ message: 'offreId et candidatId sont requis' });
    if (!require('mongoose').isValidObjectId(offreId))
      return res.status(400).json({ message: 'offreId invalide' });

    const offre = await getOwnedOffre(offreId, req.user.id, res);
    if (!offre) return;

    let u;
    try {
      ({ data: u } = await axios.get(
        `${USER_SERVICE_URL()}/internal/users/${candidatId}/competences`,
        { headers: internalHeaders() }));
    } catch { return res.status(404).json({ message: 'Candidat introuvable' }); }

    const s = computeScore(offre.competencesRequises, u.competences);
    const rec = await Recommandation.create({
      offreId: offre._id, candidatId: String(u.userId || u._id || candidatId),
      candidatNom: u.nom, candidatPrenom: u.prenom, ...s });
    res.status(201).json(rec);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 500).json({
      message: err.code === 11000 ? 'Recommandation déjà existante' : err.message });
  }
};

/* ---------- READ liste (pagination + filtre minScore + tri) ---------- */
const getRecommandationsByOffre = async (req, res) => {
  try {
    const offre = await getOwnedOffre(req.params.offreId, req.user.id, res);
    if (!offre) return;
    const { page, limit, skip } = paginate(req.query);
    const filter = { offreId: offre._id };
    if (req.query.minScore && !Number.isNaN(Number(req.query.minScore)))
      filter.score = { $gte: Number(req.query.minScore) };

    const sort = buildSort(req.query.sort, ['score', 'dateGeneree', 'candidatNom'], { score: -1 });
    const [total, recommandations] = await Promise.all([
      Recommandation.countDocuments(filter),
      Recommandation.find(filter).sort(sort).skip(skip).limit(limit),
    ]);
    res.json({ ...paginationMeta(total, page, limit),
               offreId: offre._id, offreTitre: offre.titre, recommandations });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- READ détail ---------- */
const getRecommandationById = async (req, res) => {
  try {
    const rec = await Recommandation.findById(req.params.id).populate('offreId');
    if (!rec) return res.status(404).json({ message: 'Recommandation non trouvée' });
    const isOwner = rec.offreId && rec.offreId.recruteurId === req.user.id;
    const isCandidate = rec.candidatId === req.user.id;
    if (!isOwner && !isCandidate) return res.status(403).json({ message: 'Accès refusé' });
    res.json(rec);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- READ côté candidat : "les offres qui me correspondent" ---------- */
const getMesRecommandations = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const filter = { candidatId: req.user.id };
    const [total, recommandations] = await Promise.all([
      Recommandation.countDocuments(filter),
      Recommandation.find(filter).sort({ score: -1 }).skip(skip).limit(limit).populate('offreId'),
    ]);
    res.json({ ...paginationMeta(total, page, limit), recommandations });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- UPDATE : recalculer le score ---------- */
const recalculateRecommandation = async (req, res) => {
  try {
    const rec = await Recommandation.findById(req.params.id);
    if (!rec) return res.status(404).json({ message: 'Recommandation non trouvée' });
    const offre = await getOwnedOffre(rec.offreId, req.user.id, res);
    if (!offre) return;

    let u;
    try {
      ({ data: u } = await axios.get(
        `${USER_SERVICE_URL()}/internal/users/${rec.candidatId}/competences`,
        { headers: internalHeaders() }));
    } catch { return res.status(502).json({ message: 'Impossible de récupérer le candidat' }); }

    Object.assign(rec, computeScore(offre.competencesRequises, u.competences),
                  { dateGeneree: new Date() });
    await rec.save();
    res.json(rec);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- DELETE (avec contrôle de propriété) ---------- */
const deleteRecommandation = async (req, res) => {
  try {
    const rec = await Recommandation.findById(req.params.id);
    if (!rec) return res.status(404).json({ message: 'Recommandation non trouvée' });
    if (!(await getOwnedOffre(rec.offreId, req.user.id, res))) return;
    await rec.deleteOne();
    res.json({ message: 'Recommandation supprimée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const deleteAllByOffre = async (req, res) => {
  try {
    const offre = await getOwnedOffre(req.params.offreId, req.user.id, res);
    if (!offre) return;
    const r = await Recommandation.deleteMany({ offreId: offre._id });
    res.json({ message: `${r.deletedCount} recommandation(s) supprimée(s)` });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* ---------- STATS ---------- */
// GET /recommandations/stats/offre/:offreId
const getStatsByOffre = async (req, res) => {
  try {
    const offre = await getOwnedOffre(req.params.offreId, req.user.id, res);
    if (!offre) return;
    const [r] = await Recommandation.aggregate([
      { $match: { offreId: offre._id } },
      { $facet: {
          resume: [{ $group: { _id: null, total: { $sum: 1 }, scoreMoyen: { $avg: '$score' },
                               scoreMax: { $max: '$score' }, scoreMin: { $min: '$score' },
                               qualifies: { $sum: { $cond: [{ $gte: ['$score', 70] }, 1, 0] } } } },
                   { $project: { _id: 0 } }],
          distribution: [{ $bucket: { groupBy: '$score', boundaries: [0, 25, 50, 75, 101],
                                      default: 'autre', output: { count: { $sum: 1 } } } }],
          top5: [{ $sort: { score: -1 } }, { $limit: 5 },
                 { $project: { candidatNom: 1, candidatPrenom: 1, score: 1 } }],
      } },
    ]);
    res.json({ offreId: offre._id, offreTitre: offre.titre,
               ...(r.resume[0] || { total: 0 }), distribution: r.distribution, top5: r.top5 });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = {
  generateRecommandations,
  createRecommandation,
  getRecommandationsByOffre,
  getRecommandationById,
  getMesRecommandations,
  recalculateRecommandation,
  deleteRecommandation,
  deleteAllByOffre,
  getStatsByOffre,
};