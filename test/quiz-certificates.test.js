const assert = require("node:assert/strict");
const { once } = require("node:events");
const { inflateSync } = require("node:zlib");
const { after, afterEach, before, beforeEach, describe, mock, test } = require("node:test");
const PDFDocument = require("pdfkit");
const app = require("../src/app");
const QuizAttempt = require("../src/modules/quizzes/attempt-model");
const Quiz = require("../src/modules/quizzes/model");
const Formation = require("../src/modules/trainings/model");
const learnerResolver = require("../src/modules/quizzes/learner");
const certificatePdf = require("../src/modules/quizzes/certificate-pdf");
const realGenerateCertificate = certificatePdf.generateCertificate;

const ID = "507f1f77bcf86cd79943901a";
const UNKNOWN_ID = "507f1f77bcf86cd79943901b";
const ENVIRONMENT = ["NODE_ENV", "CERTIFICATE_DEMO_MODE", "CERTIFICATE_PASSING_PERCENTAGE"];

function fixture(fields = {}) {
  return new QuizAttempt({
    _id: ID, quizId: "507f1f77bcf86cd799439011", formationId: "507f1f77bcf86cd799439012",
    learnerIdentifier: "demo-learner", learnerDisplayName: "Élodie François-Lefèvre",
    quizTitle: "Quiz : énergie et économie circulaire",
    formationTitle: "Réussir la transition écologique à l’échelle locale",
    score: 4, totalQuestions: 5, percentage: 80, passingPercentage: 80, passed: true,
    submittedAt: new Date("2026-02-27T23:45:00.000Z"),
    ...fields,
  }).toObject();
}

// Read the standard-font text operators emitted by PDFKit, including compressed
// streams and kerning fragments. No PDF parser is added to production dependencies.
function inspectPdf(buffer) {
  const source = buffer.toString("latin1");
  const lines = [];
  for (const stream of source.matchAll(/<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gs)) {
    let bytes = Buffer.from(stream[2], "latin1");
    if (stream[1].includes("/FlateDecode")) bytes = inflateSync(bytes);
    for (const block of bytes.toString("latin1").matchAll(/BT\b([\s\S]*?)\bET/g)) {
      const fragments = [...block[1].matchAll(/<([a-fA-F0-9]+)>/g)];
      lines.push(fragments.map((part) => new TextDecoder("windows-1252").decode(Buffer.from(part[1], "hex"))).join(""));
    }
  }
  return {
    source,
    text: lines.join(" ").replace(/\s+/gu, " "),
    pages: [...source.matchAll(/\/Type\s*\/Page\b/g)].length,
  };
}

describe("quiz certificate downloads", () => {
  let server;
  let baseUrl;
  let attempt;
  let environment;
  let read;
  let generate;
  const patches = [];

  function patch(target, name, implementation) {
    const replacement = mock.method(target, name, implementation);
    patches.push(replacement);
    return replacement;
  }

  async function download(id = ID, suffix = "", options = {}) {
    return fetch(`${baseUrl}/api/quizzes/attempts/${id}/certificate${suffix}`, options);
  }

  async function assertError(response, status, message) {
    assert.equal(response.status, status);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    assert.equal(response.headers.get("content-disposition"), null);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["message", "success"]);
    assert.equal(body.success, false);
    assert.ok(body.message);
    if (message) assert.equal(body.message, message);
    assert.equal(JSON.stringify(body).includes("private-test-details"), false);
    return body;
  }

  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => {
    environment = Object.fromEntries(ENVIRONMENT.map((name) => [name, process.env[name]]));
    process.env.NODE_ENV = "development";
    process.env.CERTIFICATE_DEMO_MODE = "true";
    process.env.CERTIFICATE_PASSING_PERCENTAGE = "80";
    attempt = fixture();
    read = patch(QuizAttempt.collection, "findOne", async (filter) => (
      attempt && String(filter._id) === String(attempt._id) && filter.learnerIdentifier === attempt.learnerIdentifier ? attempt : null
    ));
    generate = patch(certificatePdf, "generateCertificate", certificatePdf.generateCertificate);
    for (const model of [QuizAttempt, Quiz, Formation]) {
      for (const method of ["insertOne", "insertMany", "updateOne", "updateMany", "findOneAndUpdate", "deleteOne", "deleteMany", "findOneAndDelete", "bulkWrite"]) {
        patch(model.collection, method, () => { throw new Error("Certificates must never write records"); });
      }
    }
    for (const model of [Quiz, Formation]) {
      patch(model.collection, "findOne", () => { throw new Error("Certificates must use attempt snapshots only"); });
    }
  });

  afterEach(() => {
    for (const replacement of patches.splice(0).reverse()) replacement.mock.restore();
    for (const name of ENVIRONMENT) {
      if (environment[name] === undefined) delete process.env[name];
      else process.env[name] = environment[name];
    }
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test("returns a complete one-page landscape A4 PDF with safe download headers and French snapshots", async () => {
    const before = JSON.stringify(attempt);
    const response = await download();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("content-disposition"), `attachment; filename="certificat-GJ-${ID}.pdf"`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(Number(response.headers.get("content-length")), bytes.length);
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.match(bytes.toString("latin1"), /%%EOF\s*$/);
    const pdf = inspectPdf(bytes);
    assert.equal(pdf.pages, 1);
    assert.match(pdf.source, /\/MediaBox\s*\[0 0 841\.89 595\.28\]/);
    for (const content of [
      "GreenJob", "Certificat de réussite au quiz", attempt.learnerDisplayName,
      attempt.formationTitle, attempt.quizTitle, "4 / 5", "80 %", "Date de réussite",
      "28 février 2026", `GJ-${ID}`, "Mode démonstration",
    ]) assert.ok(pdf.text.includes(content), content);
    assert.equal(read.mock.callCount(), 1);
    assert.deepEqual(read.mock.calls[0].arguments[0], {
      _id: attempt._id, learnerIdentifier: "demo-learner",
    });
    assert.equal(JSON.stringify(attempt), before);
  });

  test("repeated downloads keep the full certificate number and achievement date", async () => {
    const first = await download(ID.toUpperCase());
    assert.equal(first.status, 200);
    const firstPdf = inspectPdf(Buffer.from(await first.arrayBuffer()));
    process.env.CERTIFICATE_PASSING_PERCENTAGE = "100";
    const second = await download();
    assert.equal(second.status, 200);
    const secondPdf = inspectPdf(Buffer.from(await second.arrayBuffer()));
    assert.equal(firstPdf.text, secondPdf.text);
    assert.equal(first.headers.get("content-disposition"), second.headers.get("content-disposition"));
    assert.ok(secondPdf.text.includes(`GJ-${ID}`));
    assert.ok(secondPdf.text.includes("28 février 2026"));
  });

  test("uses the saved threshold even when today's threshold is absent or invalid", async () => {
    for (const current of ["100", "", "not-a-number", undefined]) {
      if (current === undefined) delete process.env.CERTIFICATE_PASSING_PERCENTAGE;
      else process.env.CERTIFICATE_PASSING_PERCENTAGE = current;
      const response = await download();
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
  });

  test("a saved failed attempt returns a clear 403 JSON error", async () => {
    attempt = fixture({ score: 3, percentage: 60, passed: false });
    const body = await assertError(await download(), 403);
    assert.match(body.message, /saved passing requirements/);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("requires passed=true as well as a passing ratio", async () => {
    attempt = fixture({ passed: false });
    await assertError(await download(), 403);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("rechecks the saved unrounded score ratio even if passed=true or today's threshold is lower", async () => {
    process.env.CERTIFICATE_PASSING_PERCENTAGE = "0";
    attempt = fixture({ score: 2, totalQuestions: 3, percentage: 66.67, passingPercentage: 66.67, passed: true });
    await assertError(await download(), 403);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("rejects invalid saved score and threshold values before PDF generation", async () => {
    for (const fields of [
      { score: -1 }, { score: 1.5 }, { score: 6 }, { score: NaN }, { score: "4" },
      { totalQuestions: 0 }, { totalQuestions: 2.5 }, { totalQuestions: Infinity },
      { passingPercentage: -1 }, { passingPercentage: 101 }, { passingPercentage: NaN }, { passingPercentage: undefined },
    ]) {
      attempt = { ...fixture(), ...fields };
      await assertError(await download(), 403);
    }
    assert.equal(generate.mock.callCount(), 0);
  });

  test("accepts exact score ratio boundaries", async () => {
    for (const fields of [
      { score: 0, totalQuestions: 5, percentage: 0, passingPercentage: 0 },
      { score: 29, totalQuestions: 50, percentage: 58, passingPercentage: 58 },
      { score: 5, totalQuestions: 5, percentage: 100, passingPercentage: 100 },
    ]) {
      attempt = fixture(fields);
      const response = await download();
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
  });

  test("malformed IDs return 400 without resolving identity or querying MongoDB", async () => {
    const resolver = patch(learnerResolver, "resolveLearner", () => { throw new Error("Must validate ID first"); });
    for (const id of ["invalid", "123", "z".repeat(24), "0".repeat(23), "0".repeat(25)]) {
      await assertError(await download(id), 400, "Invalid attempt ID");
    }
    assert.equal(resolver.mock.callCount(), 0);
    assert.equal(read.mock.callCount(), 0);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("missing attempts and another learner's attempt both return the same 404", async () => {
    const missing = await assertError(await download(UNKNOWN_ID), 404);
    attempt.learnerIdentifier = "another-learner";
    const other = await assertError(await download(), 404);
    assert.deepEqual(missing, other);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("a URL without the attempt ID returns the existing JSON route error", async () => {
    const response = await fetch(`${baseUrl}/api/quizzes/attempts/certificate`);
    await assertError(response, 404, "Route not found");
    assert.equal(read.mock.callCount(), 0);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("disabled or unset demo mode returns 503 without reading attempts", async () => {
    for (const mode of ["false", undefined]) {
      if (mode === undefined) delete process.env.CERTIFICATE_DEMO_MODE;
      else process.env.CERTIFICATE_DEMO_MODE = mode;
      await assertError(await download(), 503, "Certificate learner identity is unavailable");
    }
    assert.equal(read.mock.callCount(), 0);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("demo mode outside development and invalid flags return 503", async () => {
    for (const nodeEnv of ["production", "test", undefined]) {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      await assertError(await download(), 503);
    }
    process.env.NODE_ENV = "development";
    process.env.CERTIFICATE_DEMO_MODE = "TRUE";
    await assertError(await download(), 503);
    assert.equal(read.mock.callCount(), 0);
  });

  test("unavailable identity resolution returns 503", async () => {
    const resolver = patch(learnerResolver, "resolveLearner", () => null);
    await assertError(await download(), 503);
    resolver.mock.mockImplementation(() => { throw new Error("private-test-details"); });
    await assertError(await download(), 503);
    assert.equal(read.mock.callCount(), 0);
    assert.equal(generate.mock.callCount(), 0);
  });

  test("client query parameters and headers cannot override identity, snapshots, or eligibility", async () => {
    const query = "?learnerIdentifier=another-learner&learnerDisplayName=FORGED&score=0&passed=false&formationTitle=FORGED";
    const response = await download(ID, query, { headers: { "X-Learner-Id": "another-learner" } });
    assert.equal(response.status, 200);
    const pdf = inspectPdf(Buffer.from(await response.arrayBuffer()));
    assert.ok(pdf.text.includes(attempt.learnerDisplayName));
    assert.ok(pdf.text.includes("4 / 5"));
    assert.equal(pdf.text.includes("FORGED"), false);
    attempt.passed = false;
    await assertError(await download(ID, "?score=5&percentage=100&passed=true&passingPercentage=0"), 403);
  });

  test("a MongoDB read failure returns a sanitized JSON error", async () => {
    read.mock.mockImplementation(async () => { throw new Error("private-test-details"); });
    await assertError(await download(), 503, "Unable to load quiz attempt. Please try again.");
    assert.equal(generate.mock.callCount(), 0);
  });

  test("a synchronous PDFKit failure returns JSON without download headers", async () => {
    patch(PDFDocument.prototype, "text", () => { throw new Error("private-test-details"); });
    await assertError(await download(), 503, "Unable to generate certificate PDF. Please try again.");
  });

  test("a PDF stream error after partial generation still returns JSON", async () => {
    patch(PDFDocument.prototype, "end", function () {
      process.nextTick(() => this.destroy(new Error("private-test-details")));
      return this;
    });
    await assertError(await download(), 503, "Unable to generate certificate PDF. Please try again.");
  });

  test("waits for successful generation before responding", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let entered;
    const generating = new Promise((resolve) => { entered = resolve; });
    generate.mock.mockImplementation(async (record) => {
      entered();
      await gate;
      return realGenerateCertificate(record);
    });
    let completed = false;
    const pending = download().then((response) => { completed = true; return response; });
    await generating;
    try { assert.equal(completed, false); }
    finally { release(); }
    const response = await pending;
    assert.equal(response.status, 200);
    assert.match(Buffer.from(await response.arrayBuffer()).toString("latin1"), /%%EOF\s*$/);
  });

  test("French accents, ligatures, and long snapshot text wrap on one page without truncation", async () => {
    attempt = fixture({
      learnerDisplayName: "Élodie Anaïs François-Lefèvre de la Vallée et du Cœur Saint-Étienne ".repeat(3).trim(),
      formationTitle: "Économie circulaire, réemploi et métiers de la transition écologique pour les collectivités françaises ".repeat(4).trim(),
      quizTitle: "Évaluation des compétences : énergie, bâtiments, déchets et gestion de l’eau ".repeat(3).trim(),
    });
    const response = await download();
    assert.equal(response.status, 200);
    const pdf = inspectPdf(Buffer.from(await response.arrayBuffer()));
    assert.equal(pdf.pages, 1);
    for (const key of ["learnerDisplayName", "formationTitle", "quizTitle"]) {
      // PDF line wrapping may break a hyphenated name without a space.
      assert.ok(pdf.text.replace(/\s/gu, "").includes(attempt[key].replace(/\s/gu, "")), key);
    }
    assert.ok(pdf.text.includes("Date de réussite"));
    assert.ok(pdf.text.includes(`GJ-${ID}`));
  });

  test("missing or unreadably oversized snapshots return JSON instead of an incomplete certificate", async () => {
    for (const fields of [{ learnerDisplayName: "" }, { formationTitle: "" }, { quizTitle: "titre ".repeat(1000) }, { submittedAt: new Date(NaN) }, { percentage: NaN }]) {
      attempt = { ...fixture(), ...fields };
      await assertError(await download(), 503);
    }
  });
});
