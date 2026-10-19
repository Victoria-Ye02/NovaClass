const test = require("node:test");
const assert = require("node:assert/strict");
const { traceJava } = require("../services/code/javaTracer");

const LOOP = `public class Main {
    public static void main(String[] args) {
        int total = 0;
        for (int i = 1; i <= 3; i++) {
            total += i;
            System.out.println("t " + total);
        }
        int[] arr = {1, 2};
        System.out.println(arr.length);
    }
}`;

test("a for loop gives every iteration, with variables, arrays and printed text", async () => {
  const r = await traceJava(LOOP);
  assert.equal(r.error, null);
  assert.equal(r.steps.filter(s => s.line === 5).length, 3);
  const last = r.steps.at(-1);
  assert.equal(last.memory.total, "6");
  assert.equal(last.memory.arr, "[1, 2]");
  assert.equal(last.printed, "t 1\nt 3\nt 6\n2\n");
});

test("steps into the student's own methods and reads Scanner input", async () => {
  const code = `import java.util.*;
public class Main {
    static int sq(int x) {
        return x * x;
    }
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.nextLine();
        System.out.println(name + sq(3));
    }
}`;
  const r = await traceJava(code, "Nova\n");
  assert.ok(r.steps.some(s => s.line === 4 && s.memory.x === "3"));   // inside sq
  assert.equal(r.steps.at(-1).printed, "Nova9\n");
});

test("a compile error is reported without steps", async () => {
  const r = await traceJava("public class Main { void f() { int x = ; } }");
  assert.equal(r.steps.length, 0);
  assert.match(r.error, /error/);
});
