const mongoose = require('mongoose');

const recommandationSchema = new mongoose.Schema(
  {
    offreId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Offre',
      required: [true, "L'offre est requise"],
    },
    candidatId: {
      type: String, // userId from user-service
      required: [true, 'Le candidat est requis'],
    },
    candidatNom: {
      type: String, // cached from user-service for display
    },
    candidatPrenom: {
      type: String,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    raisonRecommandation: {
      type: String, // human-readable explanation e.g. "Compétences: JavaScript, Node.js"
    },
    competencesCorrespondantes: {
      type: [String], // which competences matched
      default: [],
    },
    dateGeneree: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, versionKey: false }
);

// A candidate can only have one recommendation per offer
recommandationSchema.index({ offreId: 1, candidatId: 1 }, { unique: true });
recommandationSchema.index({ offreId: 1, score: -1 }); // for sorted queries

module.exports = mongoose.model('Recommandation', recommandationSchema);
