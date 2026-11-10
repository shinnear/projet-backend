const mongoose = require('mongoose');

const avisSchema = new mongoose.Schema(
  {
    auteurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, "L'auteur est requis"],
    },
    cibleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'La cible est requise'],
    },
    note: {
      type: Number,
      required: [true, 'La note est requise'],
      min: [1, 'La note minimale est 1'],
      max: [5, 'La note maximale est 5'],
    },
    commentaire: {
      type: String,
      trim: true,
      maxlength: [1000, 'Le commentaire ne peut pas dépasser 1000 caractères'],
    },
  },
  { timestamps: true, versionKey: false }
);

// A user can only leave one review per target
avisSchema.index({ auteurId: 1, cibleId: 1 }, { unique: true });

module.exports = mongoose.model('Avis', avisSchema);
