
const Microprojet = require("../models/MicroprojetLocal");

// Mots peu significatifs à ignorer
const motsVides = new Set([
  "de", "des", "du", "d", "la", "le", "les",
  "un", "une", "et", "en", "pour", "au",
  "aux", "a", "l"
]);

// 1. Normaliser le texte
const normaliser = (texte) => {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(mot => mot && !motsVides.has(mot))
    .join(" ");
};

// 2. Calculer la similarité
const calculerSimilarite = (titre1, titre2) => {
  const mots1 = new Set(normaliser(titre1).split(" ").filter(Boolean));
  const mots2 = new Set(normaliser(titre2).split(" ").filter(Boolean));

  if (mots1.size === 0 || mots2.size === 0) {
    return 0;
  }

  const communs = [...mots1].filter(mot => mots2.has(mot));
  const union = new Set([...mots1, ...mots2]);

  return Math.round((communs.length / union.size) * 100);
};

// 3. Détecter les microprojets similaires
const detecterDoublons = async (titre, idExclu = null) => {
  const filtre = {};

  // Exclure le projet lui-même lors d'une modification
  if (idExclu) {
    filtre._id = { $ne: idExclu };
  }

  const projets = await Microprojet.find(filtre, "_id titre");

  return projets
    .map(projet => ({
      id: projet._id,
      titre: projet.titre,
      similarite: calculerSimilarite(titre, projet.titre)
    }))
    .filter(projet => projet.similarite >= 70)
    .sort((a, b) => b.similarite - a.similarite);
};

module.exports = { detecterDoublons };
