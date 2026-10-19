const pool = require("../../config/db");
const { syncExamResults } = require("../../services/topik/examSync");

const TOPIK_AI_URL = process.env.TOPIK_AI_URL || "http://localhost:8010";

// Forwards a proxied request's failure through as-is (status + body) instead of
// flattening every upstream error into a generic 500 — a 503 llm_not_configured
// from topik-ai-prep should read as that, not as an opaque NovaClass crash.
async function relay(res, upstreamRes) {
  const body = await upstreamRes.json().catch(() => ({ error: "Invalid response from exam service" }));
  res.status(upstreamRes.status).json(body);
}

// Rewrites a project-root-relative path like "data/raw_exams/102nd/xxx.mp3"
// (as returned by topik-ai-prep) into a fetchable absolute URL against its
// /data static mount, percent-encoding each path segment along the way.
function toStaticUrl(relativePath) {
  if (!relativePath) return null;
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${TOPIK_AI_URL}/${encoded}`;
}

// Gets-or-creates the matching topik-ai-prep user for a NovaClass user id,
// bridging the two separate user stores by email. No mapping is persisted on
// the NovaClass side — topik-ai-prep's own users table is keyed by email, so
// this is idempotent and safe to call on every request.
async function ensureTopikUser(userId) {
  const [rows] = await pool.query("SELECT name, email FROM users WHERE id = ?", [userId]);
  if (rows.length === 0) throw new Error("User not found");
  const { name, email } = rows[0];

  const res = await fetch(`${TOPIK_AI_URL}/api/user/ensure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, display_name: name, target_level: 3 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Failed to sync exam-service user (${res.status})`);
  const topikUser = await res.json();
  return topikUser.id;
}

// GET /api/topik/exam/fresh?listening_round=102nd
exports.getFreshExam = async (req, res) => {
  const listeningRound = req.query.listening_round || "102nd";

  try {
    const upstream = await fetch(
      `${TOPIK_AI_URL}/api/exam/fresh?listening_round=${encodeURIComponent(listeningRound)}`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!upstream.ok) return relay(res, upstream);

    const exam = await upstream.json();
    if (exam.listening) exam.listening.audio_path = toStaticUrl(exam.listening.audio_path);
    if (exam.reading) {
      for (const q of exam.reading.questions) {
        if (q.image_url) q.image_url = toStaticUrl(q.image_url);
      }
    }
    res.json(exam);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

// POST /api/topik/exam/submit
exports.submitExam = async (req, res) => {
  try {
    const topikUserId = await ensureTopikUser(req.user.id);
    const upstream = await fetch(`${TOPIK_AI_URL}/api/exam/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req.body, user_id: topikUserId }),
      // Reading/Listening submissions can each trigger a batched Myanmar-explanation
      // LLM call (capped at MAX_EXPLANATIONS_PER_SECTION questions, with its own 90s
      // client-side timeout -- see app/services/analytics.py), run sequentially, plus
      // Writing's own AI grading -- so this needs real headroom, same idea as the 90s
      // already used below for analytics.
      signal: AbortSignal.timeout(220000),
    });
    if (!upstream.ok) return relay(res, upstream);
    res.json(await upstream.json());
    // The exam service keeps its results in its own SQLite file. Copy the new ones into MySQL (and refresh this
    // student's weakness profile) once the response is on its way; a failure here never touches the exam result.
    syncExamResults(pool, { userId: req.user.id }).catch(err => console.error("[Exam] could not sync the result to MySQL:", err.message));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

// GET /api/topik/analytics
exports.getAnalytics = async (req, res) => {
  try {
    const topikUserId = await ensureTopikUser(req.user.id);
    const upstream = await fetch(`${TOPIK_AI_URL}/api/user/${topikUserId}/analytics`, {
      // Weakness analysis + Myanmar study-plan generation is LLM-backed and
      // can run well past 30s under real network latency to the LLM provider.
      signal: AbortSignal.timeout(90000),
    });
    if (!upstream.ok) return relay(res, upstream);
    res.json(await upstream.json());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

// POST /api/topik/writing/grade  { question_number, question_prompt, user_answer }
exports.gradeWriting = async (req, res) => {
  try {
    const upstream = await fetch(`${TOPIK_AI_URL}/api/writing/grade-single`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) return relay(res, upstream);
    res.json(await upstream.json());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
