const mongoose = require("mongoose");
const { MAX_PDF_SIZE, STORAGE_KEY_PATTERN } = require("./pdf-storage");

const coursePdfSchema = new mongoose.Schema(
  {
    storageKey: { type: String, required: true, match: STORAGE_KEY_PATTERN },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, enum: ["application/pdf"] },
    size: { type: Number, required: true, min: 1, max: MAX_PDF_SIZE, validate: Number.isInteger },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false }
);

const formationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      enum: [
        "énergie",
        "recyclage",
        "agriculture",
        "numérique",
        "gestion",
        "autre",
      ],
    },

    level: {
      type: String,
      required: true,
      enum: ["débutant", "intermédiaire", "avancé"],
    },

    duration: {
      type: Number,
      required: true,
      validate: {
        validator: (value) => Number.isFinite(value) && value > 0,
        message: "Duration must be greater than 0 hours",
      },
    },

    provider: {
      type: String,
      required: true,
      trim: true,
    },

    isFree: {
      type: Boolean,
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (value) {
          return Number.isFinite(value) && (!this.isFree || value === 0);
        },
        message: "Price must be finite and equal to 0 for free training",
      },
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return this.startDate && value > this.startDate;
        },
        message: "End date must be after start date",
      },
    },

    capacity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Capacity must be a whole number",
      },
    },

    mode: {
      type: String,
      required: true,
      enum: ["présentiel", "en ligne"],
    },

    region: {
      type: String,
      trim: true,
      required: function () {
        return this.mode === "présentiel";
      },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    coursePdf: { type: coursePdfSchema, default: undefined },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Formation", formationSchema);
