const mongoose = require('mongoose');

const offreSchema = new mongoose.Schema(
  {
    titre: {
      type: String,
      required: [true, 'Le titre est requis'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'La description est requise'],
      trim: true,
    },
    recruteurId: {
      type: String, // userId from user-service (no cross-service ObjectId ref)
      required: [true, 'Le recruteur est requis'],
    },
    domaine: {
      type: String,
      trim: true,
    },
    competencesRequises: {
      type: [String],
      default: [],
    },
    typeContrat: {
      type: String,
      enum: ['CDI', 'CDD', 'stage', 'freelance'],
      required: [true, 'Le type de contrat est requis'],
    },
    localisation: {
      type: String,
      trim: true,
    },
    salaire: {
      type: Number,
      min: [0, 'Le salaire ne peut pas être négatif'],
    },
    datePublication: {
      type: Date,
      default: Date.now,
    },
    dateLimite: {
      type: Date,
    },
    statut: {
      type: String,
      enum: ['active', 'fermée'],
      default: 'active',
    },
  },
  { timestamps: true, versionKey: false }
);

// Index for common query patterns
offreSchema.index({ statut: 1 });
offreSchema.index({ domaine: 1 });
offreSchema.index({ recruteurId: 1 });
offreSchema.index({ typeContrat: 1 });

module.exports = mongoose.model('Offre', offreSchema);
