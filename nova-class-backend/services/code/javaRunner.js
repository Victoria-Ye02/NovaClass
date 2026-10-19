const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// Compiles and runs one Java source file for the Homework Coach notebook.
// Not a real sandbox: it only bounds time, memory and output, in a throw-away folder with a
// stripped environment. Student code still runs as the server user, so keep this behind login
// and do not expose it on an untrusted deployment without a container around it.
const COMPILE_MS = 15000;
const RUN_MS = 5000;
const MAX_OUTPUT = 20000;
const MAX_CODE = 20000;

// `public class Name` decides the file name; otherwise the class that has main.
function mainClassName(code) {
  const pub = code.match(/public\s+(?:final\s+|abstract\s+)*(?:class|record|enum|interface)\s+([A-Za-z_]\w*)/);
  if (pub) return pub[1];
  const withMain = code.match(/class\s+([A-Za-z_]\w*)[\s\S]*?static\s+void\s+main\s*\(/);
  return withMain ? withMain[1] : "Main";
}

function runProcess(command, args, { cwd, timeoutMs, stdin = "" }) {
  return new Promise(resolve => {
    let out = "";
    let err = "";
    let timedOut = false;
    let child;
    try {
      child = spawn(command, args, { cwd, env: { PATH: process.env.PATH, LANG: "en_US.UTF-8" }, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: -1, out, err: e.message, timedOut });
      return;
    }
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    const cap = (current, chunk) => (current.length < MAX_OUTPUT ? current + chunk.toString() : current);
    child.stdout.on("data", d => { out = cap(out, d); });
    child.stderr.on("data", d => { err = cap(err, d); });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
    child.on("error", e => { clearTimeout(timer); resolve({ code: -1, out, err: e.code === "ENOENT" ? "Java is not installed on the server." : e.message, timedOut }); });
    child.on("close", code => { clearTimeout(timer); resolve({ code, out, err, timedOut }); });
  });
}

async function runJava(code, stdin = "") {
  const source = String(code || "");
  if (!source.trim()) return { ok: false, output: "", error: "No code to run." };
  if (source.length > MAX_CODE) return { ok: false, output: "", error: "The code is too long to run." };

  const className = mainClassName(source);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nova-java-"));
  try {
    await fs.writeFile(path.join(dir, `${className}.java`), source);
    const compiled = await runProcess("javac", ["-encoding", "UTF-8", `${className}.java`], { cwd: dir, timeoutMs: COMPILE_MS });
    if (compiled.timedOut) return { ok: false, output: "", error: "", timedOut: true };
    if (compiled.code !== 0) return { ok: false, output: "", error: (compiled.err || compiled.out).replaceAll(dir + path.sep, "").trim() };

    const ran = await runProcess("java", ["-Xmx128m", "-Xss512k", "-Dfile.encoding=UTF-8", "-cp", dir, className], { cwd: dir, timeoutMs: RUN_MS, stdin: String(stdin).slice(0, 2000) });
    if (ran.timedOut) return { ok: false, output: ran.out, error: "", timedOut: true };
    return { ok: ran.code === 0, output: ran.out, error: ran.code === 0 ? "" : ran.err.replaceAll(dir + path.sep, "").trim() };
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { runJava, mainClassName };
