
const Microprojet = require("../models/MicroprojetLocal");
// 1. Ajouter un microprojet
const addMicroprojet = async (req, res) => {
  try {
    const microprojet = new Microprojet(req.body);
    await microprojet.save();

    res.status(201).json(microprojet);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 2. Afficher tous les microprojets
const showAllMicroprojets = async (req, res) => {
  try {
    const microprojets = await Microprojet.find();

    res.status(200).json(microprojets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Afficher un microprojet par ID
const showMicroprojet = async (req, res) => {
  try {
    const microprojet = await Microprojet.findById(req.params.id);

    if (!microprojet) {
      return res.status(404).json({
        message: "Microprojet introuvable"
      });
    }

    res.status(200).json(microprojet);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 4. Modifier un microprojet
const updateMicroprojet = async (req, res) => {
  try {
    const microprojet = await Microprojet.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!microprojet) {
      return res.status(404).json({
        message: "Microprojet introuvable"
      });
    }

    res.status(200).json(microprojet);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 5. Supprimer un microprojet
const deleteMicroprojet = async (req, res) => {
  try {
    const microprojet = await Microprojet.findByIdAndDelete(
      req.params.id
    );

    if (!microprojet) {
      return res.status(404).json({
        message: "Microprojet introuvable"
      });
    }

    res.status(200).json({
      message: "Microprojet supprimé avec succès"
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Exporter les fonctions
module.exports = {
  addMicroprojet,
  showAllMicroprojets,
  showMicroprojet,
  updateMicroprojet,
  deleteMicroprojet
};
