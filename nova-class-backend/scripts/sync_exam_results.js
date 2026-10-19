// Copies the exam-mode results from the exam service's SQLite file into MySQL and refreshes the weakness profiles.
// Safe to run again (sections already copied are skipped).
//   node scripts/sync_exam_results.js                 every student found in both databases (matched by email)
//   node scripts/sync_exam_results.js --user 17       one NovaClass user id
//   EXAM_SQLITE_PATH=/path/to/topik_ai.db node scripts/sync_exam_results.js
const pool = require("../config/db");
const { syncExamResults, defaultSqlitePath } = require("../services/topik/examSync");

const flag = process.argv.indexOf("--user");
const userId = flag > -1 ? Number(process.argv[flag + 1]) : undefined;

syncExamResults(pool, { userId })
  .then(r => {
    console.log(`Exam database: ${defaultSqlitePath()}`);
    console.log(r.reason ? `Nothing to do: ${r.reason}` : `Copied ${r.synced} section(s), skipped ${r.skipped} already copied, ${r.unmatched} without a matching NovaClass user.`);
    process.exit(0);
  })
  .catch(err => { console.error("❌", err.message); process.exit(1); });
