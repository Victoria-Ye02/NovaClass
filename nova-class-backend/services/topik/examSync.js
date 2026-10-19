// Copies the exam-mode results (Thine's exam service keeps them in its own SQLite file, exam/data/topik_ai.db) into
// the main MySQL database, then refreshes each student's weakness profile so exam weak points sit next to the quiz
// ones. The exam service is not touched: this only READS its database. A section is copied once (the key is
// user + exam paper + section), so running it again, or after every submission, is safe.
const fs = require("node:fs");
const path = require("node:path");
const { ensureTables, refreshWeaknessProfiles } = require("./quizStore");

const defaultSqlitePath = () => process.env.EXAM_SQLITE_PATH || path.join(__dirname, "../../../exam/data/topik_ai.db");
const day = value => (value ? String(value).slice(0, 19).replace("T", " ") : null);

function readExamDatabase(sqlitePath) {
  // node:sqlite is built into Node 22+; loaded here so the rest of the server never needs it
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const sessions = db.prepare(
      `SELECT s.id, s.exam_paper_id, s.skill_area, s.total_questions, s.correct_count, s.total_score, s.max_score,
              s.started_at, s.completed_at, u.email
         FROM exam_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.completed_at IS NOT NULL AND s.exam_paper_id IS NOT NULL`
    ).all();
    const logs = db.prepare(
      `SELECT question_id, question_type, difficulty, user_answer, correct_answer, is_correct, points_earned, points_possible, answered_at
         FROM question_logs WHERE session_id = ?`
    );
    return sessions.map(s => ({ ...s, logs: logs.all(s.id) }));
  } finally {
    db.close();
  }
}

// → { synced, skipped, unmatched }   `userId` limits the copy to one NovaClass student (their own submission).
async function syncExamResults(pool, { userId, sqlitePath = defaultSqlitePath() } = {}) {
  if (!fs.existsSync(sqlitePath)) return { synced: 0, skipped: 0, unmatched: 0, reason: "no exam database" };
  await ensureTables(pool);

  const emailToUser = new Map();
  const resolveUser = async email => {
    if (!emailToUser.has(email)) {
      const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
      emailToUser.set(email, rows[0]?.id ?? null);
    }
    return emailToUser.get(email);
  };

  const touched = new Set();
  let synced = 0, skipped = 0, unmatched = 0;
  for (const session of readExamDatabase(sqlitePath)) {
    const owner = await resolveUser(session.email);
    if (!owner || (userId && owner !== userId)) { if (!owner) unmatched++; continue; }

    const skill = String(session.skill_area).toLowerCase();
    const [existing] = await pool.query(
      "SELECT id FROM topik_exam_sessions WHERE user_id = ? AND exam_paper_id = ? AND skill_area = ?",
      [owner, session.exam_paper_id, skill]
    );
    if (existing.length > 0) { skipped++; continue; }

    const [inserted] = await pool.query(
      `INSERT INTO topik_exam_sessions (user_id, exam_paper_id, skill_area, total_questions, correct_count, total_score, max_score, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [owner, session.exam_paper_id, skill, session.total_questions, session.correct_count, session.total_score, session.max_score, day(session.started_at), day(session.completed_at)]
    );
    for (const log of session.logs) {
      await pool.query(
        `INSERT INTO topik_exam_answers (session_id, user_id, skill_area, question_id, question_type, difficulty, user_answer, correct_answer, is_correct, points_earned, points_possible, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [inserted.insertId, owner, skill, log.question_id, log.question_type, log.difficulty, log.user_answer, log.correct_answer, log.is_correct ? 1 : 0, log.points_earned, log.points_possible, day(log.answered_at)]
      );
    }
    touched.add(owner);
    synced++;
  }
  for (const id of touched) await refreshWeaknessProfiles(pool, id);
  return { synced, skipped, unmatched };
}

module.exports = { syncExamResults, readExamDatabase, defaultSqlitePath };
