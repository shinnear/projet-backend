const mongoose = require('mongoose');

const domaineSchema = new mongoose.Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom du domaine est requis'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    icone: {
      type: String, // emoji or icon name e.g. "💻", "📱"
      trim: true,
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('Domaine', domaineSchema);
