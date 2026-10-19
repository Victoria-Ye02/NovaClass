const test = require("node:test");
const assert = require("node:assert/strict");
const { runSql, traceSql, splitStatements } = require("../services/code/sqlRunner");

const SCRIPT = "-- demo\nCREATE TABLE t (id INT, n TEXT);\nINSERT INTO t VALUES (1,'a;b'),\n  (2,'b');\n\nSELECT * FROM t WHERE id > 1;\nSELECT COUNT(*) AS c FROM t;";

test("statements are split on ; outside quotes and comments, keeping their first line", () => {
  assert.deepEqual(splitStatements(SCRIPT).map(s => s.line), [2, 3, 6, 7]);
  assert.equal(splitStatements("SELECT 'x;y'; -- ; hi\nSELECT 2;").length, 2);
});

test("queries return the real rows as a table; other statements say how many rows changed", async () => {
  const r = await runSql(SCRIPT);
  assert.equal(r.ok, true);
  assert.match(r.output, /OK \(2 rows changed\)/);
  assert.match(r.output, /id \| n\n---\+--\n2 {2}\| b/);
  assert.match(r.output, /c\n-\n2/);
});

test("an earlier cell's SQL is run first, so its tables exist", async () => {
  const r = await runSql("SELECT * FROM t", "CREATE TABLE t(x); INSERT INTO t VALUES (7);");
  assert.match(r.output, /x\n-\n7/);
});

test("a syntax error names the statement; ATTACH is refused", async () => {
  const bad = await runSql("SELECT 1; SELEC 2");
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Statement 2.*syntax error/);
  assert.match((await runSql("ATTACH DATABASE 'x' AS y")).error, /not allowed/);
});

test("a runaway query is killed by the time limit", async () => {
  const r = await runSql("WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM r) SELECT count(*) FROM r");
  assert.equal(r.timedOut, true);
});

test("tracing gives one step per statement with the real tables and results so far", async () => {
  const r = await traceSql(SCRIPT);
  assert.equal(r.error, null);
  assert.deepEqual(r.steps.map(s => s.line), [2, 3, 6, 7]);
  assert.equal(r.steps[0].memory.t, "[]");
  assert.equal(r.steps[1].memory.t, "[(1, 'a;b'), (2, 'b')]");
  assert.match(r.steps[3].printed, /id \| n[\s\S]*c\n-\n2/);
});
