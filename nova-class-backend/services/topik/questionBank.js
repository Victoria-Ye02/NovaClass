// A bank of the Smart Drill questions the model has already written, kept in MySQL so that the same number of the exam does not
// have to wait for the model again. A question is stored under (section, question number, difficulty, explanation language);
// asking for a number serves the least-used stored question at random. The table is created on first use.
const crypto = require("crypto");

const TABLE = `CREATE TABLE IF NOT EXISTS topik_question_bank (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain VARCHAR(12) NOT NULL,
  number INT NOT NULL,
  difficulty VARCHAR(10) NOT NULL DEFAULT '',
  language VARCHAR(10) NOT NULL,
  fingerprint CHAR(40) NOT NULL,
  question_json MEDIUMTEXT NOT NULL,
  times_served INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_question (domain, number, difficulty, language, fingerprint),
  INDEX idx_lookup (domain, number, difficulty, language, times_served)
)`;

const TARGET_PER_NUMBER = 3;     // how many different questions the bank tries to hold for one number (it is topped up in the background)
const MAX_PER_NUMBER = 6;        // it never stores more than this for one number

let ready = null;
function ensureTable(pool) {
  if (!ready) ready = pool.query(TABLE).catch(err => { ready = null; throw err; });
  return ready;
}

const fingerprint = q => crypto.createHash("sha1").update(`${q.question}\n${q.passage || ""}\n${(q.options || []).join("|")}`).digest("hex");

// Only a complete question is worth keeping.
const isStorable = q => q && Number.isInteger(q.number) && q.number > 0
  && String(q.question || "").trim() && Array.isArray(q.options) && q.options.length === 4
  && /^[A-D]$/.test(String(q.answer || "").trim().toUpperCase()[0] || "");

// -> { picked: Map(number -> question), counts: Map(number -> how many are stored) }; every picked question counts as served.
async function pick(pool, { domain, numbers, difficulty = "", language }) {
  await ensureTable(pool);
  const [rows] = await pool.query(
    "SELECT id, number, question_json FROM topik_question_bank WHERE domain = ? AND difficulty = ? AND language = ? AND number IN (?) ORDER BY times_served ASC, RAND()",
    [domain, difficulty || "", language, numbers]);
  const picked = new Map(), counts = new Map(), ids = [];
  for (const row of rows) {
    counts.set(row.number, (counts.get(row.number) || 0) + 1);
    if (picked.has(row.number)) continue;
    try { picked.set(row.number, JSON.parse(row.question_json)); ids.push(row.id); } catch { /* a damaged row is skipped */ }
  }
  if (ids.length) await pool.query("UPDATE topik_question_bank SET times_served = times_served + 1 WHERE id IN (?)", [ids]);
  return { picked, counts };
}

// -> Map(number -> how many questions are stored), without counting them as served.
async function countByNumber(pool, { domain, difficulty = "", language }) {
  await ensureTable(pool);
  const [rows] = await pool.query(
    "SELECT number, COUNT(*) AS n FROM topik_question_bank WHERE domain = ? AND difficulty = ? AND language = ? GROUP BY number",
    [domain, difficulty || "", language]);
  return new Map(rows.map(r => [r.number, r.n]));
}

// Stores new questions (those already there, or beyond the limit for their number, are ignored).
async function save(pool, { domain, difficulty = "", language, questions }) {
  await ensureTable(pool);
  for (const q of questions.filter(isStorable)) {
    const [[row] = []] = await pool.query(
      "SELECT COUNT(*) AS n FROM topik_question_bank WHERE domain = ? AND number = ? AND difficulty = ? AND language = ?",
      [domain, q.number, difficulty || "", language]);
    if ((row?.n || 0) >= MAX_PER_NUMBER) continue;
    await pool.query(
      "INSERT IGNORE INTO topik_question_bank (domain, number, difficulty, language, fingerprint, question_json) VALUES (?, ?, ?, ?, ?, ?)",
      [domain, q.number, difficulty || "", language, fingerprint(q), JSON.stringify(q)]);
  }
}

module.exports = { pick, save, countByNumber, ensureTable, isStorable, TARGET_PER_NUMBER, MAX_PER_NUMBER };
