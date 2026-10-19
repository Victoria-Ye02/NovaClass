const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const { syncExamResults } = require("../services/topik/examSync");

// A copy of the exam service's SQLite layout (only the columns the sync reads), with one student's Reading section.
function examDatabase(t, { email = "student@example.com", completed = true } = {}) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "exam-sync-")), "topik_ai.db");
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
    CREATE TABLE exam_sessions (id INTEGER PRIMARY KEY, user_id INT, exam_paper_id TEXT, skill_area TEXT, total_questions INT, correct_count INT,
      total_score REAL, max_score REAL, started_at TEXT, completed_at TEXT);
    CREATE TABLE question_logs (id INTEGER PRIMARY KEY, session_id INT, question_id TEXT, question_type TEXT, difficulty TEXT, user_answer TEXT,
      correct_answer TEXT, is_correct INT, points_earned REAL, points_possible REAL, answered_at TEXT);
  `);
  db.prepare("INSERT INTO users VALUES (1, ?)").run(email);
  db.prepare("INSERT INTO exam_sessions VALUES (1, 1, 'paper-1', 'READING', 2, 1, 2.0, 4.0, '2026-10-13 08:04:49.838240', ?)").run(completed ? "2026-10-13 08:04:53.769295" : null);
  db.prepare("INSERT INTO question_logs VALUES (1, 1, 'q1', 'grammar_fill_in', 'medium', '2', '2', 1, 2.0, 2.0, '2026-10-13 08:04:50')").run();
  db.prepare("INSERT INTO question_logs VALUES (2, 1, 'q2', 'main_idea', 'medium', NULL, '3', 0, 0.0, 2.0, '2026-10-13 08:04:51')").run();
  db.close();
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  return file;
}

// a MySQL double that remembers what is "already there"
function mysql({ users = { "student@example.com": 5 }, synced = [] } = {}) {
  const calls = [];
  const sessions = [...synced];
  const pool = {
    calls,
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      calls.push({ q, params });
      if (/^SELECT id FROM users WHERE email/.test(q)) return [users[params[0]] ? [{ id: users[params[0]] }] : []];
      if (/^SELECT id FROM topik_exam_sessions/.test(q)) return [sessions.includes(params.join("|")) ? [{ id: 1 }] : []];
      if (/^INSERT INTO topik_exam_sessions/.test(q)) { sessions.push([params[0], params[1], params[2]].join("|")); return [{ insertId: 11 }]; }
      return [{}];
    },
  };
  return pool;
}

test("copies a finished section and its answers to MySQL, matched to the NovaClass student by email", async t => {
  const pool = mysql();
  const result = await syncExamResults(pool, { sqlitePath: examDatabase(t) });
  assert.deepEqual(result, { synced: 1, skipped: 0, unmatched: 0 });

  const session = pool.calls.find(c => /^INSERT INTO topik_exam_sessions/.test(c.q));
  assert.deepEqual(session.params.slice(0, 7), [5, "paper-1", "reading", 2, 1, 2, 4]);
  assert.equal(session.params[7], "2026-10-13 08:04:49");               // fractional seconds trimmed for DATETIME

  const answers = pool.calls.filter(c => /^INSERT INTO topik_exam_answers/.test(c.q));
  assert.equal(answers.length, 2);
  assert.deepEqual(answers[0].params.slice(0, 5), [11, 5, "reading", "q1", "grammar_fill_in"]);
  assert.equal(answers[1].params[6], null);                              // an unanswered question keeps a null answer
  assert.equal(answers[1].params[8], 0);                                 // and counts as wrong
});

test("refreshes the student's weakness profile after copying, so exam weak points join the quiz ones", async t => {
  const pool = mysql();
  await syncExamResults(pool, { sqlitePath: examDatabase(t) });
  const profile = pool.calls.filter(c => /topik_weakness_profiles/.test(c.q));
  assert.ok(profile.some(c => /^DELETE/.test(c.q) && c.params[0] === 5));
  assert.ok(profile.some(c => /INSERT INTO topik_weakness_profiles .* 'exam'/.test(c.q)));
});

test("running it again copies nothing twice", async t => {
  const pool = mysql({ synced: ["5|paper-1|reading"] });
  const result = await syncExamResults(pool, { sqlitePath: examDatabase(t) });
  assert.deepEqual(result, { synced: 0, skipped: 1, unmatched: 0 });
  assert.equal(pool.calls.some(c => /^INSERT INTO topik_exam_(sessions|answers)/.test(c.q)), false);
});

test("a student who has no NovaClass account is counted, not copied; unfinished sections are ignored", async t => {
  const stranger = mysql({ users: {} });
  assert.deepEqual(await syncExamResults(stranger, { sqlitePath: examDatabase(t, { email: "nobody@example.com" }) }), { synced: 0, skipped: 0, unmatched: 1 });
  const unfinished = mysql();
  assert.deepEqual(await syncExamResults(unfinished, { sqlitePath: examDatabase(t, { completed: false }) }), { synced: 0, skipped: 0, unmatched: 0 });
});

test("with a user id only that student's results are copied", async t => {
  const pool = mysql();
  assert.deepEqual(await syncExamResults(pool, { userId: 99, sqlitePath: examDatabase(t) }), { synced: 0, skipped: 0, unmatched: 0 });
});

test("a missing exam database is not an error", async () => {
  const result = await syncExamResults(mysql(), { sqlitePath: "/nonexistent/topik_ai.db" });
  assert.equal(result.synced, 0);
  assert.equal(result.reason, "no exam database");
});
