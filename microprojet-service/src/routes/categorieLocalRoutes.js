
const express = require("express");
const router = express.Router();

const categorieController = require("../controllers/CategorieController");
// Ajouter une catégorie
router.post("/", categorieController.addCategorie);

// Afficher toutes les catégories
router.get("/", categorieController.showAllCategories);

// Afficher une catégorie par ID
router.get("/:id", categorieController.showCategorie);

// Modifier une catégorie
router.put("/:id", categorieController.updateCategorie);

// Supprimer une catégorie
router.delete("/:id", categorieController.deleteCategorie);

module.exports = router;
