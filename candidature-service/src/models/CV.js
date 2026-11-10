const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema(
  {
    poste: { type: String, required: true, trim: true },
    entreprise: { type: String, required: true, trim: true },
    dateDebut: { type: Date, required: true },
    dateFin: { type: Date }, // null = current job
    description: { type: String, trim: true },
  },
  { _id: false }
);

const formationSchema = new mongoose.Schema(
  {
    diplome: { type: String, required: true, trim: true },
    etablissement: { type: String, required: true, trim: true },
    annee: { type: Number, min: 1950, max: 2100 },
  },
  { _id: false }
);

const cvSchema = new mongoose.Schema(
  {
    candidatId: {
      type: String, // userId from user-service
      required: [true, 'Le candidat est requis'],
    },
    titre: {
      type: String,
      trim: true,
      default: 'Mon CV',
    },
    experiences: {
      type: [experienceSchema],
      default: [],
    },
    formations: {
      type: [formationSchema],
      default: [],
    },
    competences: {
      type: [String],
      default: [],
    },
    langues: {
      type: [String],
      default: [],
    },
    lienLinkedin: {
      type: String,
      trim: true,
      match: [/^https?:\/\/(www\.)?linkedin\.com\/.*/, 'URL LinkedIn invalide'],
    },
  },
  { timestamps: true, versionKey: false }
);

cvSchema.index({ candidatId: 1 });

module.exports = mongoose.model('CV', cvSchema);
