
const express = require("express");
const router = express.Router();

const microprojetController = require(
  "../controllers/MicroprojetLocalController"
);

// ========================================
// 1. MÉTIERS SIMPLES
// ========================================

// Recherche par titre
router.get(
  "/recherche",
  microprojetController.rechercherMicroprojets
);

// Tri par budget
router.get(
  "/tri",
  microprojetController.trierMicroprojets
);

// Statistiques
router.get(
  "/statistiques",
  microprojetController.statistiquesMicroprojets
);

// Pagination
router.get(
  "/pagination",
  microprojetController.paginerMicroprojets
);

// Filtrage par statut, budget et score
router.get(
  "/filtre",
  microprojetController.filtrerMicroprojets
);

// ========================================
// 2. MÉTIERS AVANCÉS
// ========================================

// Vérification des doublons
router.post(
  "/verifier-doublons",
  microprojetController.verifierDoublons
);

// Calcul du score écologique
router.post(
  "/calculer-score",
  microprojetController.evaluerScoreEcologique
);

// Enregistrement du score écologique
router.put(
  "/:id/score-ecologique",
  microprojetController.enregistrerScoreEcologique
);

// ========================================
// 3. CRUD MICROPROJET
// ========================================

// CREATE
router.post(
  "/",
  microprojetController.addMicroprojet
);

// READ ALL
router.get(
  "/",
  microprojetController.showAllMicroprojets
);

// READ BY ID
router.get(
  "/:id",
  microprojetController.showMicroprojet
);

// UPDATE
router.put(
  "/:id",
  microprojetController.updateMicroprojet
);

// DELETE
router.delete(
  "/:id",
  microprojetController.deleteMicroprojet
);

// ========================================
// EXPORT
// ========================================

module.exports = router;
