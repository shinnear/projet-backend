
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


const enregistrerScoreEcologique = async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que le microprojet existe
    const microprojet = await Microprojet.findById(id);

    if (!microprojet) {
      return res.status(404).json({
        message: "Microprojet introuvable"
      });
    }

    // Calculer le score à partir des critères
    const resultat = calculerScoreEcologique(req.body);

    // Enregistrer les résultats dans le microprojet
    microprojet.scoreEcologique = resultat.scoreTotal;
    microprojet.niveauEcologique = resultat.niveau;
    microprojet.detailODD = resultat.detailODD;

    await microprojet.save();

    return res.status(200).json({
      message: "Score écologique enregistré avec succès",
      microprojet
    });

  } catch (error) {
    // Identifiant MongoDB incorrect
    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Identifiant du microprojet invalide"
      });
    }

    // Erreur de validation des critères
    if (error.message.startsWith("Score invalide")) {
      return res.status(400).json({
        message: error.message
      });
    }

    return res.status(500).json({
      message: error.message
    });
  }
};

const rechercherMicroprojets = async (req, res) => {
  try {
    const { mot } = req.query;

    if (!mot || typeof mot !== "string" || !mot.trim()) {
      return res.status(400).json({
        message: "Le mot de recherche est obligatoire"
      });
    }

    const motSecurise = mot.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const microprojets = await Microprojet.find({
      titre: {
        $regex: motSecurise,
        $options: "i"
      }
    });

    return res.status(200).json({
      nombreResultats: microprojets.length,
      microprojets
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};



const trierMicroprojets = async (req, res) => {
  try {
    const { ordre = "asc" } = req.query;

    if (!["asc", "desc"].includes(ordre)) {
      return res.status(400).json({
        message: "L'ordre doit être asc ou desc"
      });
    }

    const direction = ordre === "asc" ? 1 : -1;

    const microprojets = await Microprojet.find()
      .sort({ budget: direction, _id: 1 });

    return res.status(200).json({
      ordre,
      nombreResultats: microprojets.length,
      microprojets
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};


const statistiquesMicroprojets = async (req, res) => {
  try {
    const resultats = await Microprojet.aggregate([
      {
        $group: {
          _id: null,
          nombreTotal: { $sum: 1 },
          budgetTotal: { $sum: "$budget" },
          budgetMoyen: { $avg: "$budget" },
          budgetMinimum: { $min: "$budget" },
          budgetMaximum: { $max: "$budget" }
        }
      }
    ]);

    const parStatut = await Microprojet.aggregate([
      {
        $group: {
          _id: "$statut",
          nombre: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const stats = resultats[0] || {
      nombreTotal: 0,
      budgetTotal: 0,
      budgetMoyen: 0,
      budgetMinimum: 0,
      budgetMaximum: 0
    };

    return res.status(200).json({
      nombreTotal: stats.nombreTotal,
      budgetTotal: stats.budgetTotal,
      budgetMoyen: Math.round(stats.budgetMoyen * 100) / 100,
      budgetMinimum: stats.budgetMinimum,
      budgetMaximum: stats.budgetMaximum,
      projetsParStatut: parStatut
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};

const paginerMicroprojets = async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 5);

    // Vérifier les paramètres
    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        message: "Page invalide ou limite hors de 1 à 100"
      });
    }

    // Nombre de documents à ignorer
    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({
        message: "Numéro de page trop élevé"
      });
    }

    // Nombre total de microprojets
    const total = await Microprojet.countDocuments();

    // Récupérer uniquement les projets de cette page
    const microprojets = await Microprojet.find()
      .sort({ dateCreation: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      microprojets
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};


const filtrerMicroprojets = async (req, res) => {
  try {
    const {
      statut,
      budgetMin,
      budgetMax,
      scoreMin
    } = req.query;

    const filtre = {};

    // 1. Filtrer par statut
    if (statut !== undefined) {
      if (!["En attente", "Approuvé", "Rejeté"].includes(statut)) {
        return res.status(400).json({
          message: "Statut invalide"
        });
      }

      filtre.statut = statut;
    }

    // 2. Vérifier les valeurs numériques
    const valeurs = { budgetMin, budgetMax, scoreMin };

    for (const [nom, valeur] of Object.entries(valeurs)) {
      if (valeur !== undefined) {
        if (
          valeur.trim() === "" ||
          !Number.isFinite(Number(valeur)) ||
          Number(valeur) < 0
        ) {
          return res.status(400).json({
            message: `${nom} doit être un nombre positif`
          });
        }
      }
    }

    // 3. Filtrer par budget
    if (budgetMin !== undefined || budgetMax !== undefined) {
      filtre.budget = {};

      if (budgetMin !== undefined) {
        filtre.budget.$gte = Number(budgetMin);
      }

      if (budgetMax !== undefined) {
        filtre.budget.$lte = Number(budgetMax);
      }

      if (
        budgetMin !== undefined &&
        budgetMax !== undefined &&
        Number(budgetMin) > Number(budgetMax)
      ) {
        return res.status(400).json({
          message: "budgetMin ne peut pas dépasser budgetMax"
        });
      }
    }

    // 4. Filtrer par score écologique
    if (scoreMin !== undefined) {
      if (Number(scoreMin) > 100) {
        return res.status(400).json({
          message: "scoreMin ne peut pas dépasser 100"
        });
      }

      filtre.scoreEcologique = {
        $gte: Number(scoreMin),
        $lte: 100
      };
    }

    // 5. Rechercher les projets correspondants
    const microprojets = await Microprojet.find(filtre);

    return res.status(200).json({
      nombreResultats: microprojets.length,
      filtresAppliques: filtre,
      microprojets
    });

  } catch (error) {
    return res.status(500).json({
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

  // Métiers simples
  rechercherMicroprojets,
  trierMicroprojets,
  statistiquesMicroprojets,
  paginerMicroprojets,
  filtrerMicroprojets,

  // Métiers avancés
  verifierDoublons,
  evaluerScoreEcologique,
  enregistrerScoreEcologique
};

