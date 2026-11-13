const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema({
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
  },
  formationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Formation",
    required: true,
  },
  quizTitle: { type: String, required: true },
  formationTitle: { type: String, required: true },
  learnerIdentifier: { type: String, required: true },
  learnerDisplayName: { type: String, required: true },
  score: {
    type: Number,
    required: true,
    min: 0,
    validate: Number.isSafeInteger,
  },
  totalQuestions: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger,
  },
  percentage: { type: Number, required: true, min: 0, max: 100 },
  passingPercentage: { type: Number, required: true, min: 0, max: 100 },
  passed: { type: Boolean, required: true },
  submittedAt: { type: Date, required: true, default: Date.now },
});

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
