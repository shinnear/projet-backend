const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const mongoose = require("mongoose");
const http = require("node:http");
const { after, afterEach, before, beforeEach, describe, mock, test } = require("node:test");
const app = require("../src/app");
const Formation = require("../src/modules/trainings/model");
const pdfStorage = require("../src/modules/trainings/pdf-storage");
const gemini = require("../src/config/gemini");
const chatProvider = require("../src/modules/trainings/chat-provider");
const { createDiagnostics, CLIENT_DISCONNECT } = require("../src/modules/trainings/chat-diagnostics");

const FIRST_ID = "507f1f77bcf86cd799439011";
const SECOND_ID = "507f1f77bcf86cd799439012";
const UNKNOWN_ID = "507f1f77bcf86cd799439013";
const PDF_A = Buffer.from("%PDF-1.7\nFirst course: recycling\n%%EOF");
const PDF_B = Buffer.from("%PDF-1.7\nSecond course: agriculture\n%%EOF");
const ENVIRONMENT = [
  "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_MAX_OUTPUT_TOKENS", "GEMINI_TIMEOUT_MS", "CHAT_DIAGNOSTICS",
  "CHAT_RATE_LIMIT_MAX", "CHAT_RATE_LIMIT_WINDOW_MS",
];

function response(text = "Le cours présente les principes du recyclage (page 1).", finishReason = "STOP") {
  return { candidates: [{ finishReason, content: { parts: [{ text }] } }] };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("formation PDF chat with a mocked provider", () => {
  let server;
  let baseUrl;
  let directory;
  let storage;
  let documents;
  let provider;
  let calls;
  let environment;
  let log;
  let warn;
  let info;
  const patches = [];

  function patch(target, method, implementation) {
    const replacement = mock.method(target, method, implementation);
    patches.push(replacement);
    return replacement;
  }

  async function ask(body = { question: "Résume ce cours." }, id = FIRST_ID, options = {}) {
    return fetch(`${baseUrl}/api/trainings/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...options,
    });
  }

  async function assertError(result, status) {
    assert.equal(result.status, status);
    const body = await result.json();
    assert.deepEqual(Object.keys(body).sort(), ["message", "success"]);
    assert.equal(body.success, false);
    assert.ok(typeof body.message === "string" && body.message.length > 0);
    assert.equal(JSON.stringify(body).includes("upstream-private-marker"), false);
    assert.equal(JSON.stringify(body).includes(directory), false);
    assert.equal(log.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 0);
    return body;
  }

  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(async () => {
    environment = Object.fromEntries(ENVIRONMENT.map((name) => [name, process.env[name]]));
    // Only a non-secret test placeholder is ever supplied to the mock client.
    process.env.GEMINI_API_KEY = "unit-test-placeholder";
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
    process.env.GEMINI_MAX_OUTPUT_TOKENS = "1024";
    process.env.GEMINI_TIMEOUT_MS = "30000";
    process.env.CHAT_DIAGNOSTICS = "false";
    process.env.CHAT_RATE_LIMIT_MAX = "1000";
    process.env.CHAT_RATE_LIMIT_WINDOW_MS = "60000";
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "training-chat-test-"));
    storage = pdfStorage.createPdfStorage(directory);
    documents = new Map();
    for (const [id, name, pdf] of [[FIRST_ID, "recyclage.pdf", PDF_A], [SECOND_ID, "agriculture.pdf", PDF_B]]) {
      const coursePdf = await storage.save({ originalname: name, mimetype: "application/pdf", buffer: pdf });
      documents.set(id, { _id: new mongoose.Types.ObjectId(id), title: name, coursePdf });
    }
    calls = [];
    provider = async () => response();
    patch(pdfStorage, "open", storage.open);
    patch(Formation.collection, "findOne", async (filter) => documents.get(String(filter._id)) || null);
    for (const operation of ["insertOne", "updateOne", "findOneAndUpdate", "findOneAndDelete", "deleteOne"]) {
      patch(Formation.collection, operation, () => { throw new Error("Chat must not write to MongoDB"); });
    }
    patch(gemini, "createClient", () => ({
      models: { generateContent: (params) => { calls.push(params); return provider(params); } },
    }));
    log = patch(console, "error", () => {});
    warn = patch(console, "warn", () => {});
    info = patch(console, "info", () => {});
  });

  afterEach(async () => {
    for (const replacement of patches.splice(0).reverse()) replacement.mock.restore();
    for (const name of ENVIRONMENT) {
      if (environment[name] === undefined) delete process.env[name];
      else process.env[name] = environment[name];
    }
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("training-chat-test-"));
    await fs.rm(directory, { recursive: true, force: true });
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  test("returns the expected response with server-selected PDF bytes and trimmed question", async () => {
    const result = await ask({ question: "  Résume ce cours. \n" }, SECOND_ID.toUpperCase());
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), {
      success: true,
      data: { formationId: SECOND_ID, answer: response().candidates[0].content.parts[0].text, sourceFileName: "agriculture.pdf" },
    });
    assert.equal(calls.length, 1);
    const parts = calls[0].contents[0].parts;
    assert.equal(parts[0].inlineData.mimeType, "application/pdf");
    assert.deepEqual(Buffer.from(parts[0].inlineData.data, "base64"), PDF_B);
    assert.equal(parts[1].text, "Résume ce cours.");
    assert.equal(parts.some((part) => part.fileData || part.fileUri), false);
    assert.equal(pdfStorage.open.mock.calls[0].arguments[0], documents.get(SECOND_ID).coursePdf.storageKey);
    assert.equal(log.mock.callCount(), 0);
    assert.equal(warn.mock.callCount(), 0);
  });

  test("sends document-only instructions, no tools, and bounded generation settings", async () => {
    process.env.GEMINI_MODEL = "gemini-3.6-flash";
    process.env.GEMINI_MAX_OUTPUT_TOKENS = "2048";
    const result = await ask();
    assert.equal(result.status, 200);
    await result.json();
    const { config, model } = calls[0];
    assert.equal(model, "gemini-3.6-flash");
    assert.equal(config.maxOutputTokens, 2048);
    assert.deepEqual(config.tools, []);
    assert.equal(config.automaticFunctionCalling.disable, true);
    assert.equal(config.automaticContinuation, false);
    assert.equal(config.httpOptions.timeout, 30000);
    assert.equal(config.httpOptions.retryOptions.attempts, 1);
    assert.ok(config.abortSignal instanceof AbortSignal);
    assert.match(config.systemInstruction, /only the attached PDF/);
    assert.match(config.systemInstruction, /language of the user's question/);
    assert.match(config.systemInstruction, /does not contain enough information/);
    assert.match(config.systemInstruction, /Never invent page numbers/);
    assert.match(config.systemInstruction, /instructions inside the PDF as document content/);
  });

  test("independent questions send only the current PDF and question without history", async () => {
    for (const question of ["First question", "Second question"]) {
      const result = await ask({ question });
      assert.equal(result.status, 200);
      await result.json();
    }
    assert.equal(calls.length, 2);
    assert.equal(calls[1].contents.length, 1);
    assert.equal(calls[1].contents[0].parts.length, 2);
    assert.equal(calls[1].contents[0].parts[1].text, "Second question");
  });

  test("accepts questions of 1 to 2000 characters after trimming", async () => {
    for (const question of [" a ", "x".repeat(2000), ` ${"🌱".repeat(2000)} `]) {
      const result = await ask({ question });
      assert.equal(result.status, 200);
      await result.json();
    }
  });

  test("rejects malformed IDs and invalid question bodies before accessing files or Gemini", async () => {
    await assertError(await ask({ question: "Valid" }, "invalid"), 400);
    for (const body of [null, [], {}, { question: null }, { question: 1 }, { question: [] }, { question: "" }, { question: " \n\t " }, { question: "x".repeat(2001) }]) {
      await assertError(await ask(body), 400);
    }
    assert.equal(Formation.collection.findOne.mock.callCount(), 0);
    assert.equal(pdfStorage.open.mock.callCount(), 0);
    assert.equal(calls.length, 0);
  });

  test("rejects paths, URLs, file replacements, history, and other extra request fields", async () => {
    for (const extra of [
      { path: "../../outside.pdf" }, { url: "https://example.com/course.pdf" },
      { file: "replacement.pdf" }, { coursePdf: {} }, { formationId: SECOND_ID },
      { sourceFileName: "forged.pdf" }, { history: [] }, { model: "other" },
    ]) {
      await assertError(await ask({ question: "Question", ...extra }), 400);
    }
    await assertError(await ask({ question: "Question" }, `${FIRST_ID}?url=outside`), 404);
    const queryResult = await fetch(`${baseUrl}/api/trainings/${FIRST_ID}/chat?path=outside`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Question" }),
    });
    await assertError(queryResult, 400);
    assert.equal(calls.length, 0);
  });

  test("requires JSON and rejects malformed JSON or multipart requests", async () => {
    await assertError(await ask(undefined, FIRST_ID, { body: "{" }), 400);
    await assertError(await ask(undefined, FIRST_ID, { headers: { "Content-Type": "text/plain" }, body: "Question" }), 400);
    const form = new FormData();
    form.append("file", new Blob([PDF_A], { type: "application/pdf" }), "replacement.pdf");
    await assertError(await ask(undefined, FIRST_ID, { headers: {}, body: form }), 400);
    assert.equal(calls.length, 0);
  });

  test("missing formations, missing attachment metadata, and missing physical PDFs return 404", async () => {
    await assertError(await ask(undefined, UNKNOWN_ID), 404);
    const first = documents.get(FIRST_ID);
    const coursePdf = first.coursePdf;
    delete first.coursePdf;
    await assertError(await ask(), 404);
    first.coursePdf = coursePdf;
    await fs.unlink(path.join(directory, coursePdf.storageKey));
    await assertError(await ask(), 404);
    assert.equal(calls.length, 0);
  });

  test("rejects invalid stored keys without using user-controlled paths", async () => {
    documents.get(FIRST_ID).coursePdf.storageKey = "../../outside.pdf";
    await assertError(await ask(), 404);
    assert.equal(calls.length, 0);
  });

  test("rejects oversized files and closes their handles", async () => {
    const originalOpen = storage.open;
    let opened;
    patch(pdfStorage, "open", async (key) => {
      opened = await originalOpen(key);
      return { ...opened, size: pdfStorage.MAX_PDF_SIZE + 1 };
    });
    await assertError(await ask(), 413);
    assert.equal(opened.handle.fd, -1);
    assert.equal(calls.length, 0);
  });

  test("bounds the bytes actually read even if the size check becomes stale", async () => {
    const key = documents.get(FIRST_ID).coursePdf.storageKey;
    const oversized = Buffer.alloc(pdfStorage.MAX_PDF_SIZE + 1, 0x20);
    PDF_A.copy(oversized);
    await fs.writeFile(path.join(directory, key), oversized);
    patch(pdfStorage, "open", async (storageKey) => ({ ...await storage.open(storageKey), size: PDF_A.length }));
    await assertError(await ask(), 413);
    assert.equal(calls.length, 0);
  });

  test("rejects invalid PDF bytes and closes the file before contacting Gemini", async () => {
    await fs.writeFile(path.join(directory, documents.get(FIRST_ID).coursePdf.storageKey), "not a PDF");
    await assertError(await ask(), 422);
    assert.equal(calls.length, 0);
  });

  test("closes the PDF before invoking Gemini and never changes attachment files", async () => {
    let opened;
    patch(pdfStorage, "open", async (key) => { opened = await storage.open(key); return opened; });
    provider = async () => { assert.equal(opened.handle.fd, -1); return response(); };
    const names = (await fs.readdir(directory)).sort();
    const result = await ask();
    assert.equal(result.status, 200);
    await result.json();
    assert.deepEqual((await fs.readdir(directory)).sort(), names);
    assert.deepEqual(await fs.readFile(path.join(directory, documents.get(FIRST_ID).coursePdf.storageKey)), PDF_A);
  });

  test("successful diagnostics distinguish file-read and generation timing without spurious cancellation", async () => {
    process.env.CHAT_DIAGNOSTICS = "true";
    const result = await ask();
    assert.equal(result.status, 200);
    await result.json();
    const records = info.mock.calls.map((call) => JSON.parse(call.arguments[0]));
    assert.deepEqual(records.map((record) => record.event), [
      "pdf_read_start", "pdf_read_complete", "gemini_request_start", "gemini_response", "chat_complete",
    ]);
    assert.equal(new Set(records.map((record) => record.requestId)).size, 1);
    assert.equal(records[1].bytes, PDF_A.length);
    assert.ok(records[1].durationMs >= 0);
    assert.equal(records[2].timeoutMs, 30000);
    assert.equal(records.some((record) => record.event === "cancellation"), false);
    assert.equal(JSON.stringify(records).includes("recyclage.pdf"), false);
    assert.equal(JSON.stringify(records).includes("Résume"), false);
  });

  test("an upstream 504 is reported as a provider deadline without triggering client cancellation", async () => {
    process.env.CHAT_DIAGNOSTICS = "true";
    provider = async () => {
      const error = new Error(JSON.stringify({ error: { status: "DEADLINE_EXCEEDED", message: "upstream-private-marker" } }));
      error.name = "ApiError";
      error.status = 504;
      throw error;
    };
    const body = await assertError(await ask(), 504);
    assert.equal(body.message, "Gemini provider deadline exceeded");
    const records = info.mock.calls.map((call) => JSON.parse(call.arguments[0]));
    const failed = records.find((record) => record.event === "gemini_error");
    assert.equal(failed.errorType, "ApiError");
    assert.equal(failed.status, 504);
    assert.equal(failed.rpcStatus, "DEADLINE_EXCEEDED");
    assert.equal(failed.cancellationSource, "none");
    assert.equal(records.some((record) => record.event === "cancellation"), false);
    assert.equal(JSON.stringify(records).includes("upstream-private-marker"), false);
  });

  test("the text diagnostic shares SDK settings and omits course/PDF instructions", async () => {
    const answer = await chatProvider.answerTextQuestion("Réponds uniquement : OK");
    assert.ok(answer.length > 0);
    assert.equal(calls[0].contents, "Réponds uniquement : OK");
    assert.equal(calls[0].config.systemInstruction, undefined);
    assert.equal(calls[0].config.httpOptions.retryOptions.attempts, 1);
    assert.equal(calls[0].config.httpOptions.timeout, 30000);
    assert.equal(calls[0].model, gemini.getConfig().model);
  });

  test("a pre-cancelled request never starts a provider call", async () => {
    const controller = new AbortController();
    controller.abort(CLIENT_DISCONNECT);
    await assert.rejects(
      chatProvider.answerTextQuestion("Question", controller.signal, createDiagnostics({ enabled: true })),
      (error) => error.statusCode === 504 && error.message === "Chat request cancelled"
    );
    assert.equal(calls.length, 0);
    const records = info.mock.calls.map((call) => JSON.parse(call.arguments[0]));
    assert.deepEqual(records.map((record) => [record.event, record.cancellationSource]), [["cancellation", "client_disconnect"]]);
  });

  test("the real installed SDK sends exactly one attempt for a local provider 429", async () => {
    const { GoogleGenAI } = require("@google/genai");
    let attempts = 0;
    const upstream = http.createServer((req, res) => {
      req.resume();
      attempts += 1;
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "upstream-private-marker" } }));
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    patch(gemini, "createClient", () => new GoogleGenAI({
      apiKey: "unit-test-placeholder", vertexai: false,
      httpOptions: { baseUrl: `http://127.0.0.1:${upstream.address().port}`, apiVersion: "v1beta" },
    }));
    try {
      await assertError(await ask(), 429);
      assert.equal(attempts, 1);
    } finally { await new Promise((resolve) => upstream.close(resolve)); }
  });

  test("the real SDK cancels its HTTP connection when the configured deadline expires", async () => {
    const { GoogleGenAI } = require("@google/genai");
    process.env.GEMINI_TIMEOUT_MS = "1000";
    process.env.CHAT_DIAGNOSTICS = "true";
    const closed = deferred();
    const upstream = http.createServer((req, res) => {
      req.resume();
      res.once("close", () => { if (!res.writableEnded) closed.resolve(); });
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    patch(gemini, "createClient", () => new GoogleGenAI({
      apiKey: "unit-test-placeholder", vertexai: false,
      httpOptions: { baseUrl: `http://127.0.0.1:${upstream.address().port}`, apiVersion: "v1beta" },
    }));
    try {
      const body = await assertError(await ask(), 504);
      assert.equal(body.message, "Gemini request deadline exceeded");
      await closed.promise;
      const records = info.mock.calls.map((call) => JSON.parse(call.arguments[0]));
      const cancelled = records.filter((record) => record.event === "cancellation");
      assert.equal(cancelled.length, 1);
      assert.equal(cancelled[0].cancellationSource, "deadline");
    } finally { await new Promise((resolve) => upstream.close(resolve)); }
  });

  for (const [upstreamStatus, expectedStatus] of [[400, 422], [401, 503], [403, 503], [404, 503], [413, 413], [429, 429], [500, 502], [503, 503], [504, 504]]) {
    test(`sanitizes provider HTTP ${upstreamStatus} as ${expectedStatus}`, async () => {
      provider = async () => {
        const error = new Error("upstream-private-marker");
        error.status = upstreamStatus;
        error.response = { internal: "upstream-private-marker" };
        throw error;
      };
      await assertError(await ask(), expectedStatus);
      assert.equal(calls.length, 1);
    });
  }

  test("network failures are sanitized without logging provider errors", async () => {
    provider = async () => { throw new TypeError("upstream-private-marker"); };
    await assertError(await ask(), 502);
  });

  test("missing or invalid configuration leaves health, formation, and PDF endpoints available", async () => {
    for (const [name, value] of [
      ["GEMINI_API_KEY", ""], ["GEMINI_API_KEY", "invalid whitespace"],
      ["GEMINI_MODEL", "https://example.com/model"], ["GEMINI_MODEL", ""],
      ["GEMINI_MAX_OUTPUT_TOKENS", "2049"], ["GEMINI_MAX_OUTPUT_TOKENS", "0"],
      ["CHAT_RATE_LIMIT_MAX", "0"], ["CHAT_RATE_LIMIT_WINDOW_MS", "bad"],
      ["GEMINI_TIMEOUT_MS", "0"], ["GEMINI_TIMEOUT_MS", "120001"],
    ]) {
      const previous = process.env[name];
      process.env[name] = value;
      await assertError(await ask(), 503);
      for (const url of ["/api/health", `/api/trainings/${FIRST_ID}`, `/api/trainings/${FIRST_ID}/pdf`]) {
        const result = await fetch(`${baseUrl}${url}`);
        assert.equal(result.status, 200);
        await result.arrayBuffer();
      }
      process.env[name] = previous;
    }
    assert.equal(calls.length, 0);
  });

  test("uses the documented default model when GEMINI_MODEL is absent", async () => {
    delete process.env.GEMINI_MODEL;
    const result = await ask();
    assert.equal(result.status, 200);
    await result.json();
    assert.equal(calls[0].model, "gemini-3.5-flash-lite");
  });

  test("blocked, empty, malformed, and thought-only responses are handled safely", async () => {
    for (const [value, status] of [
      [{ promptFeedback: { blockReason: "SAFETY" } }, 422],
      [response("blocked", "SAFETY"), 422],
      [response("blocked", "RECITATION"), 422],
      [{ candidates: [{ safetyRatings: [{ blocked: true }], content: { parts: [{ text: "blocked" }] } }] }, 422],
      [{ candidates: [] }, 502], [response("  "), 502],
      [response("unusable", "OTHER"), 502],
      [{ candidates: [{ content: { parts: { invalid: true } } }] }, 502],
      [{ candidates: [{ content: { parts: [{ text: "hidden", thought: true }] } }] }, 502],
    ]) {
      provider = async () => value;
      await assertError(await ask(), status);
    }
  });

  test("returns only visible text and enforces the 8000-character answer bound", async () => {
    provider = async () => ({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [
      { text: "Hidden reasoning", thought: true }, { text: "🌱".repeat(9000) },
    ] } }] });
    const result = await ask();
    assert.equal(result.status, 200);
    const { data } = await result.json();
    assert.equal(Array.from(data.answer).length, 8000);
    assert.equal(data.answer.endsWith("…"), true);
    assert.equal(data.answer.includes("Hidden reasoning"), false);
  });

  test("rate limits chat per IP and supplies Retry-After without blocking other endpoints", async () => {
    process.env.CHAT_RATE_LIMIT_MAX = "2";
    for (let index = 0; index < 2; index += 1) {
      const result = await ask();
      assert.equal(result.status, 200);
      await result.json();
    }
    const limited = await ask();
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    await assertError(limited, 429);
    assert.equal(calls.length, 2);
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    await health.json();
  });

  test("30-second deadline aborts the provider request instead of only timing out its response", async () => {
    const started = deferred();
    const originalSetTimeout = global.setTimeout;
    let trigger;
    let signal;
    patch(global, "setTimeout", (callback, delay, ...args) => {
      if (delay === 30000) trigger = callback;
      return originalSetTimeout(callback, delay, ...args);
    });
    provider = (params) => {
      signal = params.config.abortSignal;
      started.resolve();
      return new Promise(() => {});
    };
    const pending = ask();
    await started.promise;
    assert.equal(signal.aborted, false);
    assert.equal(typeof trigger, "function");
    trigger();
    await assertError(await pending, 504);
    assert.equal(signal.aborted, true);
  });

  test("disconnecting the HTTP client cancels the provider request", async () => {
    process.env.CHAT_DIAGNOSTICS = "true";
    const started = deferred();
    const cancelled = deferred();
    provider = (params) => {
      params.config.abortSignal.addEventListener("abort", () => cancelled.resolve(), { once: true });
      started.resolve();
      return new Promise(() => {});
    };
    const controller = new AbortController();
    const pending = ask(undefined, FIRST_ID, { signal: controller.signal }).catch((error) => error.name);
    await started.promise;
    controller.abort();
    assert.equal(await pending, "AbortError");
    await cancelled.promise;
    const records = info.mock.calls.map((call) => JSON.parse(call.arguments[0]));
    assert.deepEqual(records.filter((record) => record.event === "cancellation").map((record) => record.cancellationSource), ["client_disconnect"]);
  });
});
