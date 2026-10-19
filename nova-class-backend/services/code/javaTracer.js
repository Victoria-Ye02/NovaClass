const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { mainClassName } = require("./javaRunner");

// Traces Java by really running it under jdb (the JDK's own debugger), one `next` at a time: the line
// about to run, the local variables, and what System.out has printed. A tiny launcher class sends
// System.out to a file, so the printed text never gets mixed up with the debugger's own output.
// Same limits and caveats as javaRunner (bounded, throw-away folder, not a real sandbox).
const TOTAL_MS = 25000;
const STEP_MS = 4000;
const MAX_STEPS = 300;
const MAX_CODE = 8000;

const LAUNCHER = `
import java.io.*;
import java.lang.reflect.Method;
public class NovaRunner {
    public static void main(String[] a) throws Exception {
        System.setOut(new PrintStream(new FileOutputStream(a[1]), true, "UTF-8"));
        System.setErr(System.out);
        System.setIn(new ByteArrayInputStream(new String(java.nio.file.Files.readAllBytes(new File(a[2]).toPath()), "UTF-8").getBytes("UTF-8")));
        Method m = Class.forName(a[0]).getMethod("main", String[].class);
        try { m.invoke(null, (Object) new String[0]); }
        catch (java.lang.reflect.InvocationTargetException e) { e.getCause().printStackTrace(); }
    }
}
`;

function short(text) {
  return text.length <= 60 ? text : text.slice(0, 57) + "...";
}

async function traceJava(code, stdin = "") {
  const source = String(code || "");
  if (!source.trim() || source.length > MAX_CODE) throw new Error("No code to trace.");
  const lineCount = source.split("\n").length;
  const lines = source.split("\n");
  const className = mainClassName(source);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nova-jtrace-"));
  const outFile = path.join(dir, "out.txt");
  const inFile = path.join(dir, "in.txt");
  let jdb;
  try {
    await fs.writeFile(path.join(dir, `${className}.java`), source);
    await fs.writeFile(path.join(dir, "NovaRunner.java"), LAUNCHER);
    await fs.writeFile(outFile, "");
    await fs.writeFile(inFile, String(stdin).slice(0, 2000));
    const compiled = await new Promise(resolve => {
      const p = spawn("javac", ["-g", "-encoding", "UTF-8", `${className}.java`, "NovaRunner.java"], { cwd: dir, env: { PATH: process.env.PATH } });
      let err = "";
      p.stderr.on("data", d => { err += d; });
      p.stdout.on("data", d => { err += d; });
      const t = setTimeout(() => p.kill("SIGKILL"), 15000);
      p.on("close", code => { clearTimeout(t); resolve({ code, err }); });
      p.on("error", e => { clearTimeout(t); resolve({ code: -1, err: e.message }); });
    });
    if (compiled.code !== 0) return { steps: [], error: compiled.err.replaceAll(dir + path.sep, "").trim(), truncated: false };

    jdb = spawn("jdb", ["-classpath", dir, "NovaRunner", className, outFile, inFile], { cwd: dir, env: { PATH: process.env.PATH } });
    let buf = "";
    let notify = null;
    const onData = d => { buf += d; if (notify) notify(); };
    jdb.stdout.on("data", onData);
    jdb.stderr.on("data", onData);

    const started = Date.now();
    // waits until the buffered output matches `regex`, returns it and clears the buffer
    const waitFor = (regex, ms = STEP_MS) => new Promise((resolve, reject) => {
      const check = () => {
        const m = buf.match(regex);
        if (m) { const text = buf; buf = ""; notify = null; clearTimeout(timer); resolve(text); }
      };
      const timer = setTimeout(() => { notify = null; reject(new Error("jdb timed out" + (process.env.TRACE_DEBUG ? ": " + JSON.stringify(buf) + " waiting for " + regex : ""))); }, Math.min(ms, TOTAL_MS - (Date.now() - started)));
      notify = check;
      check();
    });
    const send = text => jdb.stdin.write(text + "\n");
    const PROMPT_ANY = /(^|\n)(>|[\w-]+\[\d+\]) $/;
    const PROMPT_THREAD = /[\w-]+\[\d+\] $/;

    await waitFor(PROMPT_ANY);
    send("exclude java.*,javax.*,sun.*,jdk.*,com.sun.*");
    await waitFor(PROMPT_ANY);
    send(`stop in ${className}.main`);
    await waitFor(/(It will be set|Set breakpoint)[\s\S]*> $/);
    send("run");
    await waitFor(/Breakpoint hit[\s\S]*line=(\d+)[\s\S]*[\w-]+\[\d+\] $/, 10000);

    async function readLocals() {
      buf = "";
      send("locals");
      const text = await waitFor(PROMPT_THREAD);
      const memory = {};
      const objects = [];
      for (const row of text.split("\n")) {
        const m = row.match(/^([A-Za-z_$][\w$]*) = (.*)$/);
        if (!m || m[1] === "args") continue;
        if (/^instance of /.test(m[2])) objects.push({ name: m[1], isArray: /^instance of [\w.$]+(\[\d*\])+ /.test(m[2]) });
        else memory[m[1]] = short(m[2]);
      }
      for (const { name, isArray } of objects) {
        buf = "";
        send(isArray ? `dump ${name}` : `eval ${name}.toString()`);
        const r = await waitFor(PROMPT_THREAD);
        let value = "(object)";
        if (isArray) {
          const d = r.match(/= \{([\s\S]*)\}\s*\n?[\w-]+\[\d+\] $/);
          if (d) value = `[${d[1].replace(/\s*\n\s*/g, " ").trim().replace(/^,|,$/g, "")}]`;
        } else {
          const v = r.match(/= "([\s\S]*)"\s*\n?[\w-]+\[\d+\] $/);
          if (v) value = v[1];
        }
        // library objects (a Scanner, a reader ...) only add noise
        if (!/^java\.(util\.Scanner|io\.)/.test(value)) memory[name] = short(value);
      }
      return memory;
    }
    const printedNow = async () => (await fs.readFile(outFile, "utf8").catch(() => ""));

    const events = [];
    let error = null;
    let line = 1;
    let depth = 1;
    // the first stop was consumed above; read its line again from the stack
    send("where");
    const where = await waitFor(PROMPT_THREAD);
    line = Number((where.match(/\.java:(\d+)\)/) || [])[1]) || 1;
    const depthOf = text => (text.match(/^\s*\[\d+\] /gm) || []).length || 1;
    depth = depthOf(where);

    for (let n = 0; n < MAX_STEPS; n++) {
      events.push({ line, memory: await readLocals(), printed: await printedNow(), depth });
      buf = "";
      send("step");
      let res;
      try {
        res = await waitFor(/Step completed[\s\S]*line=(\d+)[\s\S]*[\w-]+\[\d+\] $|The application exited|The application has been disconnected|Exception occurred[\s\S]*[\w-]+\[\d+\] $/, STEP_MS);
      } catch {
        error = "The code ran too long (is there an endless loop?)";
        break;
      }
      if (/The application exited|disconnected/.test(res)) break;
      const exc = res.match(/Exception occurred: ([^\n,]+)/);
      if (exc) { error = exc[1]; break; }
      // once main returns, jdb lands in the launcher: that is the end of the student's program
      if (/Step completed:[^\n]*NovaRunner\./.test(res)) break;
      line = Number((res.match(/line=(\d+)/) || [])[1]) || line;
      buf = "";
      send("where");
      depth = depthOf(await waitFor(PROMPT_THREAD));
    }

    const finalPrinted = await printedNow();
    const real = events.filter(ev => ev.line <= lineCount);
    const steps = [];
    for (let i = 0; i < real.length; i++) {
      const ev = real[i];
      // a lone closing brace only ends a block or the method; it is not a step of its own
      if (/^\s*[}]\s*;?\s*$/.test(lines[ev.line - 1] || "")) continue;
      const nxt = real.slice(i + 1).find(later => later.depth <= ev.depth);
      const same = nxt && nxt.depth === ev.depth;
      steps.push({ line: ev.line, memory: same ? nxt.memory : ev.memory, printed: nxt ? nxt.printed : finalPrinted });
    }
    if (steps.length) steps[steps.length - 1].printed = finalPrinted;
    return { steps, error, truncated: events.length >= MAX_STEPS };
  } finally {
    if (jdb) jdb.kill("SIGKILL");
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}


module.exports = { traceJava };
