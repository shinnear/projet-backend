const PDFDocument = require("pdfkit");

const GREEN = "#17633F";
const INK = "#20392C";
const MUTED = "#617268";

function snapshotText(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing certificate snapshot");
  }
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function fittedText(doc, text, { x = 64, y, width = 714, height, size, font = "Helvetica", color = INK, align = "center" }) {
  const options = { width, align, lineGap: 3 };
  // Wrap and shrink within separate boxes; never truncate or overlap snapshots.
  for (let fontSize = size; fontSize >= 10; fontSize -= 0.5) {
    doc.font(font).fontSize(fontSize);
    const measured = doc.heightOfString(text, options);
    if (measured <= height) {
      doc.fillColor(color).text(text, x, y + (height - measured) / 2, options);
      return;
    }
  }
  throw new Error("Certificate text exceeds the readable one-page layout");
}

function drawCertificate(doc, attempt) {
  const name = snapshotText(attempt.learnerDisplayName);
  const formation = snapshotText(attempt.formationTitle);
  const quiz = snapshotText(attempt.quizTitle);
  const submittedAt = new Date(attempt.submittedAt);
  if (!Number.isFinite(submittedAt.getTime()) || !Number.isFinite(attempt.percentage) || attempt.percentage < 0 || attempt.percentage > 100) {
    throw new Error("Invalid certificate details");
  }
  const number = `GJ-${String(attempt._id).toLowerCase()}`;
  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
  }).format(submittedAt);
  const percentage = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(attempt.percentage);

  const { width, height } = doc.page;
  doc.rect(0, 0, width, height).fill("#FFFFFF");
  doc.lineWidth(0.8).rect(26, 26, width - 52, height - 52).stroke("#B8D6C5");
  doc.rect(26, 26, 6, height - 52).fill(GREEN);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(GREEN).text("GreenJob", 58, 50, { lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("FORMATION & COMPÉTENCES", 480, 59, { width: 300, align: "right" });
  doc.rect(58, 94, 54, 3).fill(GREEN);

  fittedText(doc, "Certificat de réussite au quiz", { y: 110, height: 48, size: 32, font: "Helvetica-Bold" });
  doc.font("Helvetica").fontSize(11).fillColor(MUTED)
    .text("Ce certificat atteste la réussite de", 64, 173, { width: 714, align: "center" });
  fittedText(doc, name, { y: 193, height: 65, size: 28, font: "Helvetica-Bold", color: GREEN });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED)
    .text("au quiz de la formation", 64, 269, { width: 714, align: "center" });
  fittedText(doc, formation, { y: 286, height: 62, size: 21, font: "Helvetica-Bold" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("QUIZ", 64, 359, { width: 714, align: "center" });
  fittedText(doc, quiz, { y: 374, height: 44, size: 16 });

  doc.roundedRect(64, 434, 714, 44, 5).fill("#F0F7F2");
  fittedText(doc, `Résultat : ${attempt.score} / ${attempt.totalQuestions} — ${percentage} %`, {
    y: 434, height: 44, size: 15, font: "Helvetica-Bold", color: GREEN,
  });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Date de réussite", 64, 501, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(date, 64, 518, { lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("Numéro de certificat", 448, 501, { width: 330, align: "right" });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK)
    .text(number, 448, 518, { width: 330, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text("Mode démonstration", 64, 552, { width: 714, align: "center" });
}

function generateCertificate(attempt) {
  return new Promise((resolve, reject) => {
    let doc;
    try {
      const submittedAt = new Date(attempt.submittedAt);
      doc = new PDFDocument({
        size: "A4", layout: "landscape", margin: 0, bufferPages: true,
        lang: "fr-FR",
        info: {
          Title: "Certificat de réussite au quiz", Author: "GreenJob",
          CreationDate: submittedAt, ModDate: submittedAt,
        },
      });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.once("error", reject);
      doc.once("end", () => resolve(Buffer.concat(chunks)));
      drawCertificate(doc, attempt);
      if (doc.bufferedPageRange().count !== 1) throw new Error("Certificate must have one page");
      doc.end();
    } catch (error) {
      doc?.destroy();
      reject(error);
    }
  });
}

module.exports = { generateCertificate };
