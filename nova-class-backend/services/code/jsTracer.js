const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// Traces JavaScript by really running it under Node's inspector and stepping line by line:
// the line that is about to run, the variables, and what console.log has printed.
// Same limits and caveats as javaRunner (bounded, throw-away folder, not a real sandbox).
const TOTAL_MS = 8000;
const MAX_STEPS = 600;
const MAX_CODE = 8000;
const HIDDEN = new Set(["exports", "require", "module", "__filename", "__dirname"]);

// console.log of an array / object arrives as a preview, not a value
function formatArg(a) {
  if (a.value !== undefined) return String(a.value);
  const prev = a.preview;
  if (prev && Array.isArray(prev.properties)) {
    const show = prev.properties.map(p => (prev.subtype === "array" ? p.value : `${p.name}: ${p.value}`)).join(", ");
    return prev.subtype === "array" ? `[ ${show} ]` : `{ ${show} }`;
  }
  return a.description || a.unserializableValue || "";
}

function short(text) {
  return text.length <= 60 ? text : text.slice(0, 57) + "...";
}

async function tracejs(code) {
  const source = String(code || "");
  if (!source.trim() || source.length > MAX_CODE) throw new Error("No code to trace.");
  const lineCount = source.split("\n").length;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nova-js-"));
  const file = path.join(dir, "student.js");
  // a final `debugger` pauses after the last real line, so the state AFTER it can be read
  await fs.writeFile(file, `${source}\n;debugger;\n`);

  let child;
  try {
    child = spawn(process.execPath, ["--inspect-brk=0", file], { env: { PATH: process.env.PATH }, stdio: ["ignore", "ignore", "pipe"] });
    const url = await new Promise((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => reject(new Error("debugger did not start")), 4000);
      child.stderr.on("data", d => {
        buf += d;
        const m = buf.match(/ws:\/\/[^\s]+/);
        if (m) { clearTimeout(timer); resolve(m[0]); }
      });
      child.on("close", () => reject(new Error("node exited")));
    });

    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("ws failed")); });

    let nextId = 1;
    const pending = new Map();
    const send = (method, params = {}) => new Promise(resolve => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

    const events = [];
    let printed = "";
    let studentScript = null;
    let error = null;
    let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const hardStop = setTimeout(() => { error = error || "The code ran too long (is there an endless loop?)"; finish(); }, TOTAL_MS);

    async function readValue(remote) {
      if (remote.type === "function") return null;
      if (remote.type === "object" && remote.subtype !== "null" && remote.objectId) {
        const r = await send("Runtime.callFunctionOn", { objectId: remote.objectId, returnByValue: true, functionDeclaration: "function(){ try { return JSON.stringify(this); } catch (e) { return String(this); } }" });
        const v = r.result?.result?.value;
        return typeof v === "string" ? short(v) : short(remote.description || "");
      }
      if (remote.type === "string") return short(JSON.stringify(remote.value));
      if (remote.type === "undefined") return "undefined";
      return short(String(remote.value ?? remote.description ?? remote.unserializableValue));
    }

    async function snapshot(frame) {
      const memory = {};
      for (const scope of frame.scopeChain) {
        if (!["local", "block", "closure"].includes(scope.type)) continue;
        const props = await send("Runtime.getProperties", { objectId: scope.object.objectId, ownProperties: true });
        for (const p of props.result?.result || []) {
          if (HIDDEN.has(p.name) || !p.value || p.name in memory) continue;
          const v = await readValue(p.value);
          if (v !== null) memory[p.name] = v;
        }
      }
      return memory;
    }

    ws.onmessage = async msg => {
      const data = JSON.parse(msg.data);
      if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); return; }
      if (data.method === "Debugger.scriptParsed") {
        if (String(data.params.url).endsWith("student.js")) studentScript = data.params.scriptId;
      } else if (data.method === "Runtime.consoleAPICalled") {
        const text = (data.params.args || []).map(a => formatArg(a)).join(" ");
        printed += text + "\n";
      } else if (data.method === "Runtime.exceptionThrown") {
        error = data.params.exceptionDetails?.exception?.description?.split("\n")[0] || "Error";
      } else if (data.method === "Debugger.paused") {
        const frame = data.params.callFrames[0];
        const inStudent = frame.location.scriptId === studentScript;
        if (!inStudent) { send("Debugger.stepOut"); return; }
        const line = frame.location.lineNumber + 1;
        events.push({ line, memory: await snapshot(frame), printed, depth: data.params.callFrames.filter(f => f.location.scriptId === studentScript).length });
        if (line > lineCount || events.length >= MAX_STEPS) { finish(); return; }
        send("Debugger.stepInto");
      }
    };
    ws.onclose = () => finish();

    await send("Runtime.enable");
    await send("Debugger.enable");
    await send("Debugger.setAsyncCallStackDepth", { maxDepth: 0 });
    await send("Runtime.runIfWaitingForDebugger");
    await done;
    clearTimeout(hardStop);
    try { ws.close(); } catch { /* already closed */ }

    // events[k] is the state BEFORE its line runs; the state after it is the next event in the same call
    // frame, and the printed text is read once any call made by the line has finished
    const steps = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.line > lineCount) break;
      const nxt = events.slice(i + 1).find(later => later.depth <= ev.depth);
      const same = nxt && nxt.depth === ev.depth;
      steps.push({ line: ev.line, memory: same ? nxt.memory : ev.memory, printed: nxt ? nxt.printed : printed });
    }
    // `for (...)` pauses more than once on its header line (init, test, update): keep one step per visit
    const merged = steps.filter((st, i) => !(i + 1 < steps.length && steps[i + 1].line === st.line));
    return { steps: merged, error, truncated: events.length >= MAX_STEPS };
  } finally {
    if (child) child.kill("SIGKILL");
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { traceJs: tracejs };
