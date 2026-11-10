const Quizz = require('../models/Quizz');
const Formation = require('../models/Formation');

// ─── CRUD ───────────────────────────────────────────────────────────

/**
 * POST /quizz
 * Create a quizz linked to a formation. Only the formation's formateur can create.
 */
const createQuizz = async (req, res) => {
  try {
    const { formationId } = req.body;

    // Verify the formation exists and belongs to this formateur
    const formation = await Formation.findById(formationId);
    if (!formation) {
      return res.status(404).json({ message: 'Formation non trouvée' });
    }
    if (formation.formateurId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez créer un quizz que pour vos propres formations' });
    }

    const quizz = await Quizz.create(req.body);
    res.status(201).json({ message: 'Quizz créé avec succès', quizz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /quizz/formation/:formationId
 * Get all quizz for a given formation.
 */
const getQuizzByFormation = async (req, res) => {
  try {
    const quizzes = await Quizz.find({ formationId: req.params.formationId }).sort({ createdAt: -1 });
    res.json({ total: quizzes.length, quizzes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /quizz/:id
 * Get a single quizz by ID.
 * Note: bonneReponse is hidden from candidates — only returned for formateurs.
 */
const getQuizzById = async (req, res) => {
  try {
    const quizz = await Quizz.findById(req.params.id).populate('formationId', 'titre formateurId');
    if (!quizz) return res.status(404).json({ message: 'Quizz non trouvé' });

    // Hide correct answers for non-formateurs
    const isOwner = quizz.formationId?.formateurId === req.user.id;
    if (!isOwner) {
      const sanitized = quizz.toObject();
      sanitized.questions = sanitized.questions.map(({ bonneReponse, ...rest }) => rest);
      return res.json(sanitized);
    }

    res.json(quizz);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /quizz/:id
 * Update a quizz. Only the formateur owner can update.
 */
const updateQuizz = async (req, res) => {
  try {
    const quizz = await Quizz.findById(req.params.id).populate('formationId', 'formateurId');
    if (!quizz) return res.status(404).json({ message: 'Quizz non trouvé' });

    if (quizz.formationId?.formateurId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres quizz' });
    }

    const updated = await Quizz.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.json({ message: 'Quizz mis à jour', quizz: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /quizz/:id
 */
const deleteQuizz = async (req, res) => {
  try {
    const quizz = await Quizz.findById(req.params.id).populate('formationId', 'formateurId');
    if (!quizz) return res.status(404).json({ message: 'Quizz non trouvé' });

    if (quizz.formationId?.formateurId !== req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres quizz' });
    }

    await quizz.deleteOne();
    res.json({ message: 'Quizz supprimé avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Submission & Grading ───────────────────────────────────────────

/**
 * POST /quizz/:id/submit
 * Grade a quizz submission.
 *
 * Request body: { reponses: ["answer1", "answer2", ...] }
 * reponses[i] corresponds to questions[i].
 *
 * Returns:
 * {
 *   score: 7,           // points earned
 *   total: 10,          // max possible points
 *   pourcentage: 70,    // percentage
 *   details: [{ question, reponseCandidat, bonneReponse, correct, points }]
 * }
 */
const submitQuizz = async (req, res) => {
  try {
    const { reponses } = req.body;

    if (!reponses || !Array.isArray(reponses)) {
      return res.status(400).json({ message: 'Le champ "reponses" (tableau) est requis' });
    }

    const quizz = await Quizz.findById(req.params.id);
    if (!quizz) return res.status(404).json({ message: 'Quizz non trouvé' });

    if (reponses.length !== quizz.questions.length) {
      return res.status(400).json({
        message: `${quizz.questions.length} réponses attendues, ${reponses.length} fournies`,
      });
    }

    let scoreObtenu = 0;
    let totalPoints = 0;
    const details = [];

    quizz.questions.forEach((question, index) => {
      const reponseCandidat = (reponses[index] || '').trim().toLowerCase();
      const bonneReponse = question.bonneReponse.trim().toLowerCase();
      const correct = reponseCandidat === bonneReponse;

      totalPoints += question.points;
      if (correct) scoreObtenu += question.points;

      details.push({
        numeroQuestion: index + 1,
        enonce: question.enonce,
        reponseCandidat: reponses[index],
        bonneReponse: question.bonneReponse,
        correct,
        pointsObtenus: correct ? question.points : 0,
        pointsMax: question.points,
      });
    });

    const pourcentage = totalPoints > 0 ? Math.round((scoreObtenu / totalPoints) * 100) : 0;
    const mention =
      pourcentage >= 90 ? 'Excellent' :
      pourcentage >= 75 ? 'Très bien' :
      pourcentage >= 60 ? 'Bien' :
      pourcentage >= 50 ? 'Passable' : 'Insuffisant';

    res.json({
      quizzId: quizz._id,
      quizzTitre: quizz.titre,
      candidatId: req.user.id,
      scoreObtenu,
      totalPoints,
      pourcentage,
      mention,
      details,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createQuizz,
  getQuizzByFormation,
  getQuizzById,
  updateQuizz,
  deleteQuizz,
  submitQuizz,
};
