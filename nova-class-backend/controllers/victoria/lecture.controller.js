const crypto = require("crypto");
const path = require("path");
const pool = require("../../config/db");
const { completeText, TEXT_MODEL } = require("../../services/ai/openaiText");
const { ocrPdfPageText } = require("../../services/ai/pdfVision");
const { splitPagesFromMarkedText, replacePageText } = require("../../services/materials/pdfPages");
const { getLessonOutline } = require("../../services/lecture/outline");
const { toSpokenBurmese } = require("../../services/ai/burmeseTerms");
const { languageStyle } = require("../../services/lecture/languageRequest");

// Bump when the prompt changes so cached scripts written by an older prompt
// are regenerated instead of served forever.
const PROMPT_VERSION = "slide-script-v6";
const MIN_PAGE_TEXT = 20;
const LANGUAGES = { en: "English", my: "Burmese (Myanmar language)", ko: "Korean", vi: "Vietnamese" };

const languageRule = languageStyle;

function buildPrompt(langCode, { isFirst = false, isLast = false } = {}) {
  const language = LANGUAGES[langCode];
  const opening = isFirst
    ? "This is the FIRST slide: welcome the student in one friendly sentence, name today's topic, and give a quick roadmap of the journey ahead using the lesson storyline (e.g. 'we'll start with…, then…, and finish with…')."
    : "Open with a short, natural link back to what you just covered (see 'Just said'), then move into this slide ('So that's…, now let's see…', 'This builds on…'). Never claim anything about the previous slide beyond what is given.";
  const closing = isLast
    ? "This is the LAST slide: wrap the whole lesson up by tying the main ideas back together in one or two sentences, and end on an encouraging note."
    : "End by pointing forward to what comes next (see 'Next slide') so the lesson feels like one continuous story — one natural sentence, not a menu.";

  return `You are Professor Nova, a warm, engaging university professor narrating ONE slide of a lecture aloud. This text is fed to a text-to-speech voice, so write it exactly as it should be SPOKEN, in ${language}. ${languageRule(langCode)}

You have the lesson's whole storyline. The slides are chapters of one story, not separate talks: connect ideas across slides, refer back to earlier ideas by name, and build progressively.

How to sound human:
- Short sentences (about 8-18 words), varied in rhythm. Occasionally a very short one for emphasis.
- Show real feeling where it fits — curiosity ("here's the interesting part"), emphasis, a little humour, encouragement — but never gushing or childish.
- One rhetorical question at most, to make the student think.
- Punctuate for the ear: every sentence ends with proper punctuation (the voice pauses there). Use "…" for a thinking pause at most once.
- Never read bullets or the layout aloud. No markdown, no emojis, no parentheses, no symbols or abbreviations that are awkward to say (write small numbers as words), no stage directions.

Content rules:
- Teach the substance: what the slide's key idea means and why it matters, with ONE concrete example or analogy grounded in the slide text.
- ${opening}
- ${closing}
- Express slide text in ${language}: never copy words written in another writing system (for example Korean Hangul) into the narration; translate them, or say them the way ${language} speakers say such terms.
- The lesson title is only a label and may not match the slides. If they disagree, trust the slide text and the storyline, and never mention the title.
- "Next slide" means the slide that follows, not the final one. Only call something the last slide if you were told this is the last slide.
- Use only facts present in the slide text or the lesson storyline. If the slide has little text, teach the general concept it names and say so plainly; never invent specifics.
- Length: 90-140 words (about 40-55 seconds spoken).

Return JSON only, no markdown fences:
{"narration": "the spoken text", "key_points": ["2-3 key points, each at most 8 words, in ${language}"]}`;
}

function cleanNarration(text) {
  return String(text || "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 1800);
}

function parseScript(raw) {
  const fenced = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}") + 1;
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(fenced.slice(start, end));
      const narration = cleanNarration(parsed.narration);
      if (narration) {
        const keyPoints = (Array.isArray(parsed.key_points) ? parsed.key_points : [])
          .map(point => cleanNarration(point).slice(0, 80))
          .filter(Boolean)
          .slice(0, 3);
        return { narration, keyPoints };
      }
    } catch { /* fall through to the plain-text fallback */ }
  }
  // The model ignored the JSON instruction: a plain-text answer is still a
  // perfectly good narration.
  return { narration: cleanNarration(fenced), keyPoints: [] };
}

// Reads one slide's text for a material, falling back to OCR (and caching the
// result) when the PDF's own text layer is empty. Null when the material
// doesn't exist.
async function loadPageText(materialId, page) {
  const [mats] = await pool.query(
    "SELECT title, instructions, text_content, file_path FROM materials WHERE id = ?",
    [materialId]
  );
  if (mats.length === 0) return null;
  const mat = mats[0];

  const pages = splitPagesFromMarkedText(mat.text_content);
  let pageText = pages.find(p => p.page === page)?.text || "";

  // Slide decks exported from PowerPoint often have a broken text layer: the
  // page looks fine but nothing extracts. Read the rendered page instead and
  // cache that text so nobody pays for it twice.
  if (pageText.length < MIN_PAGE_TEXT && pages.length > 0 && mat.file_path?.toLowerCase().endsWith(".pdf")) {
    const pdfPath = path.join(__dirname, "../../uploads", path.basename(mat.file_path));
    const ocrText = await ocrPdfPageText(pdfPath, page);
    if (ocrText) {
      pageText = ocrText;
      pool.query("UPDATE materials SET text_content = ? WHERE id = ?", [replacePageText(mat.text_content, page, ocrText), materialId])
        .catch(err => console.warn("[lecture] OCR cache write failed:", err.message));
    }
  }

  return { mat, pages, pageText };
}

// Characters a language's voice cannot read aloud. The model is told not to
// write them, but it does anyway (Latin and Hangul copied from a slide, even a
// stray Thai word), so the output is checked rather than trusted.
const LATIN = "A-Za-z";
const HANGUL = "\\u1100-\\u11FF\\u3130-\\u318F\\uAC00-\\uD7AF";
const THAI = "\\u0E00-\\u0E7F";
const KANA_HAN = "\\u3040-\\u30FF\\u4E00-\\u9FFF";
const BURMESE = "\\u1000-\\u109F";
// A "word" is a run of the forbidden characters, with digits and joiners inside.
const runOf = chars => new RegExp(`[${chars}][${chars}0-9'’-]*`, "g");
const FOREIGN_SCRIPT = {
  my: runOf(LATIN + HANGUL + THAI + KANA_HAN),
  en: runOf(HANGUL + THAI + KANA_HAN + BURMESE),
  vi: runOf(HANGUL + THAI + KANA_HAN + BURMESE),
  ko: runOf(THAI + BURMESE),
};

function foreignScriptWords(text, langCode) {
  const pattern = FOREIGN_SCRIPT[langCode];
  return pattern ? [...new Set(String(text || "").match(pattern) || [])] : [];
}

// The slide's place in the lesson map (all empty strings when there is no map).
function storyFor(outline, page) {
  const gists = outline?.gists || {};
  return {
    storyline: outline?.storyline || "",
    gist: gists[page] || "",
    previousGist: gists[page - 1] || "",
    nextGist: gists[page + 1] || "",
  };
}

// The last sentence or two of the previous slide's narration, if it has been
// written already — so this slide can pick up exactly where that one left off.
async function previousNarrationTail(materialId, page, lang) {
  if (page <= 1) return "";
  try {
    const [rows] = await pool.query(
      "SELECT narration FROM lecture_scripts WHERE material_id = ? AND page_no = ? AND lang = ?",
      [materialId, page - 1, lang]
    );
    if (!rows.length) return "";
    const sentences = String(rows[0].narration).match(/[^.!?。！？။]+[.!?。！？။]*/g) || [];
    return sentences.slice(-2).join("").trim().slice(-260);
  } catch {
    return "";
  }
}

// GET /api/classroom/materials/:materialId/lecture/:page?lang=ko&total=41
exports.getSlideScript = async (req, res) => {
  // Strict digits only: parseInt("1.5") would quietly become page 1.
  const page = /^\d{1,4}$/.test(String(req.params.page)) ? Number(req.params.page) : NaN;
  if (!Number.isInteger(page) || page < 1) {
    return res.status(400).json({ error: "page must be a positive integer" });
  }
  const lang = LANGUAGES[req.query.lang] ? req.query.lang : "en";
  const { materialId } = req.params;

  try {
    const loaded = await loadPageText(materialId, page);
    if (!loaded) return res.status(404).json({ error: "Material not found" });
    const { mat, pages, pageText } = loaded;

    if (pageText.length < MIN_PAGE_TEXT) {
      return res.json({ page, lang, available: false, reason: "no_text", narration: "", keyPoints: [], cached: false });
    }

    // The lesson map is part of the cache key: when neighbouring slides change
    // (e.g. a scanned page gets OCR'd), the story around this slide changes and
    // its script is rewritten to match.
    const outline = await getLessonOutline(materialId, mat.title, pages).catch(err => {
      console.warn("[lecture] lesson map unavailable:", err.message);
      return null;
    });
    const story = storyFor(outline, page);
    const contentHash = crypto.createHash("sha1")
      .update(`${PROMPT_VERSION}|${lang}|${pageText}|${story.storyline}|${story.gist}|${story.previousGist}|${story.nextGist}`)
      .digest("hex");
    const [cachedRows] = await pool.query(
      "SELECT narration, key_points FROM lecture_scripts WHERE material_id = ? AND page_no = ? AND lang = ? AND content_hash = ?",
      [materialId, page, lang, contentHash]
    );
    if (cachedRows.length > 0) {
      const row = cachedRows[0];
      const keyPoints = typeof row.key_points === "string" ? JSON.parse(row.key_points) : (row.key_points || []);
      return res.json({ page, lang, available: true, narration: row.narration, keyPoints, cached: true });
    }

    const total = Number.parseInt(req.query.total, 10) || pages.length || null;
    const lastPage = total || pages.length || 0;
    const previousTail = await previousNarrationTail(materialId, page, lang);
    const system = buildPrompt(lang, { isFirst: page === 1, isLast: Boolean(lastPage) && page === lastPage });
    const userContent = [
      `Lesson title: ${mat.title}`,
      mat.instructions ? `Teacher's instructions: ${String(mat.instructions).slice(0, 600)}` : "",
      story.storyline ? `Lesson storyline: ${story.storyline}` : "",
      `You are on slide ${page} of ${total || "?"}.`,
      story.gist ? `This slide's role in the story: ${story.gist}` : "",
      story.previousGist ? `Previous slide: ${story.previousGist}` : "",
      previousTail ? `Just said (end of the previous slide's narration): "${previousTail}"` : "",
      story.nextGist ? `Next slide: ${story.nextGist}` : "",
      "",
      `Slide text:\n${pageText.slice(0, 4000)}`,
    ].filter(line => line !== "").join("\n");
    const write = async extraNote => {
      const completion = await completeText({
        maxTokens: 800,
        temperature: 0.6,
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: extraNote ? `${userContent}\n\n${extraNote}` : userContent },
        ],
      });
      return parseScript(completion.choices?.[0]?.message?.content);
    };

    let { narration, keyPoints } = await write();
    // One corrective rewrite when the voice would hit characters it can't read.
    const foreign = foreignScriptWords(narration, lang);
    if (narration && foreign.length > 0) {
      try {
        const retry = await write(
          `Your previous attempt contained words the ${LANGUAGES[lang]} voice cannot read aloud: ${foreign.slice(0, 12).join(", ")}. ` +
          `Rewrite the narration using only ${LANGUAGES[lang]} script — translate or transliterate those words the way ${LANGUAGES[lang]} speakers say them.`
        );
        if (retry.narration && foreignScriptWords(retry.narration, lang).length < foreign.length) ({ narration, keyPoints } = retry);
      } catch (err) {
        console.warn("[lecture] script rewrite failed, keeping the first draft:", err.message);
      }
    }
    // Whatever English terms are left would be skipped or mangled by the voice.
    if (lang === "my") narration = toSpokenBurmese(narration);
    if (!narration) return res.status(502).json({ error: "The tutor could not write a script for this slide" });

    await pool.query(
      `INSERT INTO lecture_scripts (material_id, page_no, lang, content_hash, narration, key_points, model)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content_hash = VALUES(content_hash), narration = VALUES(narration),
                               key_points = VALUES(key_points), model = VALUES(model), created_at = CURRENT_TIMESTAMP`,
      [materialId, page, lang, contentHash, narration, JSON.stringify(keyPoints), TEXT_MODEL]
    );
    res.json({ page, lang, available: true, narration, keyPoints, cached: false });
  } catch (err) {
    console.error("[lecture] slide script failed:", err.message);
    res.status(500).json({ error: "Could not prepare this slide's lecture" });
  }
};

// ---------------------------------------------------------------------------
// Pop-up quick checks. One cached question per slide; the correct answer never
// leaves the server — the client gets the question and options, then asks the
// server to grade its pick.
// ---------------------------------------------------------------------------

const QUIZ_PROMPT_VERSION = "slide-quiz-v1";
const TF_OPTIONS = {
  en: ["True", "False"],
  ko: ["맞아요", "아니에요"],
  vi: ["Đúng", "Sai"],
  my: ["မှန်", "မှား"],
};

function buildQuizPrompt(langCode, kind) {
  const language = LANGUAGES[langCode];
  const shape = kind === "tf"
    ? `{"statement": "one clear statement about the slide that is either true or false", "answer": true or false, "explanation": "1-2 sentences saying why", "practice_prompt": "..."}`
    : `{"question": "one clear question", "options": ["4 short, distinct options"], "answer": <index 0-3 of the correct option>, "explanation": "1-2 sentences saying why", "practice_prompt": "..."}`;
  return `You are Professor Nova writing ONE quick comprehension check for a slide you just taught. Write everything in ${language}. ${languageRule(langCode)}

Rules:
- Test the slide's core idea, not trivia (no page numbers, no exact wording). Use only facts in the slide text.
- ${kind === "tf"
    ? "Write a true/false statement. Make it about equally likely to be true or false; a false one should be a believable misconception, not an absurd claim."
    : "Write a multiple-choice question with exactly 4 options and one clearly correct answer. Wrong options must be plausible but unambiguously wrong; no 'all of the above'."}
- "explanation": explain WHY the answer is what it is, in a friendly teaching voice.
- "practice_prompt": a short "your turn" invitation (1-2 sentences) asking the student to write one small example or explain the idea in their own words, tied to this slide. If the slide is about code, ask for a short code example.

Return JSON only, no markdown fences:
${shape}`;
}

function parseJsonObject(raw) {
  const fenced = String(raw || "").trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}") + 1;
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end)); } catch { return null; }
}

const clip = (value, max) => String(value ?? "").replace(/[*_`#]+/g, "").trim().slice(0, max);

// Validates the model's output and returns the stored payload, or null.
function parseQuiz(raw, kind, langCode, random = Math.random) {
  const q = parseJsonObject(raw);
  if (!q) return null;
  const explanation = clip(q.explanation, 400);
  const practicePrompt = clip(q.practice_prompt, 300);
  if (kind === "tf") {
    const question = clip(q.statement || q.question, 300);
    if (!question || typeof q.answer !== "boolean") return null;
    return { kind, question, options: TF_OPTIONS[langCode] || TF_OPTIONS.en, answer: q.answer ? 0 : 1, explanation, practicePrompt };
  }
  const question = clip(q.question, 300);
  const options = (Array.isArray(q.options) ? q.options : []).map(o => clip(o, 140));
  const answerIndex = Number.isInteger(q.answer) ? q.answer : -1;
  if (!question || options.length !== 4 || options.some(o => !o) || new Set(options).size !== 4 || answerIndex < 0 || answerIndex > 3) return null;
  // Models love putting the right answer first; shuffle it into a random seat.
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { kind, question, options: order.map(i => options[i]), answer: order.indexOf(answerIndex), explanation, practicePrompt };
}

// GET /api/classroom/materials/:materialId/lecture/:page/quiz?lang=ko
exports.getSlideQuiz = async (req, res) => {
  const page = /^\d{1,4}$/.test(String(req.params.page)) ? Number(req.params.page) : NaN;
  if (!Number.isInteger(page) || page < 1) {
    return res.status(400).json({ error: "page must be a positive integer" });
  }
  const lang = LANGUAGES[req.query.lang] ? req.query.lang : "en";
  const { materialId } = req.params;
  // Alternate the format so consecutive checks feel different.
  const kind = page % 2 === 0 ? "tf" : "mcq";

  try {
    const loaded = await loadPageText(materialId, page);
    if (!loaded) return res.status(404).json({ error: "Material not found" });
    const { mat, pageText } = loaded;
    if (pageText.length < MIN_PAGE_TEXT) {
      return res.json({ page, lang, available: false, reason: "no_text" });
    }

    const contentHash = crypto.createHash("sha1").update(`${QUIZ_PROMPT_VERSION}|${kind}|${lang}|${pageText}`).digest("hex");
    const [rows] = await pool.query(
      "SELECT id, payload FROM lecture_quizzes WHERE material_id = ? AND page_no = ? AND lang = ? AND content_hash = ?",
      [materialId, page, lang, contentHash]
    );
    let quizId;
    let payload;
    if (rows.length > 0) {
      quizId = rows[0].id;
      payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
    } else {
      const completion = await completeText({
        maxTokens: 600,
        temperature: 0.6,
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: buildQuizPrompt(lang, kind) },
          { role: "user", content: `Lesson title: ${mat.title}\nSlide ${page}\n\nSlide text:\n${pageText.slice(0, 4000)}` },
        ],
      });
      payload = parseQuiz(completion.choices?.[0]?.message?.content, kind, lang);
      if (!payload) return res.status(502).json({ error: "The tutor could not write a check for this slide" });
      const [result] = await pool.query(
        `INSERT INTO lecture_quizzes (material_id, page_no, lang, content_hash, payload)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE content_hash = VALUES(content_hash), payload = VALUES(payload), created_at = CURRENT_TIMESTAMP`,
        [materialId, page, lang, contentHash, JSON.stringify(payload)]
      );
      quizId = result.insertId || (await pool.query(
        "SELECT id FROM lecture_quizzes WHERE material_id = ? AND page_no = ? AND lang = ?", [materialId, page, lang]
      ))[0][0].id;
    }

    // Deliberately no `answer` / `explanation` here — see gradeSlideQuiz.
    res.json({ page, lang, available: true, quizId, kind: payload.kind, question: payload.question, options: payload.options });
  } catch (err) {
    console.error("[lecture] slide quiz failed:", err.message);
    res.status(500).json({ error: "Could not prepare a quick check for this slide" });
  }
};

// POST /api/classroom/materials/:materialId/lecture/quiz/:quizId/answer { choice }
exports.gradeSlideQuiz = async (req, res) => {
  const quizId = /^\d{1,10}$/.test(String(req.params.quizId)) ? Number(req.params.quizId) : NaN;
  const choice = req.body?.choice;
  if (!Number.isInteger(quizId) || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return res.status(400).json({ error: "choice must be an option index" });
  }
  try {
    const [rows] = await pool.query(
      "SELECT payload FROM lecture_quizzes WHERE id = ? AND material_id = ?",
      [quizId, req.params.materialId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Quiz not found" });
    const payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
    if (choice >= payload.options.length) return res.status(400).json({ error: "choice must be an option index" });
    res.json({
      correct: choice === payload.answer,
      correctIndex: payload.answer,
      explanation: payload.explanation,
      practicePrompt: payload.practicePrompt,
    });
  } catch (err) {
    console.error("[lecture] quiz grading failed:", err.message);
    res.status(500).json({ error: "Could not check that answer" });
  }
};

// ---------------------------------------------------------------------------
// Visual pointers. For each spoken sentence, which words on the slide is the
// professor talking about? The client turns those phrases into on-slide
// highlights as the narration reaches each sentence.
// ---------------------------------------------------------------------------

const CUE_PROMPT_VERSION = "slide-cues-v1";
const MAX_CUE_SENTENCES = 24;
const cueCache = new Map();
const CUE_CACHE_LIMIT = 500;

// Must stay in step with splitSentences() in the frontend's lectureText.js:
// the client pairs targets with its own sentences by position.
function splitSpokenSentences(text) {
  const value = String(text || "");
  const parts = value.match(/[^.!?。！？။\n]+[.!?。！？။]*["')\]]*\s*/g);
  const sentences = (parts || [value]).filter(part => part.trim().length > 0);
  return sentences.length ? sentences : [value];
}

const squash = text => String(text || "").toLowerCase().replace(/\s+/g, " ").trim();

// A target is only kept when it really appears in the slide text — a model
// that paraphrases would otherwise point at nothing, or at the wrong thing.
function validateTargets(rawTargets, count, pageText) {
  const haystack = squash(pageText);
  const list = Array.isArray(rawTargets) ? rawTargets : [];
  return Array.from({ length: count }, (_, i) => {
    const target = String(list[i] ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    return target.length >= 2 && haystack.includes(squash(target)) ? target : "";
  });
}

function buildCuePrompt(sentences) {
  return `You are helping a lecture tool point at the slide while a professor speaks. Below is the slide's text and the professor's spoken sentences, numbered.
For EACH sentence, copy the exact words from the slide text that the sentence is talking about, so a pointer can highlight them.

Rules:
- Copy the words EXACTLY as they appear in the slide text (same language, spelling and order). Never translate, paraphrase or invent.
- Choose a short phrase of 1 to 10 words — the specific term, line or bullet being explained, not the whole slide.
- If a sentence is a greeting, a transition or a general remark that doesn't refer to any specific words on the slide, use an empty string.
- Return exactly ${sentences.length} items, in order.

Return JSON only: {"targets": ["phrase 1", "", "phrase 3", ...]}`;
}

// POST /api/classroom/materials/:materialId/lecture/:page/cues { text }
exports.getSlideCues = async (req, res) => {
  const page = /^\d{1,4}$/.test(String(req.params.page)) ? Number(req.params.page) : NaN;
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 2500) : "";
  if (!Number.isInteger(page) || page < 1 || !text) {
    return res.status(400).json({ error: "page and text are required" });
  }
  const { materialId } = req.params;

  try {
    const loaded = await loadPageText(materialId, page);
    if (!loaded) return res.status(404).json({ error: "Material not found" });
    const { pageText } = loaded;
    if (pageText.length < MIN_PAGE_TEXT) return res.json({ page, targets: [] });

    const sentences = splitSpokenSentences(text).slice(0, MAX_CUE_SENTENCES);
    const key = crypto.createHash("sha1").update(`${CUE_PROMPT_VERSION}|${materialId}|${page}|${pageText}|${text}`).digest("hex");
    if (cueCache.has(key)) return res.json({ page, targets: cueCache.get(key) });

    const completion = await completeText({
      maxTokens: 500,
      temperature: 0,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: buildCuePrompt(sentences) },
        {
          role: "user",
          content: `Slide text:\n${pageText.slice(0, 4000)}\n\nSpoken sentences:\n${sentences.map((sentence, i) => `${i + 1}. ${sentence.trim()}`).join("\n")}`,
        },
      ],
    });
    const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
    const targets = validateTargets(parsed?.targets, sentences.length, pageText);

    if (cueCache.size >= CUE_CACHE_LIMIT) cueCache.delete(cueCache.keys().next().value);
    cueCache.set(key, targets);
    res.json({ page, targets });
  } catch (err) {
    console.error("[lecture] slide cues failed:", err.message);
    // Pointers are a bonus: an empty list just means "no highlights".
    res.json({ page, targets: [] });
  }
};

exports._test = { foreignScriptWords, storyFor, buildScriptPrompt: buildPrompt, languageRule, parseQuiz, buildQuizPrompt, validateTargets, splitSpokenSentences };
