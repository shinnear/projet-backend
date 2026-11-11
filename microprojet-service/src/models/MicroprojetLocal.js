
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
  }
});


module.exports = mongoose.model(
  'MicroprojetLocal',
  microprojetSchema,
  'microprojets'
);

