const assert = require("node:assert/strict");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { after, afterEach, before, beforeEach, describe, mock, test } = require("node:test");
const app = require("../src/app");
const Quiz = require("../src/modules/quizzes/model");
const Formation = require("../src/modules/trainings/model");
const QuizAttempt = require("../src/modules/quizzes/attempt-model");
const { getCertificateConfig } = require("../src/config/certificates");
const { resolveLearner } = require("../src/modules/quizzes/learner");

const QUIZ_ID = "507f1f77bcf86cd799439011";
const FORMATION_ID = "507f1f77bcf86cd799439012";
const UNKNOWN_ID = "507f1f77bcf86cd799439013";
const ENVIRONMENT = ["NODE_ENV", "CERTIFICATE_DEMO_MODE", "CERTIFICATE_PASSING_PERCENTAGE"];

function fixture(count = 5) {
  return new Quiz({
    _id: QUIZ_ID,
    title: "Quiz de recyclage",
    formation: FORMATION_ID,
    questions: Array.from({ length: count }, (_, index) => ({
      _id: (index + 1).toString(16).padStart(24, "0"),
      question: `Question ${index + 1}`,
      options: { A: "First", B: "Second", C: "Third", D: "Fourth" },
      correctAnswer: ["A", "B", "C", "D"][index % 4],
    })),
  }).toObject();
}

describe("certificate demo configuration", () => {
  test("requires an explicit true and returns no learner when disabled", () => {
    for (const env of [{}, { CERTIFICATE_DEMO_MODE: "false", NODE_ENV: "production" }]) {
      const config = getCertificateConfig(env);
      assert.deepEqual(config, { demoMode: false });
      assert.equal(resolveLearner(config), null);
    }
    assert.deepEqual(getCertificateConfig({ NODE_ENV: "development", CERTIFICATE_DEMO_MODE: "true" }), {
      demoMode: true, passingPercentage: 80,
    });
  });

  test("rejects ambiguous flags and demo mode outside development", () => {
    for (const flag of ["", "TRUE", "True", "1", "yes", " true ", "FALSE"]) {
      assert.throws(() => getCertificateConfig({ CERTIFICATE_DEMO_MODE: flag }), {
        statusCode: 503, message: "CERTIFICATE_DEMO_MODE must be true or false",
      });
    }
    for (const nodeEnv of [undefined, "", "production", "test", "Development"]) {
      assert.throws(() => getCertificateConfig({ CERTIFICATE_DEMO_MODE: "true", NODE_ENV: nodeEnv }), {
        statusCode: 503, message: "CERTIFICATE_DEMO_MODE=true requires NODE_ENV=development",
      });
    }
  });

  test("accepts finite decimal percentages from 0 through 100", () => {
    for (const raw of ["0", "80", "80.5", "66.67", "100"]) {
      const config = getCertificateConfig({
        NODE_ENV: "development", CERTIFICATE_DEMO_MODE: "true", CERTIFICATE_PASSING_PERCENTAGE: raw,
      });
      assert.equal(config.passingPercentage, Number(raw));
    }
  });

  test("rejects missing numbers, non-finite numbers, and percentages outside the range", () => {
    for (const raw of ["", " ", "-1", "100.01", "NaN", "Infinity", "1e2", "0x50", "80%", "80abc", " 80 ", "9".repeat(400)]) {
      assert.throws(() => getCertificateConfig({
        NODE_ENV: "development", CERTIFICATE_DEMO_MODE: "true", CERTIFICATE_PASSING_PERCENTAGE: raw,
      }), { statusCode: 503, message: "CERTIFICATE_PASSING_PERCENTAGE must be a number between 0 and 100" });
    }
  });
});

describe("quiz submission and attempt persistence", () => {
  let server;
  let baseUrl;
  let quiz;
  let formation;
  let saved;
  let environment;
  let insert;
  let formationRead;
  let log;
  const patches = [];

  function patch(target, method, implementation) {
    const replacement = mock.method(target, method, implementation);
    patches.push(replacement);
    return replacement;
  }

  function answers(score = quiz.questions.length) {
    return quiz.questions.map((question, index) => ({
      questionId: question._id.toString(),
      answer: index < score ? question.correctAnswer : (question.correctAnswer === "A" ? "B" : "A"),
    }));
  }

  async function submit(body = { answers: answers() }, id = QUIZ_ID, options = {}) {
    return fetch(`${baseUrl}/api/quizzes/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...options,
    });
  }

  async function assertError(response, status) {
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.ok(body.message);
    assert.equal(body.data, undefined);
    assert.equal(body.attemptId, undefined);
    assert.equal(saved.length, 0);
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
    quiz = fixture();
    formation = { _id: new mongoose.Types.ObjectId(FORMATION_ID), title: "Formation recyclage" };
    saved = [];

    // Mock database I/O only; keep real queries, casting, validation, and inserts.
    patch(Quiz.collection, "findOne", async (filter) => String(filter._id) === QUIZ_ID ? quiz : null);
    formationRead = patch(Formation.collection, "findOne", async (filter) => (
      String(filter._id) === FORMATION_ID ? formation : null
    ));
    insert = patch(QuizAttempt.collection, "insertOne", async (document) => {
      saved.push({ ...document });
      return { acknowledged: true, insertedId: document._id };
    });
    for (const model of [Quiz, Formation]) {
      for (const method of ["insertOne", "updateOne", "findOneAndUpdate", "findOneAndDelete", "deleteOne"]) {
        patch(model.collection, method, () => { throw new Error("Submission must not modify quizzes or formations"); });
      }
    }
    log = patch(console, "error", () => {});
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

  test("saves a passing attempt with server-derived identity, snapshots, score, and timestamp", async () => {
    const started = Date.now();
    const response = await submit({
      answers: answers(4),
      learnerIdentifier: "forged-learner",
      learnerDisplayName: "Forged name",
      learner: { identifier: "forged-learner", displayName: "Forged name" },
      score: 999, totalQuestions: 999, percentage: 100, passingPercentage: 0, passed: false,
      quizId: UNKNOWN_ID, formationId: UNKNOWN_ID,
      quizTitle: "Forged quiz", formationTitle: "Forged formation", submittedAt: "2000-01-01T00:00:00Z",
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(saved.length, 1);
    const attempt = saved[0];
    assert.deepEqual(body, {
      success: true,
      message: "Quiz graded successfully",
      data: {
        quizId: QUIZ_ID, score: 4, totalQuestions: 5, percentage: 80,
        attemptId: String(attempt._id), passingPercentage: 80, passed: true,
      },
    });
    assert.equal(String(attempt.quizId), QUIZ_ID);
    assert.equal(String(attempt.formationId), FORMATION_ID);
    assert.equal(attempt.quizTitle, quiz.title);
    assert.equal(attempt.formationTitle, formation.title);
    assert.equal(attempt.learnerIdentifier, "demo-learner");
    assert.equal(attempt.learnerDisplayName, "Apprenant de démonstration");
    for (const field of ["score", "totalQuestions", "percentage", "passingPercentage", "passed"]) {
      assert.equal(attempt[field], body.data[field]);
    }
    assert.ok(attempt.submittedAt instanceof Date);
    assert.ok(attempt.submittedAt.getTime() >= started && attempt.submittedAt.getTime() <= Date.now());
    assert.equal(attempt.answers, undefined);
    assert.equal(attempt.questions, undefined);
    assert.equal(JSON.stringify(body).includes("correctAnswer"), false);
    assert.equal(log.mock.callCount(), 0);
  });

  test("saves failing attempts, including zero scores", async () => {
    for (const score of [3, 0]) {
      const response = await submit({ answers: answers(score) });
      assert.equal(response.status, 200);
      const { data } = await response.json();
      assert.equal(data.passed, false);
      assert.equal(data.score, score);
      assert.equal(data.percentage, score / 5 * 100);
      assert.equal(String(saved.at(-1)._id), data.attemptId);
      assert.equal(saved.at(-1).passed, false);
      assert.equal(saved.at(-1).score, score);
    }
    assert.equal(saved.length, 2);
  });

  test("compares the unrounded ratio and supports a configurable threshold", async () => {
    quiz = fixture(3);
    process.env.CERTIFICATE_PASSING_PERCENTAGE = "66.67";
    const failing = await submit({ answers: answers(2) });
    assert.equal(failing.status, 200);
    const { data } = await failing.json();
    assert.equal(data.percentage, 66.67);
    assert.equal(data.passingPercentage, 66.67);
    assert.equal(data.passed, false);
    assert.equal(saved[0].passed, false);
    process.env.CERTIFICATE_PASSING_PERCENTAGE = "66.66";
    const passing = await submit({ answers: answers(2) });
    assert.equal(passing.status, 200);
    assert.equal((await passing.json()).data.passed, true);
    assert.equal(saved[1].passingPercentage, 66.66);
    assert.equal(saved[0].passingPercentage, 66.67);
  });

  test("handles inclusive thresholds at zero, 58, and 100 percent", async () => {
    for (const [count, score, threshold] of [[5, 0, "0"], [50, 29, "58"], [5, 5, "100"]]) {
      quiz = fixture(count);
      process.env.CERTIFICATE_PASSING_PERCENTAGE = threshold;
      const response = await submit({ answers: answers(score) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.passed, true);
    }
    assert.equal(saved.length, 3);
  });

  test("uses the default 80 percent threshold when unset", async () => {
    delete process.env.CERTIFICATE_PASSING_PERCENTAGE;
    const response = await submit({ answers: answers(4) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.passingPercentage, 80);
    assert.equal(saved[0].passingPercentage, 80);
  });

  test("each submission creates a separate attempt and retains earlier title snapshots", async () => {
    const first = await submit();
    assert.equal(first.status, 200);
    const firstId = (await first.json()).data.attemptId;
    quiz.title = "Renamed quiz";
    formation.title = "Renamed formation";
    const second = await submit();
    assert.equal(second.status, 200);
    const secondId = (await second.json()).data.attemptId;
    assert.notEqual(firstId, secondId);
    assert.equal(saved.length, 2);
    assert.equal(saved[0].quizTitle, "Quiz de recyclage");
    assert.equal(saved[0].formationTitle, "Formation recyclage");
    assert.equal(saved[1].quizTitle, "Renamed quiz");
    assert.equal(saved[1].formationTitle, "Renamed formation");
  });

  test("still accepts answers in any order and uppercase question IDs", async () => {
    quiz.questions[0]._id = new mongoose.Types.ObjectId("abcdefabcdefabcdefabcdef");
    const submission = answers().reverse().map((item) => ({ ...item, questionId: item.questionId.toUpperCase() }));
    const response = await submit({ answers: submission });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.score, 5);
    assert.equal(saved.length, 1);
  });

  test("rejects malformed bodies and answer counts without reading a formation or writing an attempt", async () => {
    for (const body of [null, [], {}, { answers: null }, { answers: "A" }, { answers: [] }, { answers: answers().slice(1) }, { answers: [...answers(), answers()[0]] }]) {
      await assertError(await submit(body), 400);
    }
    assert.equal(formationRead.mock.callCount(), 0);
    assert.equal(insert.mock.callCount(), 0);
  });

  test("rejects malformed answers without persistence", async () => {
    const valid = answers()[0];
    for (const item of [null, [], "A", {}, { ...valid, questionId: "invalid" }, { ...valid, questionId: 123 }, { ...valid, answer: "E" }, { ...valid, answer: "a" }, { ...valid, answer: 1 }, { ...valid, answer: null }]) {
      const submission = answers();
      submission[0] = item;
      await assertError(await submit({ answers: submission }), 400);
    }
    assert.equal(formationRead.mock.callCount(), 0);
    assert.equal(insert.mock.callCount(), 0);
  });

  test("rejects unknown and duplicate question IDs without persistence", async () => {
    const unknown = answers();
    unknown[0].questionId = UNKNOWN_ID;
    await assertError(await submit({ answers: unknown }), 400);
    const duplicate = answers();
    duplicate[1].questionId = duplicate[0].questionId.toUpperCase();
    await assertError(await submit({ answers: duplicate }), 400);
    assert.equal(formationRead.mock.callCount(), 0);
    assert.equal(insert.mock.callCount(), 0);
  });

  test("rejects malformed quiz IDs, nonexistent quizzes, and empty legacy quizzes without persistence", async () => {
    await assertError(await submit(undefined, "invalid"), 400);
    await assertError(await submit(undefined, UNKNOWN_ID), 404);
    quiz = fixture(0);
    await assertError(await submit({ answers: [] }), 400);
    assert.equal(formationRead.mock.callCount(), 0);
    assert.equal(insert.mock.callCount(), 0);
  });

  test("rejects malformed JSON without persistence", async () => {
    await assertError(await submit(undefined, QUIZ_ID, { body: '{"answers":' }), 400);
    assert.equal(insert.mock.callCount(), 0);
  });

  test("does not save an attempt when the referenced formation is missing", async () => {
    formation = null;
    const body = await assertError(await submit(), 404);
    assert.equal(body.message, "Formation not found");
    assert.equal(insert.mock.callCount(), 0);
  });

  test("returns an error without an attempt ID if insertion fails", async () => {
    insert.mock.mockImplementation(async () => { throw new Error("private-database-details"); });
    const body = await assertError(await submit(), 503);
    assert.equal(body.message, "Unable to save quiz attempt. Please try again.");
    assert.equal(insert.mock.callCount(), 1);
    assert.equal(JSON.stringify(body).includes("private-database-details"), false);
  });

  test("returns an error if the server-derived attempt fails model validation", async () => {
    formation.title = "";
    await assertError(await submit(), 503);
    assert.equal(insert.mock.callCount(), 0);
  });

  test("does not return success before the database acknowledges the insert", async () => {
    let release;
    const acknowledgement = new Promise((resolve) => { release = resolve; });
    let entered;
    const inserting = new Promise((resolve) => { entered = resolve; });
    insert.mock.mockImplementation(async (document) => {
      entered();
      await acknowledgement;
      saved.push({ ...document });
      return { acknowledged: true, insertedId: document._id };
    });
    let completed = false;
    const pending = submit().then((response) => { completed = true; return response; });
    await inserting;
    try {
      assert.equal(completed, false);
      assert.equal(saved.length, 0);
    } finally {
      release();
    }
    const response = await pending;
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.attemptId, String(saved[0]._id));
  });

  test("rejects demo mode outside development without writing attempts", async () => {
    for (const nodeEnv of ["production", "test", "", undefined]) {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      const body = await assertError(await submit(), 503);
      assert.equal(body.message, "CERTIFICATE_DEMO_MODE=true requires NODE_ENV=development");
    }
    assert.equal(formationRead.mock.callCount(), 0);
    assert.equal(insert.mock.callCount(), 0);
  });

  test("invalid demo flags and thresholds cannot save attempts", async () => {
    for (const [name, value] of [["CERTIFICATE_DEMO_MODE", "TRUE"], ["CERTIFICATE_PASSING_PERCENTAGE", ""], ["CERTIFICATE_PASSING_PERCENTAGE", "101"], ["CERTIFICATE_PASSING_PERCENTAGE", "NaN"]]) {
      process.env.CERTIFICATE_DEMO_MODE = "true";
      process.env.CERTIFICATE_PASSING_PERCENTAGE = "80";
      process.env[name] = value;
      await assertError(await submit(), 503);
    }
    assert.equal(formationRead.mock.callCount(), 0);
    assert.equal(insert.mock.callCount(), 0);
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    await health.json();
  });

  test("disabled or unset demo mode preserves the exact existing grading response without identity fallback", async () => {
    process.env.NODE_ENV = "production";
    process.env.CERTIFICATE_PASSING_PERCENTAGE = "ignored-when-disabled";
    formation = null;
    for (const mode of ["false", undefined]) {
      if (mode === undefined) delete process.env.CERTIFICATE_DEMO_MODE;
      else process.env.CERTIFICATE_DEMO_MODE = mode;
      const response = await submit({
        answers: answers(3), learnerIdentifier: "demo-learner", score: 5,
        CERTIFICATE_DEMO_MODE: true, demoMode: true,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        success: true, message: "Quiz graded successfully",
        data: { quizId: QUIZ_ID, score: 3, totalQuestions: 5, percentage: 60 },
      });
    }
    assert.equal(formationRead.mock.callCount(), 0);
    assert.equal(insert.mock.callCount(), 0);
    assert.equal(saved.length, 0);
  });
});
