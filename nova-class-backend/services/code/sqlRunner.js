const { spawn } = require("node:child_process");

// SQL for the Homework Coach: runs the student's statements one by one on a throw-away in-memory SQLite
// database (Node's built-in node:sqlite), so a query shows what it really returns and a trace shows the
// real tables after each statement. A child process with a time limit (killed when it takes too long, which
// a thread could not be while SQLite is busy) protects the server from heavy queries; ATTACH / VACUUM are
// refused so nothing can touch a file.
const TIME_MS = 5000;
const MAX_CODE = 8000;
const MAX_ROWS = 50;
const MAX_STATEMENTS = 100;

const WORKER = String.raw`
process.removeAllListeners("warning");
process.emitWarning = () => {};
const { DatabaseSync } = require("node:sqlite");
const workerData = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const db = new DatabaseSync(":memory:");

function plain(row) { return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])); }

function tables() {
  const out = {};
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for (const { name } of names) {
    const total = Number(db.prepare('SELECT COUNT(*) AS c FROM "' + name.replace(/"/g, '""') + '"').get().c);
    const rows = db.prepare('SELECT * FROM "' + name.replace(/"/g, '""') + '" LIMIT 8').all().map(plain);
    out[name] = { total, rows: rows.map(r => Object.values(r)) };
  }
  return out;
}

function exec(sql) {
  const stmt = db.prepare(sql);
  if (stmt.columns().length > 0) {
    const columns = stmt.columns().map(c => c.name);
    const all = stmt.all().map(plain);
    return { kind: "rows", columns, total: all.length, rows: all.slice(0, workerData.maxRows).map(r => columns.map(c => r[c])) };
  }
  const res = stmt.run();
  return { kind: "ok", changes: Number(res.changes) };
}

const results = [];
// the earlier cells of the notebook run first, silently, so their tables exist
for (const s of workerData.before) { try { exec(s.text); } catch (e) { /* an earlier cell's own error is not this cell's */ } }
for (const s of workerData.statements) {
  const rec = { line: s.line, text: s.text };
  try {
    Object.assign(rec, exec(s.text));
  } catch (e) {
    rec.kind = "error";
    rec.error = String(e.message || e);
  }
  if (workerData.wantTables) { try { rec.tables = tables(); } catch (e) { rec.tables = {}; } }
  results.push(rec);
  if (rec.kind === "error") break;
}
process.stdout.write(JSON.stringify(results));
`;

const REFUSED = /^\s*(attach|detach|vacuum)\b/i;

// Splits a script into statements (not fooled by ; inside quotes or comments), keeping each one's first line.
function splitStatements(code) {
  const out = [];
  let cur = "";
  let line = 1;
  let startLine = null;
  let i = 0;
  const push = () => {
    const text = cur.trim();
    if (text) out.push({ text, line: startLine || 1 });
    cur = "";
    startLine = null;
  };
  while (i < code.length) {
    const ch = code[i];
    const two = code.slice(i, i + 2);
    if (two === "--") {
      const end = code.indexOf("\n", i);
      i = end < 0 ? code.length : end;
      continue;
    }
    if (two === "/*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end < 0 ? code.length : end + 2;
      line += (code.slice(i, stop).match(/\n/g) || []).length;
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < code.length && !(code[j] === ch && code[j + 1] !== ch)) j += code[j] === ch ? 2 : 1;
      const piece = code.slice(i, j + 1);
      if (startLine === null) startLine = line;
      cur += piece;
      line += (piece.match(/\n/g) || []).length;
      i = j + 1;
      continue;
    }
    if (ch === ";") { push(); i += 1; continue; }
    if (ch === "\n") line += 1;
    if (startLine === null && !/\s/.test(ch)) startLine = line;
    cur += ch;
    i += 1;
  }
  push();
  return out;
}

function runWorker(statements, before, wantTables) {
  return new Promise(resolve => {
    let out = "";
    let timedOut = false;
    const child = spawn(process.execPath, ["--max-old-space-size=128", "-e", WORKER], { env: { PATH: process.env.PATH }, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, TIME_MS);
    child.stdout.on("data", d => { if (out.length < 2000000) out += d; });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ statements, before, wantTables, maxRows: MAX_ROWS }));
    child.on("error", e => { clearTimeout(timer); resolve({ failed: String(e.message || e), results: [] }); });
    child.on("close", () => {
      clearTimeout(timer);
      if (timedOut) return resolve({ timedOut: true, results: [] });
      try { resolve({ results: JSON.parse(out) }); } catch { resolve({ failed: "The SQL runner failed.", results: [] }); }
    });
  });
}

function prepare(code, beforeCode) {
  const source = String(code || "");
  if (!source.trim()) return { error: "No code to run." };
  if (source.length > MAX_CODE) return { error: "The code is too long to run." };
  const statements = splitStatements(source).slice(0, MAX_STATEMENTS);
  if (statements.length === 0) return { error: "No SQL statement to run." };
  const refused = statements.find(s => REFUSED.test(s.text));
  if (refused) return { error: `${refused.text.split(/\s+/)[0].toUpperCase()} is not allowed here.` };
  const before = splitStatements(String(beforeCode || "").slice(0, MAX_CODE)).filter(s => !REFUSED.test(s.text)).slice(0, MAX_STATEMENTS);
  return { statements, before };
}

function table(columns, rows, total) {
  const cell = v => (v === null ? "NULL" : String(v));
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map(r => cell(r[i]).length)));
  const line = cells => cells.map((c, i) => c.padEnd(widths[i])).join(" | ");
  const out = [line(columns), widths.map(w => "-".repeat(w)).join("-+-"), ...rows.map(r => line(r.map(cell)))];
  if (total > rows.length) out.push(`... (${total - rows.length} more rows)`);
  return out.join("\n");
}

function describe(rec) {
  if (rec.kind === "rows") return rec.total === 0 ? "(0 rows)" : table(rec.columns, rec.rows, rec.total);
  if (rec.kind === "ok") return rec.changes ? `OK (${rec.changes} row${rec.changes === 1 ? "" : "s"} changed)` : "OK";
  return "";
}

// → { ok, output, error, timedOut? }   `beforeCode` = the earlier notebook cells' SQL
async function runSql(code, beforeCode = "") {
  const prep = prepare(code, beforeCode);
  if (prep.error) return { ok: false, output: "", error: prep.error };
  const run = await runWorker(prep.statements, prep.before, false);
  if (run.timedOut) return { ok: false, output: "", error: "", timedOut: true };
  if (run.failed) return { ok: false, output: "", error: run.failed };
  const parts = [];
  let error = "";
  run.results.forEach((rec, i) => {
    if (rec.kind === "error") { error = `Statement ${i + 1}: ${rec.error}`; return; }
    parts.push(describe(rec));
  });
  return { ok: !error, output: parts.length ? parts.join("\n\n") + "\n" : "", error };
}

const short = s => (s.length <= 60 ? s : s.slice(0, 57) + "...");

// → { steps: [{ line, text, memory, printed }], error }: one step per statement, with the real tables after it
async function traceSql(code, beforeCode = "") {
  const prep = prepare(code, beforeCode);
  if (prep.error) return { steps: [], error: prep.error };
  const run = await runWorker(prep.statements, prep.before, true);
  if (run.timedOut) return { steps: [], error: "The code ran too long (is there an endless loop?)" };
  if (run.failed) return { steps: [], error: run.failed };
  let printed = "";
  let error = null;
  const steps = run.results.map((rec, i) => {
    if (rec.kind === "error") error = `Statement ${i + 1}: ${rec.error}`;
    else if (rec.kind === "rows") printed += describe(rec) + "\n";
    const memory = {};
    for (const [name, t] of Object.entries(rec.tables || {})) {
      memory[name] = short("[" + t.rows.map(r => "(" + r.map(v => (typeof v === "string" ? `'${v}'` : v === null ? "NULL" : v)).join(", ") + ")").join(", ") + (t.total > t.rows.length ? `, +${t.total - t.rows.length} more` : "") + "]");
    }
    return { line: rec.line, text: rec.text, memory, printed, error: rec.kind === "error" ? rec.error : "" };
  });
  return { steps, error, truncated: false };
}

module.exports = { runSql, traceSql, splitStatements };
