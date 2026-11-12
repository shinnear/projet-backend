
const mongoose = require("mongoose");

const microprojetSchema = new mongoose.Schema({
  titre: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    default: ""
  },

  budget: {
    type: Number,
    required: true,
    min: 0
  },

  statut: {
    type: String,
    enum: ["En attente", "Approuvé", "Rejeté"],
    default: "En attente"
  },

  dateCreation: {
    type: Date,
    default: Date.now
  },


scoreEcologique: {
  type: Number,
  min: 0,
  max: 100,
  default: null
},

niveauEcologique: {
  type: String,
  enum: [
    "Impact écologique faible",
    "Impact écologique modéré",
    "Impact écologique élevé"
  ],
  default: null
},

detailODD: {
  odd8: {
    type: Number,
    min: 0,
    max: 20
  },
  odd9: {
    type: Number,
    min: 0,
    max: 20
  },
  odd12: {
    type: Number,
    min: 0,
    max: 30
  },
  odd13: {
    type: Number,
    min: 0,
    max: 30
  }
}

});


module.exports = mongoose.model(
  'MicroprojetLocal',
  microprojetSchema,
  'microprojets'
);

