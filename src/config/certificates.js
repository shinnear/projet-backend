function configurationError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function getCertificateDemoConfig(env = process.env) {
  const mode = env.CERTIFICATE_DEMO_MODE ?? "false";
  if (mode !== "true" && mode !== "false") {
    throw configurationError("CERTIFICATE_DEMO_MODE must be true or false");
  }

  // Disabled mode keeps the existing grading path independent of certificates.
  if (mode === "false") return { demoMode: false };

  if (env.NODE_ENV !== "development") {
    throw configurationError(
      "CERTIFICATE_DEMO_MODE=true requires NODE_ENV=development"
    );
  }

  return { demoMode: true };
}

function getCertificateConfig(env = process.env) {
  const demoConfig = getCertificateDemoConfig(env);
  if (!demoConfig.demoMode) return demoConfig;

  const raw = env.CERTIFICATE_PASSING_PERCENTAGE ?? "80";
  const passingPercentage = Number(raw);
  if (
    !/^\d+(?:\.\d+)?$/.test(raw) ||
    !Number.isFinite(passingPercentage) ||
    passingPercentage < 0 ||
    passingPercentage > 100
  ) {
    throw configurationError(
      "CERTIFICATE_PASSING_PERCENTAGE must be a number between 0 and 100"
    );
  }

  return { demoMode: true, passingPercentage };
}

module.exports = { getCertificateConfig, getCertificateDemoConfig };
