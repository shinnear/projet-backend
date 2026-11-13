const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;
const directory = path.resolve(__dirname, "../../../uploads/formations");

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createPdfStorage(root = directory) {
  const storageDirectory = path.resolve(root);

  function resolveKey(key) {
    if (typeof key !== "string" || !STORAGE_KEY_PATTERN.test(key)) {
      throw createError(404, "Course PDF not found");
    }
    return path.join(storageDirectory, key);
  }

  async function remove(key) {
    // Never interpret legacy or corrupt metadata as a filesystem path.
    if (typeof key !== "string" || !STORAGE_KEY_PATTERN.test(key)) return;
    try {
      await fs.unlink(resolveKey(key));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async function save(file) {
    if (!file) throw createError(400, 'Provide exactly one PDF in the "file" field');

    const originalName = path.posix.basename(path.win32.basename(file.originalname))
      .replace(/[\x00-\x1f\x7f]/g, "");
    if (
      path.extname(originalName).toLowerCase() !== ".pdf" ||
      originalName.length > 255 ||
      file.mimetype !== "application/pdf" ||
      !Buffer.isBuffer(file.buffer) ||
      !file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
    ) {
      throw createError(400, "File must have a .pdf extension, application/pdf MIME type, and PDF signature");
    }
    if (file.buffer.length > MAX_PDF_SIZE) {
      throw createError(413, "PDF must not exceed 10 MB");
    }

    await fs.mkdir(storageDirectory, { recursive: true });
    const storageKey = `${randomUUID()}.pdf`;
    const filename = resolveKey(storageKey);
    // Exclusive creation prevents overwriting any existing attachment.
    const handle = await fs.open(filename, "wx", 0o600);
    try {
      await handle.writeFile(file.buffer);
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => {});
      await remove(storageKey);
      throw error;
    }

    return {
      storageKey,
      originalName,
      mimeType: "application/pdf",
      size: file.buffer.length,
      uploadedAt: new Date(),
    };
  }

  async function open(key) {
    try {
      const handle = await fs.open(resolveKey(key), "r");
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw createError(404, "Course PDF not found");
        return { handle, size: stat.size };
      } catch (error) {
        await handle.close();
        throw error;
      }
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code)) {
        throw createError(404, "Course PDF not found");
      }
      throw error;
    }
  }

  return { save, open, remove };
}

module.exports = { ...createPdfStorage(), createPdfStorage, MAX_PDF_SIZE, STORAGE_KEY_PATTERN };
