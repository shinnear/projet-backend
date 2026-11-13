const QuizAttempt = require("./attempt-model");
const { getCertificateDemoConfig } = require("../../config/certificates");
const learnerResolver = require("./learner");
const certificatePdf = require("./certificate-pdf");

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getCertificate(attemptId) {
  if (typeof attemptId !== "string" || !/^[a-fA-F0-9]{24}$/.test(attemptId)) {
    throw createError(400, "Invalid attempt ID");
  }

  // Identity requires only the demo gate, never today's grading threshold.
  const config = getCertificateDemoConfig();
  let learner;
  try {
    learner = await learnerResolver.resolveLearner(config);
  } catch {
    throw createError(503, "Certificate learner identity is unavailable");
  }
  if (!learner?.identifier) {
    throw createError(503, "Certificate learner identity is unavailable");
  }

  let attempt;
  try {
    attempt = await QuizAttempt.findOne({
      _id: attemptId,
      learnerIdentifier: learner.identifier,
    }).lean();
  } catch {
    throw createError(503, "Unable to load quiz attempt. Please try again.");
  }
  if (!attempt || attempt.learnerIdentifier !== learner.identifier) {
    throw createError(404, "Quiz attempt not found");
  }

  const { score, totalQuestions, passingPercentage } = attempt;
  if (
    attempt.passed !== true ||
    !Number.isSafeInteger(score) || score < 0 ||
    !Number.isSafeInteger(totalQuestions) || totalQuestions < 1 ||
    score > totalQuestions ||
    !Number.isFinite(passingPercentage) || passingPercentage < 0 || passingPercentage > 100 ||
    score / totalQuestions < passingPercentage / 100
  ) {
    throw createError(
      403,
      "Certificate unavailable: this attempt does not meet the saved passing requirements"
    );
  }

  let buffer;
  try {
    buffer = await certificatePdf.generateCertificate(attempt);
  } catch {
    throw createError(503, "Unable to generate certificate PDF. Please try again.");
  }

  return { buffer, filename: `certificat-GJ-${String(attempt._id).toLowerCase()}.pdf` };
}

module.exports = { getCertificate };
