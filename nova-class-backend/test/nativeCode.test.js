const test = require("node:test");
const assert = require("node:assert/strict");
const { runNative, traceNative } = require("../services/code/nativeCode");

const CPP = `#include <iostream>
#include <vector>
using namespace std;
int sq(int x) {
    return x * x;
}
int main() {
    int total = 0;
    for (int i = 1; i <= 3; i++) {
        total += sq(i);
        cout << "t " << total << endl;
    }
    vector<int> v = {1, 2};
    return 0;
}`;

test("C++ is compiled and run", async () => {
  const r = await runNative(CPP, "cpp");
  assert.deepEqual({ ok: r.ok, output: r.output }, { ok: true, output: "t 1\nt 5\nt 14\n" });
});

test("C is compiled and run, and stdin reaches scanf", async () => {
  const r = await runNative('#include <stdio.h>\nint main() { int n; scanf("%d", &n); printf("n=%d\\n", n * 2); return 0; }', "c", "21\n");
  assert.equal(r.output, "n=42\n");
});

test("a compile error is returned as an error", async () => {
  const r = await runNative("int main() { int x = ; }", "cpp");
  assert.equal(r.ok, false);
  assert.match(r.error, /error/);
});

test("a crash is reported instead of hanging, and an endless loop is stopped", async () => {
  const crash = await runNative("int main() { int *p = 0; *p = 1; return 0; }", "cpp");
  assert.equal(crash.ok, false);
  const loop = await runNative("int main() { while (1) {} }", "cpp");
  assert.equal(loop.timedOut, true);
});

test("tracing gives every iteration, steps into the student's function, and shows vectors", async () => {
  const r = await traceNative(CPP, "cpp");
  assert.equal(r.error, null);
  assert.equal(r.steps.filter(s => s.line === 5).length, 3);           // sq() ran three times, each one stepped into
  assert.equal(r.steps.filter(s => s.line === 10).length, 6);          // the call line, and again when the call returned
  assert.ok(r.steps.some(s => s.line === 5 && s.memory.x === "2"));    // inside sq
  const last = r.steps.at(-1);
  assert.equal(last.memory.v, "[1, 2]");
  assert.equal(last.printed, "t 1\nt 5\nt 14\n");
});

test("a variable is not shown before it is declared", async () => {
  const r = await traceNative("int main() {\n  int a = 1;\n  int b = 2;\n  return a + b;\n}", "cpp");
  const first = r.steps[0];
  assert.deepEqual(Object.keys(first.memory), ["a"]);
});

test("tracing reports a compile error without steps", async () => {
  const r = await traceNative("int main() { int x = ; }", "cpp");
  assert.equal(r.steps.length, 0);
  assert.match(r.error, /error/);
});
