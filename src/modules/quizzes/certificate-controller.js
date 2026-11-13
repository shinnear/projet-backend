const certificateService = require("./certificate-service");

async function downloadCertificate(req, res, next) {
  try {
    const { buffer, filename } = await certificateService.getCertificate(req.params.attemptId);
    // Generate completely before setting download headers or sending any bytes.
    return res.status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `attachment; filename="${filename}"`)
      .set("Cache-Control", "private, no-store")
      .send(buffer);
  } catch (error) {
    next(error);
  }
}

module.exports = { downloadCertificate };
