const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// C and C++ for the Homework Coach: compile with the system compiler (clang via gcc / g++) and
// either run the program or step through it under lldb. Same limits and caveats as javaRunner
// (bounded time, memory-ish and output, throw-away folder, not a real sandbox).
const COMPILE_MS = 20000;
const RUN_MS = 5000;
const TRACE_MS = 30000;
const MAX_OUTPUT = 20000;
const MAX_CODE = 8000;
const MAX_STEPS = 300;

// Makes stdout unbuffered, so the text printed so far can be read at every step.
const UNBUFFER = '#include <stdio.h>\n__attribute__((constructor)) static void nova_unbuffer(void) { setvbuf(stdout, NULL, _IONBF, 0); }\n';

const TRACER = String.raw`
import lldb, json, os

dbg = lldb.debugger
src = os.environ["NOVA_SRC"]
out_path = os.environ["NOVA_OUT"]
MAX_STEPS = int(os.environ["NOVA_MAX_STEPS"])
target = dbg.GetSelectedTarget()
target.BreakpointCreateByName("main")
err = lldb.SBError()
info = lldb.SBLaunchInfo([])
info.AddOpenFileAction(0, os.environ["NOVA_IN"], True, False)
info.AddOpenFileAction(1, out_path, False, True)
info.AddOpenFileAction(2, out_path, False, True)
process = target.Launch(info, err)
result = {"events": [], "error": None}

def printed():
    try:
        return open(out_path, encoding="utf-8", errors="replace").read()
    except Exception:
        return ""

def short(text):
    return text if len(text) <= 60 else text[:57] + "..."

def fmt(v, depth=0):
    t = v.GetType()
    n = v.GetNumChildren()
    summary = v.GetSummary()
    name = t.GetName() or ""
    is_list = t.IsArrayType() or any(w in name for w in ("vector", "array", "deque", "list", "set"))
    if summary and not is_list:
        return summary
    if n > 0 and depth < 2 and not t.IsPointerType():
        kids = [v.GetChildAtIndex(i) for i in range(min(n, 8))]
        if is_list:
            body = ", ".join(fmt(k, depth + 1) for k in kids)
            return "[" + body + (", ..." if n > 8 else "") + "]"
        body = ", ".join((k.GetName() or "?") + ": " + fmt(k, depth + 1) for k in kids)
        return "{" + body + "}"
    val = v.GetValue()
    return val if val is not None else (summary or "?")

visible = {}
def snapshot(frame, line):
    cfa = frame.GetCFA()
    seen = visible.setdefault(cfa, set())
    mem = {}
    for v in frame.GetVariables(True, True, False, True):
        name = v.GetName()
        decl = v.GetDeclaration()
        decl_line = decl.GetLine() if decl.IsValid() else 0
        # a variable exists once execution has passed its declaration line (before that it is garbage)
        if decl_line and decl_line < line:
            seen.add(name)
        if decl_line == 0:
            seen.add(name)
        if name in seen:
            mem[name] = short(fmt(v))
    return mem

if err.Success() and process.IsValid():
    thread = process.GetSelectedThread()
    for _ in range(MAX_STEPS):
        if process.GetState() != lldb.eStateStopped:
            break
        thread = process.GetSelectedThread()
        frame = thread.GetSelectedFrame()
        le = frame.GetLineEntry()
        if not le.IsValid() or os.path.basename(le.GetFileSpec().GetFilename() or "") != os.path.basename(src):
            # outside the student's file: leave it; once main has returned there is nothing left to show
            if thread.GetNumFrames() <= 2:
                break
            thread.StepOut()
            continue
        line = le.GetLine()
        result["events"].append({"line": line, "memory": snapshot(frame, line), "printed": printed(), "depth": thread.GetNumFrames()})
        thread.StepInto()
    if process.GetState() == lldb.eStateStopped:
        stop = process.GetSelectedThread().GetStopReason()
        if stop in (lldb.eStopReasonSignal, lldb.eStopReasonException):
            result["error"] = process.GetSelectedThread().GetStopDescription(200)
        process.Continue()
    elif process.GetState() == lldb.eStateExited and process.GetExitStatus() != 0:
        result["error"] = "exit status " + str(process.GetExitStatus())
else:
    result["error"] = "could not start the program"
result["final"] = printed()
open(os.environ["NOVA_RESULT"], "w").write(json.dumps(result))
`;

function runProcess(command, args, { cwd, timeoutMs, stdin = "", env = {} }) {
  return new Promise(resolve => {
    let out = "";
    let err = "";
    let timedOut = false;
    let child;
    try {
      child = spawn(command, args, { cwd, env: { PATH: process.env.PATH, LANG: "en_US.UTF-8", ...env }, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: -1, out, err: e.message, timedOut });
      return;
    }
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    const cap = (cur, chunk) => (cur.length < MAX_OUTPUT ? cur + chunk.toString() : cur);
    child.stdout.on("data", d => { out = cap(out, d); });
    child.stderr.on("data", d => { err = cap(err, d); });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
    child.on("error", e => { clearTimeout(timer); resolve({ code: -1, out, err: e.code === "ENOENT" ? `${command} is not installed on the server.` : e.message, timedOut }); });
    child.on("close", code => { clearTimeout(timer); resolve({ code, out, err, timedOut }); });
  });
}

// Writes the source and compiles it with debug info. → { dir, exe, src } or { error }
async function build(code, language) {
  const source = String(code || "");
  if (!source.trim()) return { error: "No code to run." };
  if (source.length > MAX_CODE) return { error: "The code is too long to run." };
  const isCpp = language === "cpp";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nova-native-"));
  const srcName = isCpp ? "student.cpp" : "student.c";
  await fs.writeFile(path.join(dir, srcName), source);
  await fs.writeFile(path.join(dir, "unbuffer.c"), UNBUFFER);
  const args = isCpp
    ? ["-g", "-O0", "-std=c++17", srcName, "unbuffer.c", "-o", "student"]
    : ["-g", "-O0", srcName, "unbuffer.c", "-o", "student"];
  const compiled = await runProcess(isCpp ? "g++" : "gcc", args, { cwd: dir, timeoutMs: COMPILE_MS });
  if (compiled.timedOut) return { dir, error: "", timedOut: true };
  if (compiled.code !== 0) return { dir, error: (compiled.err || compiled.out).replaceAll(dir + path.sep, "").trim() };
  return { dir, exe: path.join(dir, "student"), src: path.join(dir, srcName) };
}

async function runNative(code, language, stdin = "") {
  const built = await build(code, language);
  try {
    if (built.timedOut) return { ok: false, output: "", error: "", timedOut: true };
    if (built.error !== undefined && !built.exe) return { ok: false, output: "", error: built.error };
    const ran = await runProcess(built.exe, [], { cwd: built.dir, timeoutMs: RUN_MS, stdin: String(stdin).slice(0, 2000) });
    if (ran.timedOut) return { ok: false, output: ran.out, error: "", timedOut: true };
    const crash = ran.code === null || ran.code > 128 ? `The program crashed (exit ${ran.code}).` : "";
    return { ok: ran.code === 0, output: ran.out, error: ran.code === 0 ? "" : (ran.err.trim() || crash || `exit status ${ran.code}`) };
  } finally {
    if (built.dir) fs.rm(built.dir, { recursive: true, force: true }).catch(() => {});
  }
}

// → { steps: [{ line, memory, printed }], error, truncated }
async function traceNative(code, language, stdin = "") {
  const built = await build(code, language);
  try {
    if (built.timedOut) return { steps: [], error: "The compiler took too long.", truncated: false };
    if (!built.exe) return { steps: [], error: built.error, truncated: false };
    const dir = built.dir;
    await fs.writeFile(path.join(dir, "trace.py"), TRACER);
    await fs.writeFile(path.join(dir, "in.txt"), String(stdin).slice(0, 2000));
    await fs.writeFile(path.join(dir, "out.txt"), "");
    const env = {
      NOVA_SRC: built.src, NOVA_OUT: path.join(dir, "out.txt"), NOVA_IN: path.join(dir, "in.txt"),
      NOVA_RESULT: path.join(dir, "result.json"), NOVA_MAX_STEPS: String(MAX_STEPS),
    };
    const ran = await runProcess("lldb", ["-b", "-o", `script exec(open(${JSON.stringify(path.join(dir, "trace.py"))}).read())`, built.exe], { cwd: dir, timeoutMs: TRACE_MS, env });
    let result;
    try {
      result = JSON.parse(await fs.readFile(path.join(dir, "result.json"), "utf8"));
    } catch {
      return { steps: [], error: ran.timedOut ? "The code ran too long (is there an endless loop?)" : "The debugger could not trace this program.", truncated: false };
    }
    const lines = String(code).split("\n");
    const events = result.events.filter(e => e.line <= lines.length);
    const steps = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (/^\s*[}]\s*;?\s*$/.test(lines[ev.line - 1] || "")) continue;
      const nxt = events.slice(i + 1).find(later => later.depth <= ev.depth);
      const same = nxt && nxt.depth === ev.depth;
      steps.push({ line: ev.line, memory: same ? nxt.memory : ev.memory, printed: nxt ? nxt.printed : result.final });
    }
    if (steps.length) steps[steps.length - 1].printed = result.final;
    return { steps, error: result.error, truncated: result.events.length >= MAX_STEPS };
  } finally {
    if (built.dir) fs.rm(built.dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { runNative, traceNative };
