const assert = require("node:assert/strict");
const { describe, mock, test } = require("node:test");
const { createDiagnostics, safeErrorDetails } = require("../src/modules/trainings/chat-diagnostics");
const { tinyPdf, runProbes } = require("../scripts/diagnose-gemini");

describe("sanitized chat diagnostics and sequential probes", () => {
  test("diagnostic output uses an allowlist and excludes arbitrary error/request/document data", () => {
    const logged = [];
    const info = mock.method(console, "info", (line) => logged.push(JSON.parse(line)));
    try {
      const trace = createDiagnostics({ enabled: true, probe: "A" });
      trace.emit("gemini_error", {
        errorType: "ApiError", status: 504, rpcStatus: "DEADLINE_EXCEEDED",
        cancellationSource: "none", transportCodes: ["ECONNRESET", "private-test-data"],
        message: "private-test-data", question: "private-test-data", pdf: "private-test-data",
        headers: { sensitive: "private-test-data" }, model: "private-test-data",
      });
      trace.emit("not-an-allowed-event", { message: "private-test-data" });
      assert.equal(logged.length, 1);
      assert.equal(logged[0].status, 504);
      assert.equal(logged[0].cancellationSource, "none");
      assert.deepEqual(logged[0].transportCodes, ["ECONNRESET"]);
      assert.equal(typeof logged[0].elapsedMs, "number");
      assert.equal(JSON.stringify(logged).includes("private-test-data"), false);
      createDiagnostics({ enabled: false }).emit("gemini_request_start");
      assert.equal(logged.length, 1);
    } finally { info.mock.restore(); }
  });

  test("extracts only known upstream status/type and nested transport codes", () => {
    const error = new Error(JSON.stringify({ error: { status: "DEADLINE_EXCEEDED", message: "private-test-data" } }));
    error.name = "ApiError";
    error.status = 504;
    error.cause = { errors: [{ code: "ECONNREFUSED" }, { code: "private-test-data" }] };
    assert.deepEqual(safeErrorDetails(error), {
      errorType: "ApiError", status: 504, transportCodes: ["ECONNREFUSED"], rpcStatus: "DEADLINE_EXCEEDED",
    });
    assert.deepEqual(safeErrorDetails({ name: "private-test-data", status: "private-test-data" }), {
      errorType: "OtherError", status: null, transportCodes: [],
    });
  });

  test("the tiny PDF has valid cross-reference offsets, a page tree, and known content", () => {
    const buffer = tinyPdf();
    const text = buffer.toString("ascii");
    assert.equal(text.startsWith("%PDF-1.4"), true);
    const offset = Number(/startxref\n(\d+)/.exec(text)[1]);
    assert.equal(text.slice(offset, offset + 4), "xref");
    const entries = [...text.matchAll(/^(\d{10}) 00000 n /gm)];
    assert.equal(entries.length, 5);
    entries.forEach((entry, index) => assert.ok(text.slice(Number(entry[1])).startsWith(`${index + 1} 0 obj`)));
    assert.match(text, /\/Type \/Pages \/Kids \[3 0 R\] \/Count 1/);
    assert.match(text, /Diagnostic code: WIND42/);
    assert.ok(buffer.length < 1024);
  });

  test("a failed text probe skips both PDF probes", async () => {
    const calls = [];
    const output = [];
    await runProbes({
      textProbe: async () => { calls.push("A"); throw Object.assign(new Error(), { statusCode: 504 }); },
      pdfProbe: async () => { calls.push("B"); return "WIND42"; },
      courseProbe: async () => { calls.push("C"); return { answer: "answer" }; },
      report: (line) => output.push(line),
    });
    assert.deepEqual(calls, ["A"]);
    assert.deepEqual(output.map((line) => line.outcome), ["error", "skipped", "skipped"]);
  });

  test("a failed tiny-PDF probe never reads the existing formation", async () => {
    const calls = [];
    const output = [];
    await runProbes({
      textProbe: async () => { calls.push("A"); return "OK"; },
      pdfProbe: async () => { calls.push("B"); return "wrong diagnostic code"; },
      courseProbe: async () => { calls.push("C"); return { answer: "answer" }; },
      report: (line) => output.push(line),
    });
    assert.deepEqual(calls, ["A", "B"]);
    assert.deepEqual(output.map((line) => line.outcome), ["success", "unexpected_answer", "skipped"]);
  });

  test("successful probes run once in order and report elapsed times", async () => {
    const calls = [];
    const output = [];
    await runProbes({
      textProbe: async () => { calls.push("A"); return "OK"; },
      pdfProbe: async (pdf) => { calls.push("B"); assert.deepEqual(pdf, tinyPdf()); return "WIND42"; },
      courseProbe: async () => { calls.push("C"); return { answer: "Document answer" }; },
      report: (line) => output.push(line),
    });
    assert.deepEqual(calls, ["A", "B", "C"]);
    assert.ok(output.every((line) => line.outcome === "success" && Number.isInteger(line.elapsedMs)));
    assert.equal(JSON.stringify(output).includes("Document answer"), false);
  });
});
