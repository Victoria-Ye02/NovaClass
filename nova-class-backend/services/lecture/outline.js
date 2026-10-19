const crypto = require("crypto");
const pool = require("../../config/db");
const { completeText, TEXT_MODEL } = require("../ai/openaiText");

// A one-time "lesson map" of the whole PDF: the storyline from first slide to
// last, plus a one-line gist per slide. Every slide's script is then written
// knowing where it sits in that story, so the lecture reads as one narrative
// instead of N unrelated mini-talks.
const OUTLINE_VERSION = "lesson-map-v1";
const MIN_SLIDE_TEXT = 20;
const TOTAL_CHAR_BUDGET = 22000;
const MAX_PER_SLIDE = 500;

const inflight = new Map();

function compactSlides(pages) {
  const perSlide = Math.min(MAX_PER_SLIDE, Math.max(120, Math.floor(TOTAL_CHAR_BUDGET / Math.max(pages.length, 1))));
  return pages.map(({ page, text }) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return `Slide ${page}: ${clean.length >= MIN_SLIDE_TEXT ? clean.slice(0, perSlide) : "(mostly images — little text)"}`;
  });
}

function buildPrompt(slideCount) {
  return `You are planning a lecture for a ${slideCount}-slide deck. Read all the slides and map out how the lesson flows as ONE story, from the first slide to the last.

Return JSON only, in English regardless of the slides' language:
{"storyline": "3-5 sentences: what the lesson is about, how it builds from the opening to the end, and how the main ideas connect", "slides": [{"page": 1, "gist": "at most 18 words: what this slide teaches and how it follows from the previous one"}]}

Rules:
- One entry per slide, in order, using the slide numbers given.
- Use only what the slide text supports. For a slide that is mostly images, infer its role from its neighbours and say so briefly (e.g. "visual example supporting the previous point").
- Name the connections between ideas ("builds on", "contrasts with", "puts into practice").`;
}

function parseOutline(raw, pages) {
  const text = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start < 0 || end <= start) return null;
  let data;
  try { data = JSON.parse(text.slice(start, end)); } catch { return null; }
  const storyline = String(data.storyline || "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (!storyline) return null;
  const known = new Set(pages.map(p => p.page));
  const gists = {};
  for (const slide of Array.isArray(data.slides) ? data.slides : []) {
    const page = Number(slide?.page);
    const gist = String(slide?.gist || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (known.has(page) && gist) gists[page] = gist;
  }
  return { storyline, gists };
}

// Returns { storyline, gists: { [page]: gist }, hash } or null when there is
// nothing to map (a single slide) or the model fails — scripts then simply fall
// back to being written slide by slide, as before.
async function getLessonOutline(materialId, title, pages) {
  if (!Array.isArray(pages) || pages.length < 2) return null;
  const hash = crypto.createHash("sha1")
    .update(`${OUTLINE_VERSION}|${title}|${pages.map(p => `${p.page}:${p.text}`).join("\n")}`)
    .digest("hex");

  const [rows] = await pool.query("SELECT payload FROM lecture_outlines WHERE material_id = ? AND content_hash = ?", [materialId, hash]);
  if (rows.length > 0) {
    const payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
    return { ...payload, hash };
  }

  // Several slide requests can arrive at once (page-flicking, prefetch); they
  // all wait on one model call instead of paying for N.
  if (inflight.has(hash)) return inflight.get(hash);
  const job = (async () => {
    const completion = await completeText({
      maxTokens: 2200,
      temperature: 0.3,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: buildPrompt(pages.length) },
        { role: "user", content: `Lesson title: ${title}\n\n${compactSlides(pages).join("\n")}` },
      ],
    });
    const outline = parseOutline(completion.choices?.[0]?.message?.content, pages);
    if (!outline) return null;
    await pool.query(
      `INSERT INTO lecture_outlines (material_id, content_hash, payload, model)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content_hash = VALUES(content_hash), payload = VALUES(payload),
                               model = VALUES(model), created_at = CURRENT_TIMESTAMP`,
      [materialId, hash, JSON.stringify(outline), TEXT_MODEL]
    );
    return { ...outline, hash };
  })().finally(() => inflight.delete(hash));
  inflight.set(hash, job);
  return job;
}

module.exports = { getLessonOutline, parseOutline, compactSlides, OUTLINE_VERSION };
