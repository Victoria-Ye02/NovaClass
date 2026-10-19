const test = require("node:test");
const assert = require("node:assert/strict");
const { traceJs } = require("../services/code/jsTracer");

test("a for loop gives one step per line visit, with variables and console output", async () => {
  const r = await traceJs("let total = 0;\nfor (let i = 1; i <= 3; i++) {\n  total += i;\n  console.log('t', total);\n}");
  assert.equal(r.error, null);
  assert.equal(r.steps.filter(s => s.line === 3).length, 3);          // the body ran 3 times
  const last = r.steps.at(-1);
  assert.equal(last.memory.total, "6");
  assert.equal(last.printed, "t 1\nt 3\nt 6\n");
});

test("arrays and objects are shown as values", async () => {
  const r = await traceJs("const a = [1, 2];\nconst o = { x: 1 };\nconsole.log(a);");
  const last = r.steps.at(-1);
  assert.equal(last.memory.a, "[1,2]");
  assert.equal(last.memory.o, '{"x":1}');
  assert.equal(last.printed, "[ 1, 2 ]\n");
});

test("an endless loop is stopped by the time limit", async () => {
  const r = await traceJs("while (true) {}");
  assert.match(r.error, /too long/);
});
