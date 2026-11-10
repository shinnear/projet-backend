const mongoose = require('mongoose');

const formationSchema = new mongoose.Schema(
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
    formateurId: {
      type: String, // userId from user-service
      required: [true, 'Le formateur est requis'],
    },
    categorie: {
      type: String,
      trim: true,
    },
    niveau: {
      type: String,
      enum: ['débutant', 'intermédiaire', 'avancé'],
      default: 'débutant',
    },
    duree: {
      type: String, // e.g. "10h", "3 jours"
      trim: true,
    },
    contenu: {
      type: [String], // list of module/chapter titles
      default: [],
    },
    inscrits: {
      type: [String], // array of userIds from user-service
      default: [],
    },
    statut: {
      type: String,
      enum: ['active', 'archivée'],
      default: 'active',
    },
  },
  { timestamps: true, versionKey: false }
);

formationSchema.index({ formateurId: 1 });
formationSchema.index({ statut: 1 });
formationSchema.index({ categorie: 1 });

module.exports = mongoose.model('Formation', formationSchema);
