const quizService = require("./service");

// Explicitly choose the fields returned by the API.
function toQuizResponse(quiz) {
  return {
    _id: quiz._id,
    title: quiz.title,
    description: quiz.description,
    formation: quiz.formation,
    questions: quiz.questions.map((item) => ({
      _id: item._id,
      question: item.question,
      options: {
        A: item.options.A,
        B: item.options.B,
        C: item.options.C,
        D: item.options.D,
      },
    })),
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  };
}

async function createQuiz(req, res, next) {
  try {
    const quiz = await quizService.createQuiz(req.body);

    return res.status(201).json({
      success: true,
      message: "Quiz created successfully",
      data: toQuizResponse(quiz),
    });
  } catch (error) {
    next(error);
  }
}
async function listQuizzes(req, res, next) {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger((page - 1) * limit)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "page must be a positive integer; limit must be an integer between 1 and 100",
      });
    }

    const result = await quizService.listQuizzes(page, limit);

    return res.status(200).json({
      success: true,
      data: result.quizzes.map(toQuizResponse),
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function getQuizById(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await quizService.getQuizById(id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: toQuizResponse(quiz),
    });
  } catch (error) {
    next(error);
  }
}
async function updateQuiz(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await quizService.updateQuiz(id, req.body);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Quiz updated successfully",
      data: toQuizResponse(quiz),
    });
  } catch (error) {
    next(error);
  }
}
async function deleteQuiz(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await quizService.deleteQuiz(id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Quiz deleted successfully",
      data: {
        _id: quiz._id,
      },
    });
  } catch (error) {
    next(error);
  }
}
async function submitQuiz(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const result = await quizService.submitQuiz(id, req.body);

    return res.status(200).json({
      success: true,
      message: "Quiz graded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
module.exports = { createQuiz, listQuizzes, getQuizById, updateQuiz, deleteQuiz, submitQuiz };