import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/api", () => ({ default: { post: vi.fn() } }));
import API from "../../services/api";
import { runCode, canRun, askProgramInput, detectLanguage } from "./codeRunner";

describe("codeRunner: languages run by the backend", () => {
  beforeEach(() => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: { ok: true, output: "hi\n", error: "" } });
    vi.stubGlobal("window", { prompt: vi.fn(() => "21") });
  });

  it("Java, C and C++ are runnable", () => {
    expect(["java", "c", "cpp"].every(canRun)).toBe(true);
  });

  it("C++ goes to /kmate/run-native with its language and no prompt when it reads nothing", async () => {
    const r = await runCode("cpp", "int main() { return 0; }");
    expect(API.post).toHaveBeenCalledWith("/kmate/run-native", { code: "int main() { return 0; }", language: "cpp", stdin: "" });
    expect(r).toEqual({ ok: true, output: "hi\n", error: "", timedOut: false });
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it("Java goes to /kmate/run-java", async () => {
    await runCode("java", "class A {}");
    expect(API.post).toHaveBeenCalledWith("/kmate/run-java", expect.objectContaining({ code: "class A {}" }));
  });

  it("a program that reads the keyboard asks for input first, and a failure becomes an error result", async () => {
    expect(askProgramInput("cin >> n;")).toBe("21\n");
    API.post.mockRejectedValue({ response: { data: { error: "boom" } } });
    const r = await runCode("c", "scanf(\"%d\", &n);");
    expect(r).toMatchObject({ ok: false, error: "boom" });
  });

  it("SQL is runnable, goes to /kmate/run-sql with only its own code, and is recognised from the code", async () => {
    expect(canRun("sql")).toBe(true);
    await runCode("sql", "SELECT * FROM t", { context: "CREATE TABLE t(x)" });
    expect(API.post).toHaveBeenCalledWith("/kmate/run-sql", { code: "SELECT * FROM t" });
    expect(detectLanguage("SELECT name, age FROM students WHERE age > 18;")).toBe("sql");
    expect(detectLanguage("CREATE TABLE t (id INT);")).toBe("sql");
    expect(detectLanguage("print('select from')")).toBe("python");
  });
});
