const express = require("express");
const quizController = require("./controller");
const certificateController = require("./certificate-controller");

const router = express.Router();

router.get("/", quizController.listQuizzes);
router.get("/attempts/:attemptId/certificate", certificateController.downloadCertificate);
router.get("/:id", quizController.getQuizById);

// Local testing only; authentication and role checks are still pending.
router.post("/", quizController.createQuiz);
router.put("/:id", quizController.updateQuiz);
router.delete("/:id", quizController.deleteQuiz);
router.post("/:id/submit", quizController.submitQuiz);

module.exports = router;
