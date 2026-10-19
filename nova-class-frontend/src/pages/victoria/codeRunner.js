import API from "../../services/api";

// Runs the student's code: Python and JavaScript in the browser (never on the server); Java, C, C++ and
// SQL on the backend. Every cell runs on its own: nothing a cell defines (a variable, a function, a
// table) is visible to the next one. A run that exceeds RUN_TIMEOUT_MS is killed by terminating the
// worker, which also protects the page from infinite loops.

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
const RUN_TIMEOUT_MS = 10000;
const LOAD_TIMEOUT_MS = 90000;

const PYTHON_WORKER = `
importScripts(${JSON.stringify(PYODIDE_URL)});
const ready = loadPyodide().then(py => { self.postMessage({ type: "ready" }); return py; });
self.onmessage = async (e) => {
  const { id, code } = e.data;
  const py = await ready;
  let out = "";
  py.setStdout({ batched: s => { out += s + "\\n"; } });
  py.setStderr({ batched: s => { out += s + "\\n"; } });
  try {
    // a fresh namespace for every run, so one cell never sees another cell's variables
    const ns = py.runPython("{}");
    let result;
    try { result = await py.runPythonAsync(code, { globals: ns }); } finally { ns.destroy(); }
    if (result !== undefined && result !== null) {
      const text = String(result);
      if (text) out += text + "\\n";
    }
    self.postMessage({ type: "done", id, ok: true, out });
  } catch (err) {
    const lines = String(err.message || err).trim().split("\\n");
    const own = lines.findIndex(l => l.includes('File "<exec>"'));
    const kept = own >= 0 ? lines.slice(own) : lines.slice(-2);
    self.postMessage({ type: "done", id, ok: false, out, error: kept.join("\\n") });
  }
};
`;

const JS_WORKER = `
self.postMessage({ type: "ready" });
const show = (v) => {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};
self.onmessage = (e) => {
  const { id, code } = e.data;
  let out = "";
  console.log = (...args) => { out += args.map(show).join(" ") + "\\n"; };
  try {
    const result = (0, eval)(code);
    if (result !== undefined) out += show(result) + "\\n";
    self.postMessage({ type: "done", id, ok: true, out });
  } catch (err) {
    self.postMessage({ type: "done", id, ok: false, out, error: String(err) });
  }
};
`;

const SOURCES = { python: PYTHON_WORKER, javascript: JS_WORKER };
const runtimes = {};
let nextId = 1;

export const RUNNABLE_LANGUAGES = [...Object.keys(SOURCES), "java", "c", "cpp", "sql"];

export const LANGUAGE_NAMES = { python: "Python", javascript: "JavaScript", java: "Java", c: "C", cpp: "C++", sql: "SQL" };

const SIGNATURES = [
  ["sql", /^\s*(select\b[\s\S]*\bfrom\b|insert\s+into\b|create\s+(table|view|index|database)\b|update\s+\w+\s+set\b|delete\s+from\b|drop\s+(table|view)\b|alter\s+table\b)/im],
  ["java", /\b(public\s+(static\s+)?(class|void)|System\.out\.|String\[\]\s+\w+|new\s+\w+<?.*>?\(\)\s*;)/],
  ["cpp", /(#include\s*<(iostream|vector|string)>|std::|cout\s*<<)/],
  ["c", /(#include\s*<std(io|lib)\.h>|\bprintf\s*\()/],
  ["javascript", /(\bconsole\.log\b|\b(let|const|var)\s+\w+\s*=|=>|\bfunction\s*\w*\s*\()/],
  ["python", /(\bdef\s+\w+\s*\(|\bprint\s*\(|\bimport\s+\w+|\belif\b|\bfor\s+\w+\s+in\s+|\bself\b|:\s*$)/m],
];

// Best guess at the language of a snippet or homework text ("" if unsure).
export function detectLanguage(text) {
  const sample = String(text || "");
  if (!sample.trim()) return "";
  for (const [language, pattern] of SIGNATURES) {
    if (pattern.test(sample)) return language;
  }
  const mention = sample.toLowerCase();
  if (/python|파이썬|ပိုက်သွန်/.test(mention)) return "python";
  if (/javascript|자바스크립트/.test(mention)) return "javascript";
  if (/\bjava\b|자바/.test(mention)) return "java";
  return "";
}

export function canRun(language) {
  return RUNNABLE_LANGUAGES.includes(language);
}

function startRuntime(language) {
  const blob = new Blob([SOURCES[language]], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  const runtime = { worker, url, ready: false, readyWaiters: [], pending: new Map() };

  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "ready") {
      runtime.ready = true;
      runtime.readyWaiters.splice(0).forEach(resolve => resolve());
    } else if (msg.type === "done") {
      const entry = runtime.pending.get(msg.id);
      if (entry) {
        clearTimeout(entry.timer);
        runtime.pending.delete(msg.id);
        entry.resolve({ ok: msg.ok, output: msg.out || "", error: msg.error || "" });
      }
    }
  };
  worker.onerror = (e) => {
    runtime.pending.forEach(entry => {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, output: "", error: e.message || "The code runner failed to start." });
    });
    runtime.pending.clear();
    stopRuntime(language);
  };

  runtimes[language] = runtime;
  return runtime;
}

export function stopRuntime(language) {
  const runtime = runtimes[language];
  if (!runtime) return;
  runtime.worker.terminate();
  URL.revokeObjectURL(runtime.url);
  runtime.pending.forEach(entry => clearTimeout(entry.timer));
  delete runtimes[language];
}

export function restartRuntimes() {
  Object.keys(runtimes).forEach(stopRuntime);
}

// Resolves { ok, output, error, timedOut? }. onLoading(true/false) fires while
// the Python engine downloads on the very first run.
export async function runCode(language, code, { onLoading } = {}) {
  if (language === "sql") return runSql(code);
  if (language === "java") return runJava(code);
  if (language === "c" || language === "cpp") return runNative(code, language);
  if (!SOURCES[language]) {
    return { ok: false, output: "", error: `Running ${language} is not supported here.` };
  }
  // JavaScript starts instantly, so each run gets a brand-new worker: nothing from an earlier cell is left
  // (Python reuses its engine, which is slow to load, but runs every cell in a fresh namespace).
  if (language === "javascript") stopRuntime(language);
  let runtime = runtimes[language] || startRuntime(language);

  if (!runtime.ready) {
    onLoading?.(true);
    const loaded = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
      runtime.readyWaiters.push(() => { clearTimeout(timer); resolve(true); });
    });
    onLoading?.(false);
    if (!loaded) {
      stopRuntime(language);
      return { ok: false, output: "", error: "The code runner could not load. Check your internet connection and try again." };
    }
    runtime = runtimes[language];
    if (!runtime) return { ok: false, output: "", error: "The code runner was stopped." };
  }

  return new Promise(resolve => {
    const id = nextId++;
    const timer = setTimeout(() => {
      stopRuntime(language);
      resolve({ ok: false, output: "", error: "", timedOut: true });
    }, RUN_TIMEOUT_MS);
    runtime.pending.set(id, { resolve, timer });
    runtime.worker.postMessage({ id, code });
  });
}

// Java needs a JVM, which the browser does not have, so the backend compiles and runs it
// (time, memory and output are limited there). A program that reads the keyboard gets its
// input from a prompt, one line per Scanner call separated by new lines.
// A program that reads the keyboard gets its input from a prompt, one line per input
// (separate lines with \\n); "" when the code reads nothing.
export function askProgramInput(code) {
  if (!/\bSystem\.in\b|\bScanner\b|BufferedReader|\bcin\b|\bscanf\b|\bgetline\b|\bfgets\b|\bgetchar\b/.test(code)) return "";
  const typed = window.prompt("Input for the program (one line per input, separate lines with \\n):", "") ?? "";
  return typed.replaceAll("\\n", "\n") + "\n";
}

async function runJava(code) {
  const stdin = askProgramInput(code);
  try {
    const { data } = await API.post("/kmate/run-java", { code, stdin });
    return { ok: Boolean(data.ok), output: data.output || "", error: data.error || "", timedOut: Boolean(data.timedOut) };
  } catch (err) {
    return { ok: false, output: "", error: err.response?.data?.error || "Could not reach the Java runner. Is the backend running?" };
  }
}

// C and C++ are compiled and run by the backend (/kmate/run-native), like Java.
async function runNative(code, language) {
  const stdin = askProgramInput(code);
  try {
    const { data } = await API.post("/kmate/run-native", { code, language, stdin });
    return { ok: Boolean(data.ok), output: data.output || "", error: data.error || "", timedOut: Boolean(data.timedOut) };
  } catch (err) {
    return { ok: false, output: "", error: err.response?.data?.error || "Could not reach the C/C++ runner. Is the backend running?" };
  }
}

// SQL is run by the backend on a fresh throw-away SQLite database for every cell.
async function runSql(code) {
  try {
    const { data } = await API.post("/kmate/run-sql", { code });
    return { ok: Boolean(data.ok), output: data.output || "", error: data.error || "", timedOut: Boolean(data.timedOut) };
  } catch (err) {
    return { ok: false, output: "", error: err.response?.data?.error || "Could not reach the SQL runner. Is the backend running?" };
  }
}
