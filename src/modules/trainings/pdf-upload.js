const path = require("node:path");
const multer = require("multer");
const { MAX_PDF_SIZE } = require("./pdf-storage");

const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: "utf8",
  limits: { fileSize: MAX_PDF_SIZE, files: 1, fields: 0, parts: 1, fieldNameSize: 100 },
  fileFilter(req, file, callback) {
    if (
      path.extname(file.originalname).toLowerCase() !== ".pdf" ||
      file.mimetype !== "application/pdf"
    ) {
      const error = new Error("File must have a .pdf extension and application/pdf MIME type");
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
}).single("file");

function uploadCoursePdf(req, res, next) {
  if (!req.is("multipart/form-data")) {
    const error = new Error('Use multipart/form-data with one PDF in the "file" field');
    error.statusCode = 400;
    return next(error);
  }
  upload(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        error.message = error.code === "LIMIT_FILE_SIZE"
          ? "PDF must not exceed 10 MB"
          : 'Provide exactly one PDF in the "file" field and no other fields';
      } else if (!error.statusCode) {
        // Busboy uses ordinary errors for malformed or truncated multipart bodies.
        error.statusCode = 400;
        error.message = "Invalid multipart upload";
      }
    }
    next(error);
  });
}

module.exports = uploadCoursePdf;
