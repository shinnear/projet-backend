
const calculerScoreEcologique = (criteres) => {
  const {
    emploiDecent,
    innovationDurable,
    productionResponsable,
    actionClimatique
  } = criteres;

  const scores = {
    odd8: emploiDecent,
    odd9: innovationDurable,
    odd12: productionResponsable,
    odd13: actionClimatique
  };

  // Barème maximal par ODD
  const maximums = {
    odd8: 20,
    odd9: 20,
    odd12: 30,
    odd13: 30
  };

  // Vérification des valeurs
  for (const odd of Object.keys(scores)) {
    const valeur = scores[odd];

    if (
      typeof valeur !== "number" ||
      !Number.isFinite(valeur) ||
      valeur < 0 ||
      valeur > maximums[odd]
    ) {
      throw new Error(
        `Score invalide pour ${odd} : valeur attendue entre 0 et ${maximums[odd]}`
      );
    }
  }

  // Calcul du score total
  const scoreTotal =
    scores.odd8 +
    scores.odd9 +
    scores.odd12 +
    scores.odd13;

  let niveau;

  if (scoreTotal >= 80) {
    niveau = "Impact écologique élevé";
  } else if (scoreTotal >= 50) {
    niveau = "Impact écologique modéré";
  } else {
    niveau = "Impact écologique faible";
  }

  return {
    scoreTotal,
    scoreMaximum: 100,
    niveau,
    detailODD: scores
  };
};

module.exports = { calculerScoreEcologique };
