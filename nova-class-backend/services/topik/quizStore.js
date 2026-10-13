// MySQL storage for the K-Mate TOPIK practice quiz: every attempt, every answer (with the grammar / vocabulary
// point it tested) and the per-student weakness summary built from them. The tables are created on first use
// (CREATE TABLE IF NOT EXISTS), so there is no separate migration step; scripts/setup_db.js has the same DDL.
const TABLES = [
  `CREATE TABLE IF NOT EXISTS topik_quiz_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    topic VARCHAR(60) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    kind ENUM('practice','followup') NOT NULL DEFAULT 'practice',
    total INT NOT NULL,
    correct INT NOT NULL,
    score INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id, created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS topik_quiz_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    attempt_id INT NOT NULL,
    user_id INT NOT NULL,
    question TEXT NOT NULL,
    options TEXT,
    your_answer VARCHAR(4),
    correct_answer VARCHAR(4),
    is_correct TINYINT(1) NOT NULL,
    weakness VARCHAR(120),
    explanation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_weakness (user_id, weakness),
    INDEX idx_attempt (attempt_id)
  )`,
];

let ready = null;
function ensureTables(pool) {
  if (!ready) ready = TABLES.reduce((chain, sql) => chain.then(() => pool.query(sql)), Promise.resolve()).catch(err => { ready = null; throw err; });
  return ready;
}

const cleanWeakness = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);

// results: [{ question, options, yourAnswer, correctAnswer, isCorrect, weakness, explanation }]
async function saveAttempt(pool, { userId, topic, language, kind = "practice", results }) {
  await ensureTables(pool);
  const correct = results.filter(r => r.isCorrect).length;
  const score = results.length ? Math.round((correct / results.length) * 100) : 0;
  const [attempt] = await pool.query(
    "INSERT INTO topik_quiz_attempts (user_id, topic, language, kind, total, correct, score) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [userId, String(topic || "mixed").slice(0, 60), String(language || "en").slice(0, 10), kind === "followup" ? "followup" : "practice", results.length, correct, score]
  );
  const attemptId = attempt.insertId;
  for (const r of results) {
    await pool.query(
      "INSERT INTO topik_quiz_answers (attempt_id, user_id, question, options, your_answer, correct_answer, is_correct, weakness, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [attemptId, userId, String(r.question || ""), JSON.stringify(r.options || []), r.yourAnswer || "", r.correctAnswer || "", r.isCorrect ? 1 : 0, cleanWeakness(r.weakness) || null, String(r.explanation || "")]
    );
  }
  return { attemptId, correct, score };
}

// The points a student gets wrong most, with how often they are asked and how well they are answered.
async function weaknessSummary(pool, userId, limit = 8) {
  await ensureTables(pool);
  const [rows] = await pool.query(
    `SELECT weakness, COUNT(*) AS asked, SUM(is_correct = 0) AS wrong, MAX(created_at) AS lastSeen
       FROM topik_quiz_answers
      WHERE user_id = ? AND weakness IS NOT NULL AND weakness <> ''
      GROUP BY weakness
     HAVING wrong > 0
      ORDER BY wrong DESC, lastSeen DESC
      LIMIT ?`,
    [userId, limit]
  );
  const [totals] = await pool.query(
    "SELECT COUNT(*) AS attempts, COALESCE(ROUND(AVG(score)), 0) AS averageScore FROM topik_quiz_attempts WHERE user_id = ?",
    [userId]
  );
  return {
    attempts: Number(totals[0]?.attempts || 0),
    averageScore: Number(totals[0]?.averageScore || 0),
    weaknesses: rows.map(r => ({
      weakness: r.weakness,
      asked: Number(r.asked),
      wrong: Number(r.wrong),
      accuracy: Math.round(((Number(r.asked) - Number(r.wrong)) / Number(r.asked)) * 100),
      lastSeen: r.lastSeen,
    })),
  };
}

module.exports = { ensureTables, saveAttempt, weaknessSummary, cleanWeakness, TABLES };
