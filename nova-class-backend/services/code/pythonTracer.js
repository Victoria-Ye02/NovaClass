const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// Really runs the student's Python and records every executed line with the variables and the
// printed text after it, so the Visualizer shows what the code does instead of an AI's guess
// (which dropped loop iterations). Same limits and caveats as javaRunner: bounded time and output,
// throw-away folder, not a real sandbox.
const RUN_MS = 5000;
const MAX_CODE = 8000;

const TRACER = String.raw`
import sys, io, json

path = sys.argv[1]
source = open(path, encoding="utf-8").read()
MAX_EVENTS = 400
events = []
out = io.StringIO()
SIMPLE = (int, float, str, bool, type(None))

def show(value):
    if isinstance(value, SIMPLE):
        text = repr(value)
    elif isinstance(value, (list, tuple, set, frozenset, dict)):
        text = repr(value)
    else:
        return None
    return text if len(text) <= 60 else text[:57] + "..."

def snapshot(frame):
    names = frame.f_locals
    mem = {}
    for k, v in names.items():
        if k.startswith("__"):
            continue
        s = show(v)
        if s is not None:
            mem[k] = s
    return mem

def depth_of(frame):
    n = 0
    while frame is not None:
        if frame.f_code.co_filename == "<student>":
            n += 1
        frame = frame.f_back
    return n

def tracer(frame, event, arg):
    if frame.f_code.co_filename != "<student>":
        return None
    if event == "line" and len(events) < MAX_EVENTS:
        events.append({"line": frame.f_lineno, "memory": snapshot(frame), "printed": out.getvalue(), "depth": depth_of(frame)})
    return tracer

error = None
real_stdout = sys.stdout
sys.stdout = out
try:
    code = compile(source, "<student>", "exec")
    sys.settrace(tracer)
    try:
        exec(code, {"__name__": "__main__"})
    finally:
        sys.settrace(None)
except SystemExit:
    pass
except BaseException as e:
    error = type(e).__name__ + ": " + str(e)
finally:
    sys.stdout = real_stdout

# An event records the state BEFORE its line runs. The state after a line is the next event in the same
# call frame (so a step shows its own function's variables); what has been printed is read from the next
# event at the same depth or shallower, i.e. once any call made by the line has finished.
steps = []
for i, ev in enumerate(events):
    nxt = None
    for later in events[i + 1:]:
        if later["depth"] <= ev["depth"]:
            nxt = later
            break
    same = nxt is not None and nxt["depth"] == ev["depth"]
    steps.append({
        "line": ev["line"],
        "memory": nxt["memory"] if same else ev["memory"],
        "printed": nxt["printed"] if nxt else out.getvalue(),
    })
print(json.dumps({"steps": steps, "error": error, "truncated": len(events) >= MAX_EVENTS}))
`;

function runPython(args, timeoutMs) {
  return new Promise(resolve => {
    let out = "";
    let err = "";
    let timedOut = false;
    const child = spawn("python3", ["-I", ...args], { env: { PATH: process.env.PATH, LANG: "en_US.UTF-8" }, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", d => { if (out.length < 400000) out += d; });
    child.stderr.on("data", d => { if (err.length < 4000) err += d; });
    child.on("error", e => { clearTimeout(timer); resolve({ out, err: e.message, timedOut }); });
    child.on("close", () => { clearTimeout(timer); resolve({ out, err, timedOut }); });
  });
}

// → { steps: [{ line, memory, printed }], error, truncated }  (or throws when the tracer itself fails)
async function tracePython(code) {
  const source = String(code || "");
  if (!source.trim() || source.length > MAX_CODE) throw new Error("No code to trace.");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nova-py-"));
  try {
    await fs.writeFile(path.join(dir, "student.py"), source);
    await fs.writeFile(path.join(dir, "tracer.py"), TRACER);
    const ran = await runPython([path.join(dir, "tracer.py"), path.join(dir, "student.py")], RUN_MS);
    if (ran.timedOut) return { steps: [], error: "The code ran too long (is there an endless loop?)", truncated: false };
    const parsed = JSON.parse(ran.out.trim().split("\n").pop());
    return parsed;
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { tracePython };
