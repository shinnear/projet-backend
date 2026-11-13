const mongoose = require("mongoose");

// Structure of a question stored inside a quiz.
const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
  },

  options: {
    A: {
      type: String,
      required: true,
      trim: true,
    },
    B: {
      type: String,
      required: true,
      trim: true,
    },
    C: {
      type: String,
      required: true,
      trim: true,
    },
    D: {
      type: String,
      required: true,
      trim: true,
    },
  },

  correctAnswer: {
    type: String,
    required: true,
    enum: ["A", "B", "C", "D"],
    select: false,
  },
});

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    formation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Formation",
      required: true,
      index: true,
    },

    questions: {
      type: [questionSchema],
      required: true,
      default: undefined,
      validate: {
        validator: function (value) {
          return (
            Array.isArray(value) &&
            value.length > 0 &&
            value.every((question) => question != null)
          );
        },
        message: "A quiz must contain at least one valid question",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Quiz", quizSchema);