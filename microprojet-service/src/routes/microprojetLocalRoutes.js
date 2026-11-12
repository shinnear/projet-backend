
const express = require("express");
const router = express.Router();

const microprojetController = require("../controllers/MicroprojetLocalController");


router.put(
  "/:id/score-ecologique",
  microprojetController.enregistrerScoreEcologique
);


router.post("/verifier-doublons", microprojetController.verifierDoublons);

router.post(
  "/calculer-score",
  microprojetController.evaluerScoreEcologique
);
  
// Ajouter un microprojet
router.post("/", microprojetController.addMicroprojet);

// Afficher tous les microprojets
router.get("/", microprojetController.showAllMicroprojets);
// Afficher un microprojet par ID
router.get("/:id", microprojetController.showMicroprojet);

// Modifier un microprojet
router.put("/:id", microprojetController.updateMicroprojet);

// Supprimer un microprojet
router.delete("/:id", microprojetController.deleteMicroprojet);

module.exports = router;
