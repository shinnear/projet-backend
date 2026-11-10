const mongoose = require('mongoose');

const candidatureSchema = new mongoose.Schema(
  {
    candidatId: {
      type: String, // userId from user-service
      required: [true, 'Le candidat est requis'],
    },
    offreId: {
      type: String, // offreId from offre-service
      required: [true, "L'offre est requise"],
    },
    cvId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CV',
      required: [true, 'Le CV est requis'],
    },
    lettreMotivation: {
      type: String,
      trim: true,
      maxlength: [3000, 'La lettre de motivation ne peut pas dépasser 3000 caractères'],
    },
    statut: {
      type: String,
      enum: ['envoyée', 'vue', 'acceptée', 'rejetée'],
      default: 'envoyée',
    },
    dateMiseAJour: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, versionKey: false }
);

// Prevent a candidate from applying to the same offer twice
candidatureSchema.index({ candidatId: 1, offreId: 1 }, { unique: true });
candidatureSchema.index({ candidatId: 1 });
candidatureSchema.index({ offreId: 1 });
candidatureSchema.index({ statut: 1 });

// Auto-update dateMiseAJour on save
candidatureSchema.pre('save', function (next) {
  this.dateMiseAJour = new Date();
  next();
});

module.exports = mongoose.model('Candidature', candidatureSchema);
