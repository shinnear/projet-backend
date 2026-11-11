
const Categorie = require("../models/Categorie");

// 1. Ajouter une catégorie
const addCategorie = async (req, res) => {
  try {
    const categorie = new Categorie(req.body);
    await categorie.save();

    res.status(201).json(categorie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 2. Afficher toutes les catégories
const showAllCategories = async (req, res) => {
  try {
    const categories = await Categorie.find();

    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Afficher une catégorie par ID
const showCategorie = async (req, res) => {
  try {
    const categorie = await Categorie.findById(req.params.id);

    if (!categorie) {
      return res.status(404).json({
        message: "Catégorie introuvable"
      });
    }

    res.status(200).json(categorie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 4. Modifier une catégorie
const updateCategorie = async (req, res) => {
  try {
    const categorie = await Categorie.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!categorie) {
      return res.status(404).json({
        message: "Catégorie introuvable"
      });
    }

    res.status(200).json(categorie);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 5. Supprimer une catégorie
const deleteCategorie = async (req, res) => {
  try {
    const categorie = await Categorie.findByIdAndDelete(
      req.params.id
    );

    if (!categorie) {
      return res.status(404).json({
        message: "Catégorie introuvable"
      });
    }

    res.status(200).json({
      message: "Catégorie supprimée avec succès"
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  addCategorie,
  showAllCategories,
  showCategorie,
  updateCategorie,
  deleteCategorie
};
