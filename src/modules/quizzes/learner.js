// Replace this resolver with authenticated learner context when auth is added.
// Only call it with validated server-side certificate configuration.
function resolveLearner(config) {
  if (!config.demoMode) return null;

  return {
    identifier: "demo-learner",
    displayName: "Apprenant de démonstration",
  };
}

module.exports = { resolveLearner };
