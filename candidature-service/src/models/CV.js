const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema(
  {
    poste: { type: String, required: true, trim: true },
    entreprise: { type: String, required: true, trim: true },
    dateDebut: { type: Date, required: true },
    dateFin: { type: Date },
    description: { type: String, trim: true }
  },
  { _id: false }
);

const formationSchema = new mongoose.Schema(
  {
    diplome: { type: String, required: true, trim: true },
    etablissement: { type: String, required: true, trim: true },
    annee: { type: Number, min: 1950, max: 2100 }
  },
  { _id: false }
);

const analyseSchema = new mongoose.Schema(
  {
    note: {
      type: Number,
      required: true,
      min: 0,
      max: 10
    },
    resume: {
      type: String,
      required: true,
      maxlength: 3000
    },
    pointsForts: {
      type: [String],
      required: true
    },
    ameliorations: {
      type: [String],
      required: true
    },
    dateAnalyse: {
      type: Date,
      required: true
    }
  },
  { _id: false }
);

const cvSchema = new mongoose.Schema(
  {
    candidatId: {
      type: String,
      required: [true, 'Le candidat est requis']
    },
    titre: {
      type: String,
      required: [true, 'Le titre du CV est obligatoire'],
      trim: true
    },
    experiences: {
      type: [experienceSchema],
      default: []
    },
    formations: {
      type: [formationSchema],
      default: []
    },
    competences: {
      type: [String],
      default: []
    },
    langues: {
      type: [String],
      default: []
    },
    lienLinkedin: {
      type: String,
      trim: true,
      match: [
        /^https?:\/\/(www\.)?linkedin\.com\/.*/i,
        'URL LinkedIn invalide'
      ]
    },
    pdf: {
      type: Buffer,
      select: false
    },
    analyseIA: {
      type: analyseSchema,
      default: undefined
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

cvSchema.index({ candidatId: 1 });

module.exports = mongoose.model('CV', cvSchema);