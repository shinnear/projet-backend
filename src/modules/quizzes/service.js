const Quiz = require("./model");
const Formation = require("../trainings/model");
const QuizAttempt = require("./attempt-model");
const { getCertificateConfig } = require("../../config/certificates");
const { resolveLearner } = require("./learner");

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function createQuiz(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError(400, "Provide a JSON object");
  }

  if (
    typeof data.formation !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(data.formation)
  ) {
    throw createError(400, "Invalid formation ID");
  }

  if (
    !Array.isArray(data.questions) ||
    data.questions.length === 0 ||
    !data.questions.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
    )
  ) {
    throw createError(400, "Provide at least one question object");
  }

  const formationExists = await Formation.exists({
    _id: data.formation,
  });

  if (!formationExists) {
    throw createError(404, "Formation not found");
  }

  const quiz = new Quiz({
    title: data.title,
    description: data.description,
    formation: data.formation,
    questions: data.questions.map((item) => ({
      question: item.question,
      options: {
        A: item.options?.A,
        B: item.options?.B,
        C: item.options?.C,
        D: item.options?.D,
      },
      correctAnswer: item.correctAnswer,
    })),
  });

  return quiz.save();
}
async function listQuizzes(page, limit) {
  const skip = (page - 1) * limit;

  const [quizzes, total] = await Promise.all([
    Quiz.find()
      .select("-questions.correctAnswer")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Quiz.countDocuments(),
  ]);

  return {
    quizzes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getQuizById(id) {
  return Quiz.findById(id)
    .select("-questions.correctAnswer")
    .lean();
}
async function updateQuiz(id, data) {
  const allowedFields = ["title", "description", "questions"];

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).length === 0
  ) {
    throw createError(400, "Provide a non-empty JSON object");
  }

  const invalidFields = Object.keys(data).filter(
    (field) => !allowedFields.includes(field)
  );

  if (invalidFields.length > 0) {
    throw createError(
      400,
      `Fields cannot be updated: ${invalidFields.join(", ")}`
    );
  }

  // Load answers internally so the complete quiz can be validated.
  const quiz = await Quiz.findById(id)
    .select("+questions.correctAnswer");

  if (!quiz) {
    return null;
  }

  if (Object.hasOwn(data, "title")) {
    quiz.title = data.title;
  }

  if (Object.hasOwn(data, "description")) {
    quiz.description = data.description;
  }

  if (Object.hasOwn(data, "questions")) {
    if (
      !Array.isArray(data.questions) ||
      data.questions.length === 0 ||
      !data.questions.every(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item)
      )
    ) {
      throw createError(400, "Provide at least one question object");
    }

    quiz.questions = data.questions.map((item) => ({
      question: item.question,
      options: {
        A: item.options?.A,
        B: item.options?.B,
        C: item.options?.C,
        D: item.options?.D,
      },
      correctAnswer: item.correctAnswer,
    }));
  }

  return quiz.save();
}
async function deleteQuiz(id) {
  return Quiz.findByIdAndDelete(id);
}
async function submitQuiz(id, data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Array.isArray(data.answers)
  ) {
    throw createError(400, "Provide an answers array");
  }

  const quiz = await Quiz.findById(id)
    .select("+questions.correctAnswer");

  if (!quiz) {
    throw createError(404, "Quiz not found");
  }

  const totalQuestions = quiz.questions.length;

  if (totalQuestions === 0) {
    throw createError(400, "This quiz has no questions");
  }

  if (data.answers.length !== totalQuestions) {
    throw createError(400, "Submit exactly one answer per question");
  }

  const questionIds = new Set(
    quiz.questions.map((question) => question._id.toString())
  );

  const submittedAnswers = new Map();

  for (const item of data.answers) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof item.questionId !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(item.questionId) ||
      !["A", "B", "C", "D"].includes(item.answer)
    ) {
      throw createError(
        400,
        "Each answer needs a valid questionId and an answer: A, B, C or D"
      );
    }

    const questionId = item.questionId.toLowerCase();

    if (!questionIds.has(questionId)) {
      throw createError(400, "A question does not belong to this quiz");
    }

    if (submittedAnswers.has(questionId)) {
      throw createError(400, "Do not answer the same question twice");
    }

    submittedAnswers.set(questionId, item.answer);
  }

  let score = 0;

  for (const question of quiz.questions) {
    const answer = submittedAnswers.get(question._id.toString());

    if (answer === question.correctAnswer) {
      score += 1;
    }
  }

  const percentage = Math.round((score / totalQuestions) * 10000) / 100;

  const result = {
    quizId: quiz._id,
    score,
    totalQuestions,
    percentage,
  };

  const config = getCertificateConfig();
  const learner = resolveLearner(config);
  if (!learner) return result;

  const formation = await Formation.findById(quiz.formation)
    .select("title")
    .lean();
  if (!formation) {
    throw createError(404, "Formation not found");
  }

  // Compare the actual ratio, not the rounded percentage returned for display.
  const { passingPercentage } = config;
  const passed = score / totalQuestions >= passingPercentage / 100;

  let attempt;
  try {
    attempt = await QuizAttempt.create({
      quizId: quiz._id,
      formationId: quiz.formation,
      quizTitle: quiz.title,
      formationTitle: formation.title,
      learnerIdentifier: learner.identifier,
      learnerDisplayName: learner.displayName,
      score,
      totalQuestions,
      percentage,
      passingPercentage,
      passed,
    });
  } catch (error) {
    throw createError(503, "Unable to save quiz attempt. Please try again.");
  }

  return { ...result, attemptId: attempt._id, passingPercentage, passed };
}
module.exports = {
  createQuiz,
  listQuizzes,
  getQuizById,
  updateQuiz,
  deleteQuiz,
  submitQuiz,
};
