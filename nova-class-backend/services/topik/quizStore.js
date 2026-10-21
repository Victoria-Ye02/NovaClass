// MySQL storage for K-Mate TOPIK: the practice quiz (every attempt and answer, with the grammar / vocabulary point
// it tested), the exam-mode results synced from Thine's exam service (see examSync.js), and ONE weakness profile per
// student built from both. The tables are created on first use (CREATE TABLE IF NOT EXISTS), so there is no separate
// migration step; scripts/setup_db.js has the same DDL.
const TABLES = [
  `CREATE TABLE IF NOT EXISTS topik_quiz_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    topic VARCHAR(60) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    kind ENUM('practice','followup') NOT NULL DEFAULT 'practice',
    question_type VARCHAR(40) NULL,
    difficulty VARCHAR(10) NULL,
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
    question_type VARCHAR(40) NULL,
    difficulty VARCHAR(10) NULL,
    domain VARCHAR(12) NULL,
    question_number INT NULL,
    explanation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_weakness (user_id, weakness),
    INDEX idx_attempt (attempt_id)
  )`,
  // Exam mode (Reading / Listening / Writing): one row per graded section, one per question
  `CREATE TABLE IF NOT EXISTS topik_exam_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    exam_paper_id VARCHAR(64) NOT NULL,
    skill_area VARCHAR(20) NOT NULL,
    total_questions INT NOT NULL DEFAULT 0,
    correct_count INT NOT NULL DEFAULT 0,
    total_score DOUBLE NOT NULL DEFAULT 0,
    max_score DOUBLE NOT NULL DEFAULT 0,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_exam_section (user_id, exam_paper_id, skill_area)
  )`,
  `CREATE TABLE IF NOT EXISTS topik_exam_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    skill_area VARCHAR(20) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    question_type VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20),
    user_answer TEXT,
    correct_answer TEXT,
    is_correct TINYINT(1) NOT NULL,
    points_earned DOUBLE NOT NULL DEFAULT 0,
    points_possible DOUBLE NOT NULL DEFAULT 0,
    answered_at DATETIME NULL,
    INDEX idx_user_type (user_id, skill_area, question_type),
    INDEX idx_session (session_id)
  )`,
  // The student's weak points from quiz practice and from exams, side by side
  `CREATE TABLE IF NOT EXISTS topik_weakness_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    source ENUM('quiz','exam') NOT NULL,
    skill_area VARCHAR(20) NOT NULL DEFAULT '',
    weakness VARCHAR(120) NOT NULL,
    attempts INT NOT NULL,
    correct_count INT NOT NULL,
    accuracy DOUBLE NOT NULL,
    last_seen DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_profile (user_id, source, skill_area, weakness),
    INDEX idx_user (user_id)
  )`,
];

// Tables made before a column existed get it added (this server has no ADD COLUMN IF NOT EXISTS, so a duplicate-column
// error just means it is already there).
const ADDED_COLUMNS = [
  "ALTER TABLE topik_quiz_attempts ADD COLUMN question_type VARCHAR(40) NULL",
  "ALTER TABLE topik_quiz_attempts ADD COLUMN difficulty VARCHAR(10) NULL",
  "ALTER TABLE topik_quiz_answers ADD COLUMN question_type VARCHAR(40) NULL",
  "ALTER TABLE topik_quiz_answers ADD COLUMN difficulty VARCHAR(10) NULL",
  "ALTER TABLE topik_quiz_answers ADD COLUMN domain VARCHAR(12) NULL",
  "ALTER TABLE topik_quiz_answers ADD COLUMN question_number INT NULL",
];

let ready = null;
function ensureTables(pool) {
  if (!ready) {
    ready = TABLES.reduce((chain, sql) => chain.then(() => pool.query(sql)), Promise.resolve())
      .then(() => ADDED_COLUMNS.reduce((chain, sql) => chain.then(() => pool.query(sql)).catch(err => { if (err.code !== "ER_DUP_FIELDNAME") throw err; }), Promise.resolve()))
      .catch(err => { ready = null; throw err; });
  }
  return ready;
}

const cleanWeakness = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);

// results: [{ question, options, yourAnswer, correctAnswer, isCorrect, weakness, explanation }]
async function saveAttempt(pool, { userId, topic, language, kind = "practice", questionType = null, difficulty = null, results }) {
  await ensureTables(pool);
  const correct = results.filter(r => r.isCorrect).length;
  const score = results.length ? Math.round((correct / results.length) * 100) : 0;
  const [attempt] = await pool.query(
    "INSERT INTO topik_quiz_attempts (user_id, topic, language, kind, question_type, difficulty, total, correct, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, String(topic || "mixed").slice(0, 60), String(language || "en").slice(0, 10), kind === "followup" ? "followup" : "practice", questionType || null, difficulty || null, results.length, correct, score]
  );
  const attemptId = attempt.insertId;
  for (const r of results) {
    await pool.query(
      "INSERT INTO topik_quiz_answers (attempt_id, user_id, question, options, your_answer, correct_answer, is_correct, weakness, question_type, difficulty, domain, question_number, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [attemptId, userId, String(r.question || ""), JSON.stringify(r.options || []), r.yourAnswer || "", r.correctAnswer || "", r.isCorrect ? 1 : 0, cleanWeakness(r.weakness) || null, questionType || null, difficulty || null, r.domain || null, Number.isInteger(r.number) && r.number > 0 ? r.number : null, String(r.explanation || "")]
    );
  }
  await refreshWeaknessProfiles(pool, userId);
  return { attemptId, correct, score };
}

// Rebuilds the student's weakness profile from everything stored: quiz answers grouped by the point they tested,
// exam answers grouped by section and question type. Cheap (a few hundred rows), so it simply starts over each time.
async function refreshWeaknessProfiles(pool, userId) {
  await ensureTables(pool);
  await pool.query("DELETE FROM topik_weakness_profiles WHERE user_id = ?", [userId]);
  await pool.query(
    `INSERT INTO topik_weakness_profiles (user_id, source, skill_area, weakness, attempts, correct_count, accuracy, last_seen)
     SELECT user_id, 'quiz', '', weakness, COUNT(*), SUM(is_correct), ROUND(SUM(is_correct) / COUNT(*) * 100), MAX(created_at)
       FROM topik_quiz_answers
      WHERE user_id = ? AND weakness IS NOT NULL AND weakness <> ''
      GROUP BY weakness`,
    [userId]
  );
  await pool.query(
    `INSERT INTO topik_weakness_profiles (user_id, source, skill_area, weakness, attempts, correct_count, accuracy, last_seen)
     SELECT user_id, 'exam', skill_area, REPLACE(question_type, '_', ' '), COUNT(*), SUM(is_correct), ROUND(SUM(is_correct) / COUNT(*) * 100), MAX(answered_at)
       FROM topik_exam_answers
      WHERE user_id = ?
      GROUP BY skill_area, question_type`,
    [userId]
  );
}

// The points a student gets wrong most, from quiz practice and exams together, with how often they were asked and
// how well they were answered. `source` says where a point comes from; exam points also carry their skill area.
async function weaknessSummary(pool, userId, limit = 8) {
  await ensureTables(pool);
  const [rows] = await pool.query(
    `SELECT source, skill_area, weakness, attempts, correct_count, last_seen
       FROM topik_weakness_profiles
      WHERE user_id = ? AND attempts > correct_count
      ORDER BY (attempts - correct_count) DESC, last_seen DESC
      LIMIT ?`,
    [userId, limit]
  );
  const [quiz] = await pool.query(
    "SELECT COUNT(*) AS attempts, COALESCE(ROUND(AVG(score)), 0) AS averageScore FROM topik_quiz_attempts WHERE user_id = ?",
    [userId]
  );
  const [exam] = await pool.query(
    "SELECT COUNT(*) AS sessions, COALESCE(ROUND(AVG(total_score / NULLIF(max_score, 0) * 100)), 0) AS averageScore FROM topik_exam_sessions WHERE user_id = ?",
    [userId]
  );
  // the exam numbers the student got wrong most (only answers saved with a number): "Reading Q13"
  const [numbers] = await pool.query(
    `SELECT domain, question_number, COUNT(*) AS asked, SUM(1 - is_correct) AS wrong, MAX(created_at) AS last_seen
       FROM topik_quiz_answers
      WHERE user_id = ? AND question_number IS NOT NULL AND domain IS NOT NULL
      GROUP BY domain, question_number
     HAVING wrong > 0
      ORDER BY wrong DESC, last_seen DESC
      LIMIT ?`,
    [userId, limit]
  );
  return {
    attempts: Number(quiz[0]?.attempts || 0),
    averageScore: Number(quiz[0]?.averageScore || 0),
    examSessions: Number(exam[0]?.sessions || 0),
    examAverage: Number(exam[0]?.averageScore || 0),
    missedNumbers: numbers.map(r => ({
      domain: r.domain,
      number: Number(r.question_number),
      asked: Number(r.asked),
      wrong: Number(r.wrong),
      accuracy: Math.round(((Number(r.asked) - Number(r.wrong)) / Number(r.asked)) * 100),
      lastSeen: r.last_seen,
    })),
    weaknesses: rows.map(r => ({
      weakness: r.weakness,
      source: r.source,
      skillArea: r.skill_area || null,
      asked: Number(r.attempts),
      wrong: Number(r.attempts) - Number(r.correct_count),
      accuracy: Math.round((Number(r.correct_count) / Number(r.attempts)) * 100),
      lastSeen: r.last_seen,
    })),
  };
}

module.exports = { ensureTables, saveAttempt, refreshWeaknessProfiles, weaknessSummary, cleanWeakness, TABLES };
