const express = require("express");
const trainingController = require("./controller");
const uploadCoursePdf = require("./pdf-upload");
const createChatRateLimit = require("./chat-rate-limit");

const router = express.Router();

router.get("/", trainingController.listFormations);
router.post("/:id/chat", createChatRateLimit(), trainingController.chatWithFormation);
router.get("/:id/pdf", trainingController.downloadCoursePdf);
router.post(
  "/:id/pdf",
  trainingController.validatePdfFormation,
  uploadCoursePdf,
  trainingController.attachCoursePdf
);
router.get("/:id", trainingController.getFormationById);

// Temporary local testing route; JWT authorization comes next.
router.post("/", trainingController.createFormation);
router.put("/:id", trainingController.updateFormation);
router.delete("/:id", trainingController.deleteFormation);

module.exports = router;
