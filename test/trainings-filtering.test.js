const assert = require("node:assert/strict");
const { once } = require("node:events");
const { after, before, beforeEach, mock, test } = require("node:test");
const app = require("../src/app");
const Formation = require("../src/modules/trainings/model");

function formation(id, fields = {}) {
  return {
    _id: id.toString(16).padStart(24, "0"),
    title: `Formation ${id}`,
    category: "recyclage",
    level: "débutant",
    mode: "en ligne",
    isFree: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  };
}

const formations = [
  formation(1),
  formation(2, { isFree: false }),
  formation(3, { level: "intermédiaire" }),
  formation(4, { mode: "présentiel" }),
  formation(5, { category: "agriculture" }),
  formation(6, { category: "numérique", isFree: false }),
  ...Array.from({ length: 12 }, (_, index) =>
    formation(index + 7, {
      category: "énergie",
      level: "avancé",
      mode: "présentiel",
      isFree: false,
    })
  ),
];

const calls = { find: [], count: [] };
let server;
let baseUrl;

function matches(document, filters) {
  return Object.entries(filters).every(
    ([field, value]) => document[field] === value
  );
}

async function get(path = "/api/trainings", params) {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`${baseUrl}${path}${query}`);
  return { status: response.status, body: await response.json() };
}

async function assertBadQuery(params) {
  const { status, body } = await get("/api/trainings", params);
  assert.equal(status, 400, JSON.stringify(params));
  assert.equal(body.success, false);
  assert.equal(typeof body.message, "string");
  assert.ok(body.message.length > 0);
  assert.deepEqual(Object.keys(body).sort(), ["message", "success"]);
  assert.equal(calls.find.length, 0);
  assert.equal(calls.count.length, 0);
}

before(async () => {
  // Replace only database reads; keep Express and Mongoose query execution real.
  mock.method(Formation.collection, "find", (filters, options) => {
    calls.find.push({ filters, options });
    const rows = formations.filter((document) => matches(document, filters));
    rows.sort((left, right) => {
      for (const [field, direction] of Object.entries(options.sort || {})) {
        if (left[field] !== right[field]) {
          return left[field] > right[field] ? direction : -direction;
        }
      }
      return 0;
    });
    const start = options.skip || 0;
    const end = options.limit === undefined ? undefined : start + options.limit;
    return { toArray: async () => rows.slice(start, end) };
  });
  mock.method(Formation.collection, "countDocuments", async (filters) => {
    calls.count.push(filters);
    return formations.filter((document) => matches(document, filters)).length;
  });

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  calls.find.length = 0;
  calls.count.length = 0;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  mock.restoreAll();
});

test("unfiltered requests preserve the response, defaults, and sort order", async () => {
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(Object.keys(body).sort(), ["data", "pagination", "success"]);
  assert.equal(body.data.length, 10);
  assert.deepEqual(body.pagination, {
    page: 1,
    limit: 10,
    total: 18,
    totalPages: 2,
  });
  assert.deepEqual(body.data.map((item) => item._id), formations.slice(8).reverse().map((item) => item._id));
  assert.deepEqual(calls.find[0].filters, {});
  assert.deepEqual(calls.count, [{}]);
  assert.deepEqual(calls.find[0].options.sort, { createdAt: -1, _id: -1 });
});

for (const field of ["category", "level", "mode"]) {
  test(`accepts every ${field} value from the Formation schema`, async () => {
    for (const value of Formation.schema.path(field).enumValues) {
      const { status, body } = await get("/api/trainings", { [field]: value });
      assert.equal(status, 200, `${field}=${value}`);
      assert.equal(body.pagination.total, formations.filter((item) => item[field] === value).length);
      assert.ok(body.data.every((item) => item[field] === value));
      assert.deepEqual(calls.find.at(-1).filters, { [field]: value });
      assert.deepEqual(calls.count.at(-1), { [field]: value });
    }
  });
}

for (const value of ["true", "false"]) {
  test(`converts isFree=${value} to a boolean for both database queries`, async () => {
    const { status, body } = await get("/api/trainings", { isFree: value });
    const expected = value === "true";
    assert.equal(status, 200);
    assert.ok(body.data.length > 0);
    assert.ok(body.data.every((item) => item.isFree === expected));
    assert.equal(body.pagination.total, expected ? 4 : 14);
    assert.deepEqual(calls.find[0].filters, { isFree: expected });
    assert.deepEqual(calls.count[0], { isFree: expected });
  });
}

test("combines all supplied filters using AND", async () => {
  const filters = {
    category: "recyclage",
    level: "débutant",
    mode: "en ligne",
    isFree: "true",
  };
  const { status, body } = await get("/api/trainings", filters);
  assert.equal(status, 200);
  assert.deepEqual(body.data, [formations[0]]);
  assert.deepEqual(body.pagination, { page: 1, limit: 10, total: 1, totalPages: 1 });
  assert.deepEqual(calls.find[0].filters, { ...filters, isFree: true });
  assert.deepEqual(calls.count[0], calls.find[0].filters);
});

test("paginates filtered results and counts all matching records", async () => {
  const { status, body } = await get("/api/trainings", {
    category: "énergie",
    page: "2",
    limit: "5",
  });
  assert.equal(status, 200);
  assert.deepEqual(body.data, formations.slice(8, 13).reverse());
  assert.deepEqual(body.pagination, { page: 2, limit: 5, total: 12, totalPages: 3 });
  assert.equal(calls.find[0].options.skip, 5);
  assert.equal(calls.find[0].options.limit, 5);
  assert.deepEqual(calls.count[0], calls.find[0].filters);
});

test("defaults page and limit independently and accepts limit boundaries", async () => {
  for (const [params, page, limit, length] of [
    [{ page: "2" }, 2, 10, 8],
    [{ limit: "1" }, 1, 1, 1],
    [{ limit: "100" }, 1, 100, 18],
  ]) {
    const { status, body } = await get("/api/trainings", params);
    assert.equal(status, 200);
    assert.equal(body.pagination.page, page);
    assert.equal(body.pagination.limit, limit);
    assert.equal(body.data.length, length);
  }
});

test("returns HTTP 200 and an empty array when filters match nothing", async () => {
  const { status, body } = await get("/api/trainings", {
    category: "recyclage",
    level: "avancé",
  });
  assert.equal(status, 200);
  assert.deepEqual(body, {
    success: true,
    data: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
  });
});

test("an out-of-range page returns an empty array with the filtered total", async () => {
  const { status, body } = await get("/api/trainings", {
    category: "recyclage",
    page: "5",
    limit: "1",
  });
  assert.equal(status, 200);
  assert.deepEqual(body.data, []);
  assert.deepEqual(body.pagination, { page: 5, limit: 1, total: 4, totalPages: 4 });
});

test("rejects invalid enum values, including empty and padded values", async () => {
  for (const [field, values] of [
    ["category", ["", "invalid", "energie", " recyclage", "RECYCLAGE"]],
    ["level", ["", "beginner", "debutant", "débutant "]],
    ["mode", ["", "online", "presentiel", "en ligne "]],
  ]) {
    for (const value of values) {
      await assertBadQuery({ [field]: value });
    }
  }
});

test("rejects isFree values other than exactly true or false", async () => {
  for (const isFree of ["", "TRUE", "False", "1", "0", "yes", "null", " true", "false ", "true,false"]) {
    await assertBadQuery({ isFree });
  }
});

test("rejects invalid pagination, unsafe integers, and unsafe offsets", async () => {
  for (const page of ["", "0", "-1", "1.5", "NaN", "Infinity", "1e2", "0x10", " 1", "9007199254740992"]) {
    await assertBadQuery({ page });
  }
  for (const limit of ["", "0", "101", "-1", "1.5", "NaN", "Infinity", "1e2", "0x10", "10 "]) {
    await assertBadQuery({ limit });
  }
  await assertBadQuery({ page: "9007199254740991", limit: "100" });
});

test("rejects repeated parameters even when their values are identical", async () => {
  for (const [key, value] of Object.entries({
    page: "1",
    limit: "10",
    category: "recyclage",
    level: "débutant",
    mode: "en ligne",
    isFree: "false",
  })) {
    await assertBadQuery([[key, value], [key, value]]);
  }
  await assertBadQuery([["isFree", "true"], ["isFree", "false"]]);
  const { status } = await get("/api/trainings?category=recyclage&%63ategory=recyclage");
  assert.equal(status, 400);
  assert.equal(calls.find.length, 0);
});

test("rejects unknown parameters, arrays, objects, and MongoDB operators", async () => {
  for (const key of ["sort", "price", "__proto__", "constructor", "toString", "category[]", "category[$ne]", "isFree[$ne]", "page[]", "$where"]) {
    await assertBadQuery({ [key]: "recyclage" });
  }
});

test("database errors still use the centralized error handler", async () => {
  const error = new Error("Database unavailable");
  const find = mock.method(Formation.collection, "find", () => { throw error; });
  const log = mock.method(console, "error", () => {});
  try {
    const { status, body } = await get();
    assert.equal(status, 500);
    assert.deepEqual(body, { success: false, message: "Internal server error" });
    assert.equal(log.mock.calls[0].arguments[0], error);
  } finally {
    find.mock.restore();
    log.mock.restore();
  }
});

test("existing health, training ID validation, and quiz validation still work", async () => {
  const health = await get("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { success: true, message: "Training backend is running" });

  const training = await get("/api/trainings/invalid");
  assert.equal(training.status, 400);
  assert.deepEqual(training.body, { success: false, message: "Invalid formation ID" });

  const quiz = await get("/api/quizzes/invalid");
  assert.equal(quiz.status, 400);
  assert.deepEqual(quiz.body, { success: false, message: "Invalid quiz ID" });
  assert.equal(calls.find.length, 0);
  assert.equal(calls.count.length, 0);
});
