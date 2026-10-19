const test = require("node:test");
const assert = require("node:assert/strict");
const { tracePython } = require("../services/code/pythonTracer");

test("a 5-iteration loop gives every executed line, with state after each", async () => {
  const r = await tracePython("for i in range(1,6):\n  print('hello')");
  assert.equal(r.error, null);
  assert.equal(r.steps.length, 11);                                  // header 6 times (incl. the exit check) + body 5 times
  assert.deepEqual(r.steps.at(-1).line, 1);
  assert.equal(r.steps.at(-1).printed, "hello\nhello\nhello\nhello\nhello\n");
  const bodies = r.steps.filter(s => s.line === 2);
  assert.equal(bodies.length, 5);
  assert.equal(bodies[2].memory.i, "3");
});

test("variables are shown after the line that changed them", async () => {
  const r = await tracePython("total = 0\nfor i in range(1, 3):\n    total = total + i\nprint(total)");
  const last = r.steps.at(-1);
  assert.equal(last.memory.total, "3");
  assert.equal(last.printed, "3\n");
});

test("an error in the student's code is reported, with the steps before it", async () => {
  const r = await tracePython("x = 1\ny = x / 0");
  assert.match(r.error, /ZeroDivisionError/);
  assert.equal(r.steps.length, 2);
});

test("an endless loop is stopped", async () => {
  const r = await tracePython("while True:\n    pass");
  assert.ok(r.steps.length > 0 || r.error);
});
