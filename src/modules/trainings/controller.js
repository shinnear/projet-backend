const trainingService = require("./service");
const Formation = require("./model");
const { pipeline } = require("node:stream");
const { createDiagnostics, CLIENT_DISCONNECT } = require("./chat-diagnostics");

function toFormationResponse(formation) {
  const result = typeof formation.toObject === "function"
    ? formation.toObject()
    : { ...formation };
  if (result.coursePdf) {
    const { originalName, mimeType, size, uploadedAt } = result.coursePdf;
    result.coursePdf = {
      originalName, mimeType, size, uploadedAt,
      downloadUrl: `/api/trainings/${result._id}/pdf`,
    };
  }
  return result;
}

async function createFormation(req, res, next) {
  try {
    const formation = await trainingService.createFormation(req.body || {});

    return res.status(201).json({
      success: true,
      message: "Formation created successfully",
      data: toFormationResponse(formation),
    });
  } catch (error) {
    next(error);
  }
}
async function listFormations(req, res, next) {
  try {
    const query = req.query;
    const allowedParams = ["page", "limit", "category", "level", "mode", "isFree"];

    for (const key of Object.keys(query)) {
      if (!allowedParams.includes(key)) {
        return res.status(400).json({
          success: false,
          message: `Unknown query parameter: ${key}`,
        });
      }

      if (typeof query[key] !== "string") {
        return res.status(400).json({
          success: false,
          message: `Query parameter must be a single string: ${key}`,
        });
      }
    }

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    if (
      (Object.hasOwn(query, "page") && !/^\d+$/.test(query.page)) ||
      (Object.hasOwn(query, "limit") && !/^\d+$/.test(query.limit)) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger((page - 1) * limit)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "page must be a positive integer; limit must be an integer between 1 and 100",
      });
    }

    const filters = {};

    for (const field of ["category", "level", "mode"]) {
      if (Object.hasOwn(query, field)) {
        const allowedValues = Formation.schema.path(field).enumValues;
        const value = query[field];

        if (!allowedValues.includes(value)) {
          return res.status(400).json({
            success: false,
            message: `${field} must be one of: ${allowedValues.join(", ")}`,
          });
        }

        filters[field] = value;
      }
    }

    if (Object.hasOwn(query, "isFree")) {
      const value = query.isFree;

      if (value !== "true" && value !== "false") {
        return res.status(400).json({
          success: false,
          message: 'isFree must be "true" or "false"',
        });
      }

      filters.isFree = value === "true";
    }

    const result = await trainingService.listFormations(page, limit, filters);

    return res.status(200).json({
      success: true,
      data: result.formations.map(toFormationResponse),
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}
async function getFormationById(req, res, next) {
  try {
    const { id } = req.params;

    // A MongoDB ObjectId contains 24 hexadecimal characters.
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid formation ID",
      });
    }

    const formation = await trainingService.getFormationById(id);

    if (!formation) {
      return res.status(404).json({
        success: false,
        message: "Formation not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: toFormationResponse(formation),
    });
  } catch (error) {
    next(error);
  }
}
async function updateFormation(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid formation ID",
      });
    }

    const formation = await trainingService.updateFormation(id, req.body);

    if (!formation) {
      return res.status(404).json({
        success: false,
        message: "Formation not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Formation updated successfully",
      data: toFormationResponse(formation),
    });
  } catch (error) {
    next(error);
  }
}
async function deleteFormation(req, res, next) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid formation ID",
      });
    }

    const formation = await trainingService.deleteFormation(id);

    if (!formation) {
      return res.status(404).json({
        success: false,
        message: "Formation not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Formation deleted successfully",
      data: {
        _id: formation._id,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function validatePdfFormation(req, res, next) {
  try {
    await trainingService.requireFormation(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
}

async function attachCoursePdf(req, res, next) {
  try {
    const { formation, replaced } = await trainingService.attachCoursePdf(req.params.id, req.file);
    return res.status(replaced ? 200 : 201).json({
      success: true,
      message: replaced ? "Course PDF replaced successfully" : "Course PDF attached successfully",
      data: toFormationResponse(formation),
    });
  } catch (error) {
    next(error);
  }
}

async function downloadCoursePdf(req, res, next) {
  let opened;
  try {
    // Open before sending headers; unlinking a replaced PDF cannot change this
    // request's file, and a missing file still produces the normal JSON 404.
    opened = await trainingService.getCoursePdf(req.params.id);
    const { handle, size, originalName } = opened;
    res.attachment(originalName);
    res.type("application/pdf");
    res.set("Content-Length", String(size));
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, no-store");
    pipeline(handle.createReadStream(), res, (error) => {
      if (error && !res.destroyed) res.destroy(error);
    });
    opened = null; // The stream now owns and closes the file handle.
  } catch (error) {
    if (opened) await opened.handle.close().catch(() => {});
    next(error);
  }
}

async function chatWithFormation(req, res, next) {
  const diagnostics = createDiagnostics();
  const controller = new AbortController();
  const cancel = () => { if (!res.writableEnded) controller.abort(CLIENT_DISCONNECT); };
  req.once("aborted", cancel);
  res.once("close", cancel);
  try {
    if (!req.is("application/json") || Object.keys(req.query).length > 0) {
      const error = new Error('Use application/json with only a "question" field and no query parameters');
      error.statusCode = 400;
      throw error;
    }
    const data = await trainingService.chatWithFormation(req.params.id, req.body, controller.signal, diagnostics);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (!res.destroyed) next(error);
  } finally {
    req.removeListener("aborted", cancel);
    res.removeListener("close", cancel);
  }
}

module.exports = {
  createFormation, listFormations, getFormationById, updateFormation, deleteFormation,
  validatePdfFormation, attachCoursePdf, downloadCoursePdf, chatWithFormation,
};
