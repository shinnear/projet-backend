const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, afterEach, before, beforeEach, describe, mock, test } = require("node:test");
const app = require("../src/app");
const Formation = require("../src/modules/trainings/model");
const trainingService = require("../src/modules/trainings/service");
const pdfStorage = require("../src/modules/trainings/pdf-storage");

const ID = "507f1f77bcf86cd799439011";
const UNKNOWN_ID = "507f1f77bcf86cd799439012";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

function fixture() {
  return new Formation({
    _id: ID,
    title: "Isolated PDF test formation",
    description: "Test data, never saved to the user's database",
    category: "recyclage",
    level: "débutant",
    duration: 2,
    provider: "Test provider",
    isFree: true,
    price: 0,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-02"),
    capacity: 10,
    mode: "en ligne",
    createdBy: "507f1f77bcf86cd799439013",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  }).toObject();
}

function copy(document) {
  if (!document) return null;
  return { ...document, ...(document.coursePdf ? { coursePdf: { ...document.coursePdf } } : {}) };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("formation PDF attachments", () => {
  let server;
  let baseUrl;
  let directory;
  let current;
  let storage;
  let updates;
  let beforeUpdate;
  let afterUpdate;
  let deleteError;
  let log;
  const patches = [];

  function patch(target, method, implementation) {
    const result = mock.method(target, method, implementation);
    patches.push(result);
    return result;
  }

  async function upload({ id = ID, buffer = PDF, name = "course.pdf", type = "application/pdf", field = "file", form } = {}) {
    const body = form || new FormData();
    if (!form) body.append(field, new Blob([buffer], { type }), name);
    return fetch(`${baseUrl}/api/trainings/${id}/pdf`, { method: "POST", body });
  }

  async function request(suffix = "", options = {}) {
    return fetch(`${baseUrl}/api/trainings/${ID}${suffix}`, options);
  }

  async function files() {
    return (await fs.readdir(directory)).sort();
  }

  async function assertError(response, status) {
    assert.equal(response.status, status);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(typeof body.message, "string");
    assert.ok(body.message.length > 0);
    assert.equal(JSON.stringify(body).includes(directory), false);
    return body;
  }

  async function attach() {
    const response = await upload();
    assert.equal(response.status, 201);
    await response.json();
    return current.coursePdf.storageKey;
  }

  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "training-pdf-test-"));
    storage = pdfStorage.createPdfStorage(directory);
    current = fixture();
    updates = 0;
    beforeUpdate = null;
    afterUpdate = null;
    deleteError = null;

    for (const method of ["save", "open", "remove"]) {
      patch(pdfStorage, method, storage[method]);
    }
    log = patch(console, "error", () => {});
    // Only database I/O is replaced. Real Mongoose casting/validation, Multer,
    // Express HTTP handling, and filesystem reads/writes remain in use.
    patch(Formation.collection, "findOne", async (filter) =>
      current && String(filter._id) === ID ? copy(current) : null
    );
    patch(Formation.collection, "findOneAndUpdate", async (filter, update, options) => {
      updates += 1;
      if (beforeUpdate) await beforeUpdate(update);
      if (!current || String(filter._id) !== ID) return null;
      assert.equal(options.returnDocument, "before");
      assert.notEqual(options.upsert, true);
      const previous = copy(current);
      const metadata = update.$set.coursePdf;
      current = { ...current, ...update.$set, coursePdf: metadata.toObject ? metadata.toObject() : metadata };
      if (afterUpdate) await afterUpdate();
      return previous;
    });
    patch(Formation.collection, "findOneAndDelete", async (filter) => {
      if (deleteError) throw deleteError;
      if (!current || String(filter._id) !== ID) return null;
      const previous = copy(current);
      current = null;
      return previous;
    });
    patch(Formation.collection, "find", () => ({
      toArray: async () => current ? [copy(current)] : [],
    }));
    patch(Formation.collection, "countDocuments", async () => current ? 1 : 0);
    patch(Formation.collection, "updateOne", async (filter, update) => {
      assert.ok(current && String(filter._id) === ID);
      current = { ...current, ...update.$set };
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
  });

  afterEach(async () => {
    for (const replacement of patches.splice(0).reverse()) replacement.mock.restore();
    // This directory was uniquely created by this test, never the real uploads.
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("training-pdf-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test("existing formations without PDFs remain valid", async () => {
    const document = new Formation(fixture());
    await document.validate();
    assert.equal(document.coursePdf, undefined);
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.coursePdf, undefined);
  });

  test("first attachment returns 201 and persists private, server-generated metadata", async () => {
    const response = await upload();
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body).sort(), ["data", "message", "success"]);
    assert.match(current.coursePdf.storageKey, pdfStorage.STORAGE_KEY_PATTERN);
    assert.deepEqual(await files(), [current.coursePdf.storageKey]);
    assert.deepEqual(await fs.readFile(path.join(directory, current.coursePdf.storageKey)), PDF);
    assert.deepEqual(body.data.coursePdf, {
      originalName: "course.pdf",
      mimeType: "application/pdf",
      size: PDF.length,
      uploadedAt: current.coursePdf.uploadedAt.toISOString(),
      downloadUrl: `/api/trainings/${ID}/pdf`,
    });
    assert.equal(body.data.updatedAt, current.updatedAt.toISOString());
    assert.equal(JSON.stringify(body).includes("storageKey"), false);
    assert.equal(JSON.stringify(body).includes(directory), false);
  });

  test("downloads the exact PDF with attachment headers", async () => {
    await attach();
    const response = await request("/pdf");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-disposition"), /^attachment;.*filename="?course\.pdf"?(?:;|$)/);
    assert.equal(Number(response.headers.get("content-length")), PDF.length);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PDF);
  });

  test("single, list, and update responses expose safe metadata and preserve the attachment", async () => {
    const key = await attach();
    for (const response of [
      await request(),
      await fetch(`${baseUrl}/api/trainings`),
      await request("", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated title" }),
      }),
    ]) {
      assert.equal(response.status, 200);
      const body = await response.json();
      const data = Array.isArray(body.data) ? body.data[0] : body.data;
      assert.equal(data.coursePdf.downloadUrl, `/api/trainings/${ID}/pdf`);
      assert.equal(data.coursePdf.storageKey, undefined);
      assert.equal(JSON.stringify(body).includes(directory), false);
    }
    assert.equal(current.coursePdf.storageKey, key);
    assert.deepEqual(await files(), [key]);
  });

  test("validates ID and existence before invoking upload storage", async () => {
    await assertError(await upload({ id: "invalid" }), 400);
    await assertError(await upload({ id: UNKNOWN_ID }), 404);
    assert.equal(pdfStorage.save.mock.callCount(), 0);
    assert.equal(updates, 0);
    assert.deepEqual(await files(), []);
    await assertError(await fetch(`${baseUrl}/api/trainings/invalid/pdf`), 400);
    await assertError(await fetch(`${baseUrl}/api/trainings/${UNKNOWN_ID}/pdf`), 404);
  });

  test("requires multipart/form-data and exactly one file", async () => {
    await assertError(await request("/pdf", { method: "POST" }), 400);
    await assertError(await request("/pdf", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }), 400);
    await assertError(await upload({ form: new FormData() }), 400);
    assert.equal(updates, 0);
    assert.deepEqual(await files(), []);
  });

  test("rejects wrong extensions, MIME types, empty files, and forged signatures", async () => {
    for (const options of [
      { name: "course.txt" },
      { name: "course.pdf.exe" },
      { type: "text/plain" },
      { type: "application/octet-stream" },
      { buffer: Buffer.alloc(0) },
      { buffer: Buffer.from("%PDF") },
      { buffer: Buffer.from("not a PDF") },
      { buffer: Buffer.from("prefix%PDF-1.7") },
    ]) {
      await assertError(await upload(options), 400);
    }
    assert.equal(updates, 0);
    assert.deepEqual(await files(), []);
    assert.equal(current.coursePdf, undefined);
  });

  test("rejects unexpected file/text fields and multiple files without saving anything", async () => {
    await assertError(await upload({ field: "pdf" }), 400);
    for (const extra of ["file", "other", "text"]) {
      const form = new FormData();
      form.append("file", new Blob([PDF], { type: "application/pdf" }), "course.pdf");
      if (extra === "text") form.append("title", "unexpected text field");
      else form.append(extra, new Blob([PDF], { type: "application/pdf" }), "extra.pdf");
      await assertError(await upload({ form }), 400);
    }
    const form = new FormData();
    form.append("file", "a text field is not a file");
    await assertError(await upload({ form }), 400);
    assert.equal(updates, 0);
    assert.deepEqual(await files(), []);
  });

  test("rejects malformed and truncated multipart bodies", async () => {
    for (const [type, body] of [
      ["multipart/form-data", "invalid"],
      ["multipart/form-data; boundary=test", '--test\r\nContent-Disposition: form-data; name="file"; filename="course.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7'],
    ]) {
      await assertError(await request("/pdf", {
        method: "POST", headers: { "Content-Type": type }, body,
      }), 400);
    }
    assert.equal(updates, 0);
    assert.deepEqual(await files(), []);
  });

  test("accepts exactly 10 MB and rejects larger files with 413", async () => {
    const buffer = Buffer.alloc(pdfStorage.MAX_PDF_SIZE, 0x20);
    PDF.copy(buffer);
    const response = await upload({ buffer });
    assert.equal(response.status, 201);
    await response.json();
    const key = current.coursePdf.storageKey;
    await assertError(await upload({ buffer: Buffer.concat([buffer, Buffer.from("x")]) }), 413);
    assert.equal(current.coursePdf.storageKey, key);
    assert.deepEqual(await files(), [key]);
    assert.equal(updates, 1);
  });

  test("sanitizes client filenames and preserves UTF-8 names without controlling paths", async () => {
    const response = await upload({ name: "../../cours-énergie.PDF" });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.coursePdf.originalName, "cours-énergie.PDF");
    assert.deepEqual(await files(), [current.coursePdf.storageKey]);
    const download = await request("/pdf");
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /attachment/);
    await download.arrayBuffer();
  });

  test("replacement retains the old PDF until the new file and database update succeed", async () => {
    const oldKey = await attach();
    const newPdf = Buffer.from("%PDF-1.7\nreplacement\n%%EOF");
    beforeUpdate = async (update) => {
      assert.equal(current.coursePdf.storageKey, oldKey);
      assert.deepEqual(await fs.readFile(path.join(directory, oldKey)), PDF);
      const metadata = update.$set.coursePdf;
      assert.deepEqual(await fs.readFile(path.join(directory, metadata.storageKey)), newPdf);
      assert.equal((await files()).length, 2);
    };
    const response = await upload({ buffer: newPdf, name: "replacement.pdf" });
    assert.equal(response.status, 200);
    await response.json();
    assert.notEqual(current.coursePdf.storageKey, oldKey);
    assert.deepEqual(await files(), [current.coursePdf.storageKey]);
    const download = await request("/pdf");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), newPdf);
  });

  test("invalid replacement leaves the existing attachment unchanged", async () => {
    const key = await attach();
    await assertError(await upload({ buffer: Buffer.from("forged PDF") }), 400);
    assert.equal(current.coursePdf.storageKey, key);
    assert.deepEqual(await files(), [key]);
  });

  test("database failure removes the new file and retains the old attachment", async () => {
    const key = await attach();
    beforeUpdate = () => { throw new Error("Simulated database failure"); };
    await assertError(await upload(), 500);
    assert.equal(current.coursePdf.storageKey, key);
    assert.deepEqual(await files(), [key]);
    assert.equal(log.mock.callCount(), 1);
  });

  test("database validation failure cleans up the new file", async () => {
    patch(pdfStorage, "save", async (file) => ({ ...await storage.save(file), mimeType: "text/plain" }));
    const body = await assertError(await upload(), 400);
    assert.equal(body.message, "Validation failed");
    assert.equal(updates, 0);
    assert.equal(current.coursePdf, undefined);
    assert.deepEqual(await files(), []);
  });

  test("a partial filesystem write is removed without changing the database", async () => {
    const open = fs.open;
    patch(fs, "open", async (...args) => {
      const handle = await open(...args);
      if (args[1] === "wx") {
        const writeFile = handle.writeFile.bind(handle);
        patch(handle, "writeFile", async (buffer) => {
          await writeFile(buffer.subarray(0, 7));
          throw new Error("Simulated disk write failure");
        });
      }
      return handle;
    });
    await assertError(await upload(), 500);
    assert.equal(updates, 0);
    assert.deepEqual(await files(), []);
  });

  test("does not remove the current file when the database loses a successful update acknowledgement", async () => {
    afterUpdate = () => { throw new Error("Simulated lost acknowledgement"); };
    await assertError(await upload(), 500);
    assert.ok(current.coursePdf);
    assert.deepEqual(await files(), [current.coursePdf.storageKey]);
    const download = await request("/pdf");
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), PDF);
  });

  test("missing metadata or a missing physical file returns JSON 404", async () => {
    await assertError(await request("/pdf"), 404);
    const key = await attach();
    await fs.unlink(path.join(directory, key));
    await assertError(await request("/pdf"), 404);
    const response = await upload();
    assert.equal(response.status, 200);
    await response.json();
    assert.deepEqual(await files(), [current.coursePdf.storageKey]);
  });

  test("deleting a formation removes its attachment and tolerates already missing files", async () => {
    await attach();
    const response = await request("", { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { _id: ID });
    assert.equal(current, null);
    assert.deepEqual(await files(), []);
    current = fixture();
    const key = await attach();
    await fs.unlink(path.join(directory, key));
    const missing = await request("", { method: "DELETE" });
    assert.equal(missing.status, 200);
    await missing.json();
    assert.deepEqual(await files(), []);
  });

  test("a failed formation deletion keeps the referenced file", async () => {
    const key = await attach();
    deleteError = new Error("Simulated deletion failure");
    await assertError(await request("", { method: "DELETE" }), 500);
    assert.equal(current.coursePdf.storageKey, key);
    assert.deepEqual(await files(), [key]);
  });

  test("simultaneous first uploads produce one 201, one 200, and only the final file", async () => {
    const responses = await Promise.all([upload(), upload({ name: "other.pdf" })]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
    await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(await files(), [current.coursePdf.storageKey]);
  });

  test("simultaneous replacements do not delete the final attachment", async () => {
    await attach();
    const responses = await Promise.all([upload(), upload(), upload()]);
    assert.ok(responses.every((response) => response.status === 200));
    await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(await files(), [current.coursePdf.storageKey]);
    assert.deepEqual(await fs.readFile(path.join(directory, current.coursePdf.storageKey)), PDF);
  });

  test("deletion while an upload waits to update removes both old and uncommitted files", async () => {
    await attach();
    const entered = deferred();
    const release = deferred();
    beforeUpdate = async () => { entered.resolve(); await release.promise; };
    const pending = upload();
    await entered.promise;
    try {
      const response = await request("", { method: "DELETE" });
      assert.equal(response.status, 200);
      await response.json();
    } finally {
      release.resolve();
    }
    await assertError(await pending, 404);
    assert.equal(current, null);
    assert.deepEqual(await files(), []);
  });

  test("deletion after an upload commits cleans up the current file safely", async () => {
    await attach();
    const entered = deferred();
    const release = deferred();
    afterUpdate = async () => { entered.resolve(); await release.promise; };
    const pending = upload();
    await entered.promise;
    try {
      const response = await request("", { method: "DELETE" });
      assert.equal(response.status, 200);
      await response.json();
    } finally {
      release.resolve();
    }
    const response = await pending;
    assert.equal(response.status, 200);
    await response.json();
    assert.equal(current, null);
    assert.deepEqual(await files(), []);
  });

  test("an opened download remains readable during replacement and deletion", async () => {
    await attach();
    for (const action of [
      () => upload({ buffer: Buffer.from("%PDF-1.7\nnew PDF") }),
      () => request("", { method: "DELETE" }),
    ]) {
      const opened = await trainingService.getCoursePdf(ID);
      const expected = await opened.handle.readFile();
      try {
        const response = await action();
        assert.equal(response.status, 200);
        await response.json();
        const buffer = Buffer.alloc(expected.length);
        await opened.handle.read(buffer, 0, buffer.length, 0);
        assert.deepEqual(buffer, expected);
      } finally {
        await opened.handle.close();
      }
    }
    assert.deepEqual(await files(), []);
  });

  test("CRUD rejects client-supplied PDF metadata", async () => {
    for (const coursePdf of [{ storageKey: "../../outside.pdf" }, null]) {
      for (const [url, method] of [[`${baseUrl}/api/trainings`, "POST"], [`${baseUrl}/api/trainings/${ID}`, "PUT"]]) {
        await assertError(await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coursePdf }),
        }), 400);
      }
    }
    assert.equal(current.coursePdf, undefined);
    assert.deepEqual(await files(), []);
  });

  test("stored keys cannot escape storage, and uploads have no public static route", async () => {
    const key = await attach();
    await assertError(await fetch(`${baseUrl}/uploads/formations/${key}`), 404);
    for (const invalid of ["../../outside.pdf", "C:\\outside.pdf", "/outside.pdf", `${key}/../other.pdf`]) {
      current.coursePdf.storageKey = invalid;
      await assertError(await request("/pdf"), 404);
      await storage.remove(invalid);
    }
    assert.deepEqual(await files(), [key]);
  });
});
