const mongoose = require('mongoose');

const microProjetSchema = new mongoose.Schema(
  {
    titre: {
      type: String,
      required: [true, 'Le titre est requis'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    proprietaireId: {
      type: String, // userId from user-service
      required: [true, 'Le propriétaire est requis'],
    },
    domaineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Domaine',
      required: [true, 'Le domaine est requis'],
    },
    competencesRequises: {
      type: [String],
      default: [],
    },
    budget: {
      type: Number,
      min: [0, 'Le budget ne peut pas être négatif'],
    },
    statut: {
      type: String,
      enum: ['ouvert', 'en_cours', 'terminé'],
      default: 'ouvert',
    },
    participants: {
      type: [String], // array of userIds from user-service
      default: [],
    },
  },
  { timestamps: true, versionKey: false }
);

microProjetSchema.index({ proprietaireId: 1 });
microProjetSchema.index({ domaineId: 1 });
microProjetSchema.index({ statut: 1 });

module.exports = mongoose.model('MicroProjet', microProjetSchema);
