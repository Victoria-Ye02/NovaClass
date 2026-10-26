// A professor's own voice for the lessons. The professor gives a recording (and says they allow it); ElevenLabs makes a voice
// from it and its id is kept here, one per teacher. Lessons of that teacher's classes are then read in that voice.
// The table is created on first use.
const TABLE = `CREATE TABLE IF NOT EXISTS teacher_voices (
  user_id INT PRIMARY KEY,
  voice_id VARCHAR(64) NOT NULL,
  label VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

let ready = null;
function ensureTable(pool) {
  if (!ready) ready = pool.query(TABLE).catch(err => { ready = null; throw err; });
  return ready;
}

async function getForUser(pool, userId) {
  await ensureTable(pool);
  const [[row] = []] = await pool.query("SELECT voice_id, label, created_at FROM teacher_voices WHERE user_id = ?", [userId]);
  return row ? { voiceId: row.voice_id, label: row.label || "", createdAt: row.created_at } : null;
}

async function setForUser(pool, userId, { voiceId, label = "" }) {
  await ensureTable(pool);
  await pool.query(
    "INSERT INTO teacher_voices (user_id, voice_id, label) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE voice_id = VALUES(voice_id), label = VALUES(label), created_at = CURRENT_TIMESTAMP",
    [userId, voiceId, String(label).slice(0, 120)]);
}

async function removeForUser(pool, userId) {
  await ensureTable(pool);
  await pool.query("DELETE FROM teacher_voices WHERE user_id = ?", [userId]);
}

// The teacher of the class a material belongs to: { name, voiceId }. voiceId is null when they have not given a voice, and also
// when the viewer is neither the teacher nor a member of that class (a stranger cannot make the professor "say" something).
async function teacherOfMaterial(pool, materialId, viewerId) {
  await ensureTable(pool);
  const [[row] = []] = await pool.query(
    `SELECT u.name AS name, tv.voice_id AS voice_id,
            (c.teacher_id = ? OR EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.id AND cm.user_id = ?)) AS allowed
       FROM materials m
       JOIN classes c ON c.id = m.class_id
       JOIN users u ON u.id = c.teacher_id
       LEFT JOIN teacher_voices tv ON tv.user_id = u.id
      WHERE m.id = ?`,
    [viewerId ?? 0, viewerId ?? 0, materialId]);
  return row ? { name: row.name || "", voiceId: row.allowed && row.voice_id ? row.voice_id : null } : null;
}

module.exports = { getForUser, setForUser, removeForUser, teacherOfMaterial, ensureTable };
