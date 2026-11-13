require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const trainingRoutes = require("./modules/trainings/routes");
const quizRoutes = require("./modules/quizzes/routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Training backend is running",
  });
});

app.use("/api/trainings", trainingRoutes);
app.use("/api/quizzes", quizRoutes);
// Handle unknown endpoints.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Central error handler: keep this after the routes.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: Object.values(error.errors).map((item) => ({
        field: item.path,
        message: item.message,
      })),
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
    });
  }
  if ([400, 403, 404, 413, 422, 429, 502, 503, 504].includes(error.statusCode)) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

module.exports = app;
