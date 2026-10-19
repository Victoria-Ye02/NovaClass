const test = require("node:test");
const assert = require("node:assert/strict");
const { runJava, mainClassName } = require("../services/code/javaRunner");

test("picks the public class, else the class with main, else Main", () => {
  assert.equal(mainClassName("public class Hello { }"), "Hello");
  assert.equal(mainClassName("class Foo { public static void main(String[] a) {} }"), "Foo");
  assert.equal(mainClassName("int x;"), "Main");
});

test("compiles and runs, passing stdin to Scanner", async () => {
  const code = 'import java.util.Scanner; public class Greet { public static void main(String[] a) { Scanner s = new Scanner(System.in); System.out.println("Hi " + s.nextLine() + "!"); } }';
  const r = await runJava(code, "Nova\n");
  assert.deepEqual({ ok: r.ok, output: r.output.trim() }, { ok: true, output: "Hi Nova!" });
});

test("a compile error comes back as an error, not a crash", async () => {
  const r = await runJava("public class Bad { void f() { int x = ; } }");
  assert.equal(r.ok, false);
  assert.match(r.error, /error/);
});

test("an infinite loop is stopped by the time limit", async () => {
  const r = await runJava("public class Loop { public static void main(String[] a) { while (true) {} } }");
  assert.equal(r.timedOut, true);
});
