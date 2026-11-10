const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    enonce: {
      type: String,
      required: [true, "L'énoncé de la question est requis"],
      trim: true,
    },
    choix: {
      type: [String],
      validate: {
        validator: (arr) => arr.length >= 2,
        message: 'Une question doit avoir au moins 2 choix',
      },
    },
    bonneReponse: {
      type: String,
      required: [true, 'La bonne réponse est requise'],
    },
    points: {
      type: Number,
      default: 1,
      min: [1, 'Les points doivent être au moins 1'],
    },
  },
  { _id: false }
);

const quizzSchema = new mongoose.Schema(
  {
    formationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Formation',
      required: [true, 'La formation est requise'],
    },
    titre: {
      type: String,
      required: [true, 'Le titre du quizz est requis'],
      trim: true,
    },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (arr) => arr.length >= 1,
        message: 'Un quizz doit avoir au moins 1 question',
      },
    },
    dureeMax: {
      type: Number, // in minutes
      min: [1, 'La durée minimale est 1 minute'],
    },
  },
  { timestamps: true, versionKey: false }
);

quizzSchema.index({ formationId: 1 });

module.exports = mongoose.model('Quizz', quizzSchema);
