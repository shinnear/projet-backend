const Formation = require("./model");
const pdfStorage = require("./pdf-storage");
const chatProvider = require("./chat-provider");
const { performance } = require("node:perf_hooks");
const { createDiagnostics, safeErrorDetails } = require("./chat-diagnostics");

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function cleanupPdf(storageKey) {
  try {
    await pdfStorage.remove(storageKey);
  } catch (error) {
    // A committed database change must not be reported as a failed upload/delete.
    console.error("Could not remove unused course PDF:", error);
  }
}

async function createFormation(data) {
  if (Object.keys(data).some((field) => field === "coursePdf" || field.startsWith("coursePdf."))) {
    throw createError(400, "Course PDF can only be set using the PDF upload endpoint");
  }
  const formation = new Formation({
    title: data.title,
    description: data.description,
    category: data.category,
    level: data.level,
    duration: data.duration,
    provider: data.provider,
    isFree: data.isFree,
    price: data.price,
    startDate: data.startDate,
    endDate: data.endDate,
    capacity: data.capacity,
    mode: data.mode,
    region: data.region,
    createdBy: data.createdBy,
  });

  return formation.save();
}
async function listFormations(page, limit, filters = {}) {
  const skip = (page - 1) * limit;

  const [formations, total] = await Promise.all([
    Formation.find(filters)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Formation.countDocuments(filters),
  ]);

  return {
    formations,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
async function getFormationById(id) {
  return Formation.findById(id).lean();
}
async function updateFormation(id, data) {
  const allowedFields = [
    "title",
    "description",
    "category",
    "level",
    "duration",
    "provider",
    "isFree",
    "price",
    "startDate",
    "endDate",
    "capacity",
    "mode",
    "region",
  ];

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).length === 0
  ) {
    const error = new Error("Provide a non-empty JSON object");
    error.statusCode = 400;
    throw error;
  }

  const invalidFields = Object.keys(data).filter(
    (field) => !allowedFields.includes(field)
  );

  if (invalidFields.length > 0) {
    const error = new Error(
      `Fields cannot be updated: ${invalidFields.join(", ")}`
    );
    error.statusCode = 400;
    throw error;
  }

  const formation = await Formation.findById(id);

  if (!formation) {
    return null;
  }

  for (const field of Object.keys(data)) {
    formation.set(field, data[field]);
  }

  return formation.save();
}
async function deleteFormation(id) {
  const formation = await Formation.findByIdAndDelete(id);
  if (formation?.coursePdf) await cleanupPdf(formation.coursePdf.storageKey);
  return formation;
}

async function requireFormation(id) {
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    throw createError(400, "Invalid formation ID");
  }
  const formation = await Formation.findById(id).lean();
  if (!formation) throw createError(404, "Formation not found");
  return formation;
}

async function attachCoursePdf(id, file) {
  const coursePdf = await pdfStorage.save(file);
  const updatedAt = new Date();
  let previous;
  try {
    // The atomic preimage determines both replacement status and the only old
    // key this request may delete, even across multiple backend processes.
    previous = await Formation.findOneAndUpdate(
      { _id: id },
      { $set: { coursePdf, updatedAt } },
      { returnDocument: "before", runValidators: true, timestamps: false }
    ).lean();
    if (!previous) throw createError(404, "Formation not found");
  } catch (error) {
    // A lost acknowledgement can mean the update committed despite an error.
    // Do not remove a file that the formation now references.
    let canRemove = error.statusCode === 404 || error.name === "ValidationError";
    if (!canRemove) {
      try {
        const current = await Formation.findById(id).select("coursePdf").lean();
        canRemove = current?.coursePdf?.storageKey !== coursePdf.storageKey;
      } catch (verificationError) {
        console.error("Could not verify failed PDF update; retaining file for recovery:", verificationError);
      }
    }
    if (canRemove) await cleanupPdf(coursePdf.storageKey);
    throw error;
  }

  if (previous.coursePdf) await cleanupPdf(previous.coursePdf.storageKey);
  return {
    formation: { ...previous, coursePdf, updatedAt },
    replaced: Boolean(previous.coursePdf),
  };
}

async function getCoursePdf(id) {
  const formation = await requireFormation(id);
  if (!formation.coursePdf) throw createError(404, "Course PDF not found");
  const file = await pdfStorage.open(formation.coursePdf.storageKey);
  return {
    ...file,
    formationId: String(formation._id),
    originalName: formation.coursePdf.originalName,
  };
}

async function chatWithFormation(id, data, signal, diagnostics = createDiagnostics()) {
  if (!/^[a-fA-F0-9]{24}$/.test(id)) throw createError(400, "Invalid formation ID");
  if (
    !data || typeof data !== "object" || Array.isArray(data) ||
    Object.keys(data).length !== 1 || !Object.hasOwn(data, "question") ||
    typeof data.question !== "string"
  ) {
    throw createError(400, 'Provide a JSON object containing only a "question" string');
  }
  const question = data.question.trim();
  if (question.length === 0 || Array.from(question).length > 2000) {
    throw createError(400, "question must contain between 1 and 2000 characters after trimming");
  }

  const readStarted = performance.now();
  diagnostics.emit("pdf_read_start");
  let file;
  let pdf;
  try {
    file = await getCoursePdf(id);
    if (file.size > pdfStorage.MAX_PDF_SIZE) throw createError(413, "PDF must not exceed 10 MB");
    const chunks = [];
    let size = 0;
    // Bound actual bytes, even if the file changes after the initial stat.
    for await (const chunk of file.handle.createReadStream({ autoClose: false })) {
      if (signal?.aborted) throw createError(504, "Chat request was cancelled");
      size += chunk.length;
      if (size > pdfStorage.MAX_PDF_SIZE) throw createError(413, "PDF must not exceed 10 MB");
      chunks.push(chunk);
    }
    pdf = Buffer.concat(chunks, size);
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw createError(422, "The attached file does not have a valid PDF signature");
    }
    diagnostics.emit("pdf_read_complete", { durationMs: Math.round(performance.now() - readStarted), bytes: pdf.length });
  } catch (error) {
    diagnostics.emit("pdf_read_error", { ...safeErrorDetails(error), durationMs: Math.round(performance.now() - readStarted) });
    throw error;
  } finally {
    if (file) await file.handle.close();
  }

  const answer = await chatProvider.answerPdfQuestion(pdf, question, signal, diagnostics);
  diagnostics.emit("chat_complete");
  return { formationId: file.formationId, answer, sourceFileName: file.originalName };
}

module.exports = {
  createFormation, listFormations, getFormationById, updateFormation, deleteFormation,
  requireFormation, attachCoursePdf, getCoursePdf, chatWithFormation,
};
