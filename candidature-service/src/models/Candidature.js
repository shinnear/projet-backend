const mongoose = require('mongoose');

const statuts = ['envoyée', 'vue', 'acceptée', 'rejetée'];

const historiqueSchema = new mongoose.Schema(
  {
    statut: {
      type: String,
      enum: statuts,
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    auteurId: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

const candidatureSchema = new mongoose.Schema(
  {
    candidatId: {
      type: String,
      required: [true, 'Le candidat est requis']
    },
    offreId: {
      type: String,
      required: [true, 'L’offre est requise']
    },
    cvId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CV',
      required: [true, 'Le CV est requis']
    },
    lettreMotivation: {
      type: String,
      trim: true,
      maxlength: [
        3000,
        'La lettre de motivation ne peut pas dépasser 3000 caractères'
      ]
    },
    statut: {
      type: String,
      enum: statuts,
      default: 'envoyée',
      required: true
    },
    emailNotification: {
      type: String,
      trim: true,
      maxlength: 254,
      select: false,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Email invalide'
      ]
    },
    historiqueStatuts: {
      type: [historiqueSchema],
      default: []
    },
    dateMiseAJour: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

candidatureSchema.index(
  { candidatId: 1, offreId: 1 },
  { unique: true }
);

candidatureSchema.index({ candidatId: 1 });
candidatureSchema.index({ offreId: 1 });
candidatureSchema.index({ statut: 1 });

candidatureSchema.pre('save', function () {
  this.dateMiseAJour = new Date();
});

module.exports = mongoose.model('Candidature', candidatureSchema);