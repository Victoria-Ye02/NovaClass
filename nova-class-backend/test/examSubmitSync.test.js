const test = require("node:test");
const assert = require("node:assert/strict");

const pool = require("../config/db");
const originalQuery = pool.query;
const originalFetch = global.fetch;
const controllerPath = require.resolve("../controllers/thine/exam.controller");
const syncPath = require.resolve("../services/topik/examSync");

function load(t, syncImpl) {
  const syncCalls = [];
  const originalSync = require.cache[syncPath];
  require.cache[syncPath] = {
    id: syncPath, filename: syncPath, loaded: true,
    exports: { syncExamResults: async (...args) => { syncCalls.push(args); return syncImpl(); } },
  };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  t.after(() => {
    pool.query = originalQuery;
    global.fetch = originalFetch;
    delete require.cache[controllerPath];
    if (originalSync) require.cache[syncPath] = originalSync; else delete require.cache[syncPath];
  });
  return { controller, syncCalls };
}

function http(body = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req: { user: { id: 5 }, body }, res };
}

// the exam service: /api/user/ensure answers with a user id, /api/exam/submit with `submit`
function examService(submit) {
  global.fetch = async url => {
    if (/\/api\/user\/ensure/.test(url)) return { ok: true, status: 200, json: async () => ({ id: 1 }) };
    return submit;
  };
  pool.query = async () => [[{ name: "ye", email: "ye@example.com" }]];
}

test("a graded exam is returned unchanged and its result is then copied to MySQL for that student", async t => {
  const { controller, syncCalls } = load(t, () => ({ synced: 1 }));
  const result = { exam_id: "e1", total_score: 6, sections: [] };
  examService({ ok: true, status: 200, json: async () => result });
  const { req, res } = http({ exam_id: "e1", reading_answers: [] });
  await controller.submitExam(req, res);
  assert.deepEqual(res.body, result);
  assert.equal(syncCalls.length, 1);
  assert.equal(syncCalls[0][1].userId, 5);
});

test("if copying to MySQL fails the student still gets the exam result", async t => {
  const { controller } = load(t, async () => { throw new Error("mysql down"); });
  const log = console.error; console.error = () => {};
  t.after(() => { console.error = log; });
  examService({ ok: true, status: 200, json: async () => ({ exam_id: "e1" }) });
  const { req, res } = http({});
  await controller.submitExam(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { exam_id: "e1" });
  await new Promise(resolve => setImmediate(resolve));               // let the rejected sync settle without crashing
});

test("a failed submission is passed through as before and nothing is copied", async t => {
  const { controller, syncCalls } = load(t, () => ({}));
  examService({ ok: false, status: 503, json: async () => ({ error: "llm_not_configured" }) });
  const { req, res } = http({});
  await controller.submitExam(req, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "llm_not_configured" });
  assert.equal(syncCalls.length, 0);
});
