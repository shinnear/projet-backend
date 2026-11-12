
const Microprojet = require("../models/MicroprojetLocal");

const { detecterDoublons } = require("../services/detectionDoublonsService");


const { calculerScoreEcologique } = require("../services/scoreEcologiqueService");


// 1. Ajouter un microprojet

const addMicroprojet = async (req, res) => {
  try {
    const { titre } = req.body;

    // Vérifier le titre
    if (typeof titre !== "string" || !titre.trim()) {
      return res.status(400).json({
        message: "Le titre est obligatoire"
      });
    }

    // Détecter les doublons avant la création
    const doublons = await detecterDoublons(titre);

    if (doublons.length > 0) {
      return res.status(409).json({
        message: "Un microprojet similaire existe déjà",
        doublonDetecte: true,
        projetsSimilaires: doublons
      });
    }

    // Aucun doublon : créer le microprojet
    const microprojet = new Microprojet(req.body);
    await microprojet.save();

    return res.status(201).json({
      message: "Microprojet créé avec succès",
      microprojet
    });

  } catch (error) {
    return res.status(400).json({
      message: error.message
    });
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


const verifierDoublons = async (req, res) => {
  try {
    const { titre } = req.body;

    if (typeof titre !== "string" || !titre.trim()) {
      return res.status(400).json({
        message: "Le titre du microprojet est obligatoire"
      });
    }

    const doublons = await detecterDoublons(titre);

    return res.status(200).json({
      titreRecherche: titre,
      doublonDetecte: doublons.length > 0,
      nombreDoublons: doublons.length,
      projetsSimilaires: doublons
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};


const evaluerScoreEcologique = async (req, res) => {
  try {
    const criteres = req.body;

    // Vérifier que les critères sont envoyés
    if (
      !criteres ||
      typeof criteres !== "object" ||
      Array.isArray(criteres)
    ) {
      return res.status(400).json({
        message: "Les critères écologiques sont obligatoires"
      });
    }

    // Calculer le score écologique
    const resultat = calculerScoreEcologique(criteres);

    return res.status(200).json({
      message: "Score écologique calculé avec succès",
      ...resultat
    });

  } catch (error) {
    return res.status(400).json({
      message: error.message
    });
  }
};


// Exporter les fonctions
module.exports = {
  addMicroprojet,
  showAllMicroprojets,
  showMicroprojet,
  updateMicroprojet,
  deleteMicroprojet,
  verifierDoublons,
  evaluerScoreEcologique

};
