const pool = require("../../config/db");
const { completeText, streamCompletion } = require("../../services/ai/groqText");
const { ocrPdfPageText } = require("../../services/ai/pdfVision");
const { textToSpeech: elevenLabsTextToSpeech } = require("../../services/ai/elevenLabs");
const { textToSpeech: burmeseTextToSpeech } = require("../../services/ai/burmeseTts");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const RAG_URL = process.env.RAG_URL || "http://localhost:8000";

// A cache hit resolves in ~10-20ms — real enough to save tokens, but so
// instant it reads as broken (no "thinking" time at all, like the button
// silently did nothing). A short artificial wait before returning a cached
// AI result keeps it feeling like the AI actually worked, not like the
// feature just skipped itself. Randomized a bit so every cache hit doesn't
// land at the exact same suspiciously-round number.
function naturalCacheDelay() {
  if (process.env.NODE_ENV === "test") return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));
}

async function ragIngest(filePath, materialId, filename) {
  try {
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer]);
    const form = new FormData();
    form.append("file", blob, filename || path.basename(filePath));
    form.append("material_id", String(materialId));
    await fetch(`${RAG_URL}/ingest`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    console.warn("[RAG] ingest skipped:", err.message);
  }
}

// Fire-and-forget: generate a YouTube search query from the lesson content,
// search, and persist. Not awaited by uploadMaterial — see call site.
// Fire-and-forget: generate and persist the material's AI summary. Not
// awaited by uploadMaterial — see call site. Runs independently of (and in
// parallel with) autoSuggestYoutubeResources below.
async function autoGenerateMaterialSummary(materialId, text) {
  try {
    const prompt = `You are a teaching assistant. Read this material and return a JSON summary.

Text (first 30000 chars):
${text.slice(0, 30000)}

Return ONLY valid JSON with exactly these keys:
{
  "short": "one sentence capturing the core idea",
  "paragraph": "4-6 sentence summary paragraph",
  "detailed": "numbered step-by-step detailed breakdown"
}
Detect the language and reply in the same language.`;

    let out = (await askGroq(prompt)).trim();
    out = out.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    const start = out.indexOf("{");
    const end = out.lastIndexOf("}") + 1;
    const parsed2 = JSON.parse(out.slice(start, end));
    // The model sometimes returns "detailed" (and occasionally the others)
    // as a JSON array instead of a string despite the prompt — mysql2
    // expands an array parameter into extra placeholders, which breaks the
    // INSERT below with "Column count doesn't match value count".
    const asText = v => Array.isArray(v) ? v.join("\n") : (v && typeof v === "object" ? JSON.stringify(v) : v);

    await pool.query(
      "INSERT INTO material_summaries (material_id, summary_short, summary_paragraph, summary_detailed) VALUES (?, ?, ?, ?)",
      [materialId, asText(parsed2.short), asText(parsed2.paragraph), asText(parsed2.detailed)]
    );
  } catch (aiErr) {
    console.warn("AI summary skipped:", aiErr.message);
  }
}

async function autoSuggestYoutubeResources({ materialId, title, summaryData, text, instructions }) {
  try {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) return;

    const contentHint = summaryData
      ? summaryData.short || summaryData.paragraph
      : (text ? text.slice(0, 1000) : instructions || title);
    let searchQuery = `${title} tutorial`;
    try {
      const queryPrompt = `A teacher uploaded a lesson titled "${title}".
Lesson content: ${contentHint}

Generate a short, specific YouTube search query (max 8 words) that would find the most relevant educational video for students learning this topic.
Return ONLY the search query text, nothing else. No quotes, no explanation.`;
      const raw = (await askGroq(queryPrompt, 50)).trim();
      // Reject leaked prompt/instruction text (e.g. "[Paste content here]")
      // that the model occasionally returns when given little to work with,
      // rather than searching YouTube for it literally.
      const looksLikePlaceholder = /\[|\bpaste\b|\bplease provide\b|\byour (query|search)\b|\bgenerate the\b|\binsert\b/i.test(raw);
      if (raw && raw.length > 3 && raw.length < 100 && !looksLikePlaceholder) searchQuery = raw;
    } catch {
      // fallback to title
    }

    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=3&relevanceLanguage=en&key=${YOUTUBE_API_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!ytRes.ok) return;
    const ytData = await ytRes.json();
    const aiResources = (ytData.items || []).map(item => ({
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      channel: item.snippet.channelTitle,
      type: "video",
    }));
    await pool.query("UPDATE materials SET ai_resources = ? WHERE id = ?", [JSON.stringify(aiResources), materialId]);
  } catch (resErr) {
    console.warn("YouTube resources skipped:", resErr.message);
  }
}

async function ragRetrieve(question, materialId, nResults = 6) {
  try {
    const res = await fetch(`${RAG_URL}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, material_id: String(materialId), n_results: nResults }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.chunks && data.chunks.length > 0) return data.chunks.join("\n\n---\n\n");
  } catch {
    // RAG unavailable — fall through to text_content fallback
  }
  return null;
}

// pdf-parse concatenates every page's text into one blob with no page
// boundaries, so the AI chat had no way to know what's actually on "page N" —
// only the bare page number. This marker format is inserted per page at
// extraction time so text_content stays a single string (no schema change)
// while still being splittable back into per-page sections later.
const PAGE_MARKER_RE = /\f<<PAGE (\d+)>>\f/g;

function pdfPageMarker(pageNumber) {
  return `\f<<PAGE ${pageNumber}>>\f`;
}

function renderPdfPageWithMarker(pageData) {
  const renderOptions = { normalizeWhitespace: false, disableCombineTextItems: false };
  return pageData.getTextContent(renderOptions).then((textContent) => {
    let lastY, text = "";
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || !lastY) text += item.str;
      else text += "\n" + item.str;
      lastY = item.transform[5];
    }
    return `${pdfPageMarker(pageData.pageNumber)}${text}`;
  });
}

async function extractPdfTextWithPageMarkers(buffer) {
  const parsed = await pdfParse(buffer, { pagerender: renderPdfPageWithMarker });
  return parsed.text.trim();
}
// Reused by scripts/backfill_pdf_page_markers.js to re-extract materials
// uploaded before this marker format existed.
exports.extractPdfTextWithPageMarkers = extractPdfTextWithPageMarkers;

// Materials uploaded before this marker format existed have plain,
// unmarked text_content — splitPagesFromMarkedText correctly returns []
// for those, so callers fall back to whole-document-only behavior.
function splitPagesFromMarkedText(markedText) {
  if (!markedText) return [];
  const matches = [...markedText.matchAll(PAGE_MARKER_RE)];
  return matches.map((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : markedText.length;
    return { page: Number(match[1]), text: markedText.slice(start, end).trim() };
  });
}

// Trusting only the client-reported mimetype is fragile — some upload paths
// (scripts, certain browsers/OSes for certain files) send a generic
// mimetype like application/octet-stream for a real .pdf, which silently
// skipped text extraction entirely (text_content stayed NULL forever, so
// every AI feature had nothing but the title to work with, unrelated to the
// file actually being unreadable). The extension is a reliable fallback.
function isPdfFile(file) {
  return file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname || "");
}

function stripPageMarkers(markedText) {
  return (markedText || "").replace(PAGE_MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

// Rebuilds marked text with one page's section replaced — used to cache an
// OCR result back into text_content so future questions about that page
// skip the Vision round-trip entirely.
function replacePageText(markedText, pageNumber, newText) {
  const pages = splitPagesFromMarkedText(markedText);
  if (pages.length === 0) return markedText;
  const existingIndex = pages.findIndex(p => p.page === pageNumber);
  if (existingIndex >= 0) {
    pages[existingIndex] = { page: pageNumber, text: newText };
  } else {
    // A page with zero extractable text items (pure-image pages, common for
    // scanned worksheets) never got a marker at extraction time at all —
    // there's nothing to "replace" for it. Without inserting one here, an
    // OCR result for that page silently fails to cache: the .map() below
    // only ever touches pages that already have a marker, so every future
    // question about this same page pays the full Vision OCR round-trip
    // again instead of hitting the cache.
    pages.push({ page: pageNumber, text: newText });
    pages.sort((a, b) => a.page - b.page);
  }
  return pages.map(p => `${pdfPageMarker(p.page)}${p.text}`).join("\n\n");
}

const FILE_CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};

async function askGroq(prompt, maxTokens = 1024) {
  const completion = await completeText({
    messages: [{ role: "user", content: prompt }],
    maxTokens,
  });
  return completion.choices[0].message.content;
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function checkAccess(classId, userId) {
  const [classes] = await pool.query("SELECT * FROM classes WHERE id = ?", [classId]);
  if (classes.length === 0) return { error: "Class not found", status: 404 };
  const cls = classes[0];
  if (cls.teacher_id === userId) return { cls, role: "teacher" };
  const [members] = await pool.query(
    "SELECT * FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  );
  if (members.length === 0) return { error: "Not a member of this class", status: 403 };
  return { cls, role: "student" };
}

// POST /api/classroom/classes
exports.createClass = async (req, res) => {
  const { name, subject } = req.body;
  const teacherId = req.user.id;
  if (!name) return res.status(400).json({ error: "Class name is required" });

  try {
    let code, exists = true;
    while (exists) {
      code = generateCode();
      const [rows] = await pool.query("SELECT id FROM classes WHERE code = ?", [code]);
      exists = rows.length > 0;
    }
    const [result] = await pool.query(
      "INSERT INTO classes (name, subject, code, teacher_id) VALUES (?, ?, ?, ?)",
      [name, subject || "General", code, teacherId]
    );
    res.status(201).json({ id: result.insertId, name, subject: subject || "General", code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/classroom/classes/join
exports.joinClass = async (req, res) => {
  const { code } = req.body;
  const userId = req.user.id;
  if (!code) return res.status(400).json({ error: "Class code is required" });

  try {
    const [classes] = await pool.query("SELECT * FROM classes WHERE code = ?", [code.toUpperCase()]);
    if (classes.length === 0) return res.status(404).json({ error: "Class not found" });
    const cls = classes[0];
    if (cls.teacher_id === userId) return res.status(400).json({ error: "You already own this class" });

    await pool.query(
      "INSERT IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)",
      [cls.id, userId]
    );
    res.json({ message: "Joined successfully", class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/classes
exports.listClasses = async (req, res) => {
  const userId = req.user.id;
  try {
    const [owned] = await pool.query(
      `SELECT c.id, c.name, c.subject, c.code, 'teacher' AS my_role, u.name AS teacher_name,
              (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) AS student_count,
              (SELECT COUNT(*) FROM materials WHERE class_id = c.id) AS material_count,
              (SELECT COUNT(*) FROM assignments WHERE class_id = c.id AND is_draft = 0) AS assignment_count
       FROM classes c JOIN users u ON u.id = c.teacher_id WHERE c.teacher_id = ?`,
      [userId]
    );
    const [joined] = await pool.query(
      `SELECT c.id, c.name, c.subject, c.code, 'student' AS my_role, u.name AS teacher_name,
              (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) AS student_count,
              (SELECT COUNT(*) FROM materials WHERE class_id = c.id) AS material_count,
              (SELECT COUNT(*) FROM assignments WHERE class_id = c.id AND is_draft = 0) AS assignment_count
       FROM classes c JOIN users u ON u.id = c.teacher_id
       JOIN class_members cm ON cm.class_id = c.id WHERE cm.user_id = ?`,
      [userId]
    );
    res.json([...owned, ...joined]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/classes/:id
exports.getClass = async (req, res) => {
  try {
    const access = await checkAccess(req.params.id, req.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const [[{ student_count }]] = await pool.query(
      "SELECT COUNT(*) AS student_count FROM class_members WHERE class_id = ?",
      [req.params.id]
    );
    res.json({ ...access.cls, my_role: access.role, my_id: req.user.id, student_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/classes/:id/members
exports.getMembers = async (req, res) => {
  try {
    const access = await checkAccess(req.params.id, req.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const [teachers] = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u JOIN classes c ON c.teacher_id = u.id WHERE c.id = ?`,
      [req.params.id]
    );
    const [students] = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ?`,
      [req.params.id]
    );
    const members = [
      ...teachers.map(t => ({ ...t, role: "teacher" })),
      ...students.map(s => ({ ...s, role: "student" })),
    ];
    res.json({ teachers, students, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/classes/:id/materials
exports.listMaterials = async (req, res) => {
  try {
    const access = await checkAccess(req.params.id, req.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const [materials] = await pool.query(
      `SELECT m.id, m.title, m.instructions, m.week, m.file_path, m.created_at, m.ai_resources,
              s.summary_short AS summary
       FROM materials m
       LEFT JOIN material_summaries s ON s.material_id = m.id
       WHERE m.class_id = ? ORDER BY m.week ASC, m.created_at ASC`,
      [req.params.id]
    );
    const ids = materials.map(m => m.id);
    const filesByMaterial = {};
    if (ids.length) {
      const [files] = await pool.query(
        `SELECT * FROM material_files WHERE material_id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
      files.forEach(f => { (filesByMaterial[f.material_id] ||= []).push(f); });
    }
    const result = materials.map(m => ({
      ...m,
      file_url: m.file_path ? `/uploads/${m.file_path}` : null,
      ai_resources: m.ai_resources ? (typeof m.ai_resources === "string" ? JSON.parse(m.ai_resources) : m.ai_resources) : null,
      files: filesByMaterial[m.id] || [],
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/classroom/materials/generate-instructions
exports.generateInstructions = async (req, res) => {
  try {
    let text = "";
    let filePath = null;
    let originalFilename = req.file?.originalname || "";

    // If frontend sends cached textContent, skip file reading entirely (fast path for lang toggle)
    if (req.body.textContent) {
      text = req.body.textContent;
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    } else if (req.file) {
      filePath = req.file.path;
      try {
        const buf = fs.readFileSync(filePath);
        const parsed = await pdfParse(buf);
        text = parsed.text?.slice(0, 3000) || "";
      } catch { /* non-pdf or unreadable */ }

      // Image-based PDF: read all pages with Groq Vision (page by page)
      if (text.trim().length < 300) {
        text = await readPdfPagesWithVision(filePath, 10);
      }

      try { fs.unlinkSync(filePath); } catch { /* cleanup */ }
    }
    const title = req.body.title || "";
    const week = parseInt(req.body.week) || 1;
    const classId = req.body.classId || null;
    const lang = req.body.lang === "ko" ? "ko" : "en";
    const hint = text || title || originalFilename;
    if (!hint.trim()) return res.json({ instructions: "", textContent: "" });

    // Build curriculum context from existing class materials
    let curriculumContext = "";
    if (classId) {
      try {
        const [rows] = await pool.query(
          "SELECT week, title FROM materials WHERE class_id = ? ORDER BY week ASC, id ASC",
          [classId]
        );
        if (rows.length > 0) {
          const grouped = {};
          rows.forEach(r => {
            if (!grouped[r.week]) grouped[r.week] = [];
            grouped[r.week].push(r.title);
          });
          const lines = Object.entries(grouped)
            .map(([w, titles]) => `  Week ${w}: ${titles.join(", ")}`)
            .join("\n");
          curriculumContext = `\nClass curriculum (already posted):\n${lines}\n`;
        }
      } catch { /* continue without curriculum */ }
    }

    // Only include ASCII-safe filenames directly; Korean filenames confuse the output
    const cleanFilename = originalFilename.replace(/\.(pdf|PDF)$/, "").replace(/[_]/g, " ");
    const filenameIsAscii = /^[\x00-\x7F]*$/.test(cleanFilename);
    const filenameHint = !text && originalFilename && filenameIsAscii
      ? `\nMaterial filename: "${cleanFilename}"\n`
      : "";

    const isGenericTitle2 = /^(lesson|chapter|unit|week|part|section|module|lecture|class|topic)\s*\d*\s*$/i.test(title.trim());
    const titleLine = isGenericTitle2 && text
      ? `Week ${week} lesson material`
      : `"${title}" (Week ${week})`;

    const prompt = `You are a helpful teacher assistant.
A teacher is creating a lesson material: ${titleLine}.
${curriculumContext}${filenameHint}${text ? `\nLesson content (read from the actual document):\n${text}\n` : ""}
Write clear, friendly student-facing instructions for this specific lesson.
Rules:
- 3 to 5 sentences max
- BASE the instructions on the ACTUAL CONTENT above, not on the title
- If content mentions Korean vocabulary/TOPIK → mention vocabulary, Korean language study
- If content mentions programming/code → mention the specific language and concepts
- Start with what students will learn or practice in this specific lesson
- Mention what they should do (read, practice, complete exercises, etc.)
- Keep it encouraging and specific to the content
- Write in ${lang === "ko" ? "Korean ONLY. Use ONLY 한글 (Hangul). NEVER use Chinese characters (漢字), Japanese characters, Arabic, or any non-Hangul script. Do NOT use underscores. Write naturally like a Korean teacher." : "English only. No foreign characters."}
- IMPORTANT: Ignore garbled, corrupted characters in the source. Only use clearly readable content.

Return ONLY the instruction text, no headings, no bullet points.`;

    let instructions = (await askGroq(prompt, 350)).trim();
    // For Korean output: strip any Japanese/Chinese/Arabic characters that Groq mixed in
    if (lang === "ko") {
      instructions = instructions
        .replace(/[぀-ヿ]/g, "")   // Japanese hiragana/katakana
        .replace(/[一-鿿]/g, "")   // CJK (Chinese/Japanese kanji)
        .replace(/[؀-ۿ]/g, "")   // Arabic
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    res.json({ instructions, textContent: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Returns true if OCR text is usable (not mostly garbage symbols)
function isOcrUsable(text) {
  if (!text || text.trim().length < 50) return false;
  const meaningful = (text.match(/[\w가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  const total = text.replace(/\s/g, "").length;
  return total > 0 && (meaningful / total) > 0.45;
}

// Shared helper — extract known tech keywords from any text (works on sparse OCR output too)
function extractCodeKeywords(text) {
  const found = new Set();
  (text.match(/import\s+([\w.]+)/g) || []).slice(0, 5)
    .forEach(m => found.add(m.replace("import ", "").split(".").pop()));
  const techPattern = /\b(JDBC|SQL|MySQL|Oracle|PostgreSQL|MongoDB|PreparedStatement|ResultSet|Connection|DriverManager|Statement|CallableStatement|DataSource|Spring|Maven|Gradle|JPA|Hibernate|Servlet|JSP|HTML|CSS|JavaScript|TypeScript|React|Vue|Angular|Node|Express|Python|Java|Kotlin|Swift|Flutter|Django|Flask|FastAPI|Docker|Kubernetes|REST|API|JSON|XML|HTTP|Git|Linux|Arduino|TensorFlow|PyTorch|pandas|numpy|OpenCV|YOLO|CNN|RNN|LSTM|POS|GUI|CRUD|MVC|OOP)\b/gi;
  (text.match(techPattern) || []).forEach(m => found.add(m.toUpperCase() === m ? m : m.toLowerCase()));
  (text.match(/(?:public\s+)?(?:class|interface|enum)\s+(\w+)/g) || []).slice(0, 3)
    .forEach(m => found.add(m.split(/\s+/).pop()));
  return [...found].slice(0, 8);
}

// Call RAG server to OCR-extract text from image-based PDF
async function extractTextViaRag(filePath, filename) {
  const RAG_URL = process.env.RAG_URL || "http://localhost:8000";
  const tempId = `yt_tmp_${Date.now()}`;
  try {
    const FormData = require("form-data");
    const form = new FormData();
    form.append("material_id", tempId);
    form.append("file", fs.createReadStream(filePath), { filename });

    const ingestRes = await fetch(`${RAG_URL}/ingest`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
      signal: AbortSignal.timeout(60000),
    });
    if (!ingestRes.ok) return "";

    const retrieveRes = await fetch(`${RAG_URL}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "what technology subject programming language is taught", material_id: tempId, n_results: 5 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!retrieveRes.ok) return "";
    const data = await retrieveRes.json();
    return (data.chunks || []).join("\n").slice(0, 3000);
  } catch { return ""; }
  finally {
    // Clean up temp RAG entry
    const RAG_URL2 = process.env.RAG_URL || "http://localhost:8000";
    fetch(`${RAG_URL2}/sources/${tempId}`, { method: "DELETE" }).catch(() => {});
  }
}

// Strip PDF encoding artifacts and OCR garbage from Vision output before passing to LLM
function sanitizeVisionText(text) {
  if (!text) return "";
  // Remove Myanmar/Burmese Unicode
  text = text.replace(/[က-႟]/g, "");
  // Remove Arabic/Persian Unicode
  text = text.replace(/[؀-ۿ]/g, "");
  // Remove Thai Unicode
  text = text.replace(/[฀-๿]/g, "");
  // Remove Japanese Hiragana and Katakana
  text = text.replace(/[぀-ヿ]/g, "");
  // Remove CJK (Chinese/Japanese kanji — Korean Hangul is separate and NOT removed)
  text = text.replace(/[一-鿿]/g, "");
  // Remove comma-separated garbage: short random tokens mixed with any non-ASCII
  text = text.replace(/\b[a-z]{2,6}(,\s*(?:[a-z]{1,6}|[^\x00-\x7F]{1,3})){1,}\b/gi, "");
  // Clean up leftover punctuation and whitespace
  text = text.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
  return text;
}

// Convert PDF pages to images one by one, read each with Groq Vision, aggregate descriptions
async function readPdfPagesWithVision(pdfPath, maxPages = 10) {
  const tmpPrefix = `/tmp/ytpdf_${Date.now()}`;
  const pngFiles = [];
  try {
    await execFileAsync("/opt/homebrew/bin/pdftoppm", [
      "-r", "72", "-f", "1", "-l", String(maxPages), "-png", pdfPath, tmpPrefix
    ], { timeout: 60000 });

    // Collect all generated PNG files in order
    const dir = path.dirname(tmpPrefix);
    const base = path.basename(tmpPrefix);
    const found = fs.readdirSync(dir)
      .filter(f => f.startsWith(base) && f.endsWith(".png"))
      .sort()
      .map(f => path.join(dir, f));
    pngFiles.push(...found);

    if (pngFiles.length === 0) return "";

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const descriptions = [];
    for (const png of pngFiles) {
      try {
        const base64 = fs.readFileSync(png).toString("base64");
        const result = await model.generateContent([
          { inlineData: { data: base64, mimeType: "image/png" } },
          "Extract key topics, terms, and concepts from this educational document page. List them briefly in English only. Ignore any garbled, unreadable, or corrupted characters — only include clearly readable text.",
        ]);
        const desc = sanitizeVisionText(result.response.text() || "");
        if (desc.trim()) descriptions.push(desc.trim());
      } catch (e) {
        console.warn("[Vision] page read failed:", e.message);
        // A 429 here is a per-key quota, not a per-page fluke — every
        // remaining page would fail the same way, so stop instead of paying
        // the round-trip cost (and the wait) for each one in turn.
        if (e.status === 429) break;
      }
    }

    return descriptions.join("\n");
  } catch (e) {
    console.warn("[Vision] PDF pages read failed:", e.message);
    return "";
  } finally {
    for (const f of pngFiles) try { fs.unlinkSync(f); } catch {}
  }
}

exports.suggestYoutubeForMaterial = async (req, res) => {
  let tempFilePath = null;
  try {
    const title = req.body.title || "";
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    if (!YOUTUBE_API_KEY) return res.json({ videos: [], warning: "YOUTUBE_API_KEY not configured" });

    const languageHint = (req.body.languageHint || "English").toLowerCase().trim();

    // Direct text prompt — skip cache and AI, search YouTube immediately
    const manualQuery = (req.body.manualQuery || "").trim();
    if (manualQuery) {
      const isKorean = languageHint.includes("korean");
      const searchQuery = isKorean ? `${manualQuery} 한국어` : manualQuery;
      const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=6&relevanceLanguage=${isKorean ? "ko" : "en"}&key=${YOUTUBE_API_KEY}`;
      console.log("[YT manualQuery] searchQuery:", searchQuery);
      console.log("[YT manualQuery] url:", ytUrl.replace(YOUTUBE_API_KEY, "***"));
      const ytRes = await fetch(ytUrl);
      const ytData = await ytRes.json();
      console.log("[YT manualQuery] status:", ytRes.status, "items:", ytData.items?.length, "error:", ytData.error?.message);
      if (ytData.error) return res.status(500).json({ error: "YouTube API error: " + ytData.error.message });
      const videos = (ytData.items || []).map(item => ({
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || "",
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));
      return res.json({ videos, searchQuery });
    }

    let fileBuf = null;
    let originalFilename = req.file?.originalname || "";
    if (req.file) {
      tempFilePath = req.file.path;
      try { fileBuf = fs.readFileSync(req.file.path); } catch { /* unreadable */ }
    }

    // Cache key is the exact PDF bytes (or, with no file, the title) plus
    // language — re-opening "Create material" with the same file, or
    // another teacher uploading the identical PDF, skips straight to a
    // stored result instead of re-spending AI + YouTube API calls on it.
    const contentHash = crypto.createHash("sha256")
      .update(fileBuf || title.trim().toLowerCase())
      .update("|" + languageHint)
      .digest("hex");
    // Pagination and an explicit "Re-search" click both mean "give me
    // something different" — reading from the cache there would return the
    // exact same videos as last time and make the button look broken.
    if (!req.body.pageToken && !req.body.forceRefresh) {
      const [[cached]] = await pool.query(
        "SELECT videos_json, search_query FROM youtube_suggest_cache WHERE content_hash = ?",
        [contentHash]
      );
      if (cached && cached.videos_json?.length > 0) {
        await naturalCacheDelay();
        return res.json({ videos: cached.videos_json, searchQuery: cached.search_query, cached: true });
      }
    }

    let pdfText = "";
    if (fileBuf) {
      try {
        const parsed = await pdfParse(fileBuf);
        pdfText = parsed.text?.slice(0, 30000) || "";
      } catch { /* non-pdf or unreadable */ }
    }

    if (!title.trim() && !pdfText && !originalFilename) return res.json({ videos: [] });

    const isGenericTitle = /^(lesson|chapter|unit|week|part|section|module|lecture|class|topic)\s*\d*\s*$/i.test(title.trim());

    const usableText = isOcrUsable(pdfText) ? pdfText : "";

    // If pdf-parse returned little text (image/scanned PDF), read pages with Gemini Vision
    let visionDescription = "";
    if (req.file && pdfText.trim().length < 300) {
      visionDescription = await readPdfPagesWithVision(req.file.path, 30);
    }

    // Pre-translate common Korean educational terms
    const korToEng = {
      "토픽": "TOPIK", "어휘": "vocabulary", "듣기": "listening", "읽기": "reading",
      "쓰기": "writing", "문법": "grammar", "말하기": "speaking", "발음": "pronunciation",
      "정답": "answer key", "해설": "explanation", "연습": "practice", "시험": "exam",
      "빈도별": "by frequency", "초급": "beginner", "중급": "intermediate", "고급": "advanced",
      "한국어": "Korean language", "일본어": "Japanese language", "중국어": "Chinese language",
      "수학": "math", "과학": "science", "영어": "English", "역사": "history",
      "모든": "complete", "것": "", "의": "", "을": "", "이": "", "가": "", "에": "",
      "대한": "about", "위한": "for", "학습": "study", "교재": "textbook", "강의": "lecture",
    };
    // Clean filename: translate Korean terms, then strip remaining non-ASCII
    let cleanFn = originalFilename.replace(/\.(pdf|PDF)$/, "").replace(/[_\-]/g, " ");
    Object.entries(korToEng).forEach(([kor, eng]) => { cleanFn = cleanFn.replace(new RegExp(kor, "g"), ` ${eng} `); });
    cleanFn = cleanFn.replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim();

    // Build initial searchQuery from cleaned filename (safe fallback)
    let searchQuery = cleanFn.length > 3 ? `${cleanFn} tutorial` : (isGenericTitle ? "study tutorial" : `${title} tutorial`);
    // This English summary is shared between query-generation and relevance-scoring
    let contentSummary = "";

    try {
      const rawContent = visionDescription || usableText || "";

      // ── Step 1: Ask AI to summarise what the PDF is actually about (English) ──
      if (rawContent.trim().length > 50) {
        const summaryPrompt = `You are reading an educational document. Summarise what it is about in 2-3 sentences in English only.
Be specific: name the exact subject, exam name, skill area, level, and any notable topics covered.
Do NOT copy raw text — write a clear English description.

Document filename: "${cleanFn || originalFilename}"
${title && !isGenericTitle ? `Material title: "${title}"` : ""}
Document content:
${rawContent.slice(0, 30000)}

Return ONLY the summary, nothing else.`;

        const summaryRaw = (await askGroq(summaryPrompt, 120)).trim()
          .replace(/[^\x00-\x7F\n.,'!?%()-]/g, " ").replace(/\s+/g, " ").trim();
        if (summaryRaw.length > 20) contentSummary = summaryRaw;
      }

      // ── Step 2: Generate a targeted YouTube search query from the summary ──
      const queryContext = contentSummary
        || [
          title && !isGenericTitle ? `Title: "${title}"` : "",
          cleanFn ? `Filename: "${cleanFn}"` : "",
        ].filter(Boolean).join(", ");

      // With nothing to summarize (generic title, no filename, and the
      // document summary above didn't produce anything), the prompt below
      // would hand the model an empty "Material summary:" field — which in
      // practice sometimes makes it echo back a placeholder/instruction
      // string ("[Paste material summary here...]") instead of admitting it
      // has nothing to search for. Skip the call and keep the plain
      // filename/title fallback already set above rather than risk that.
      if (queryContext.trim().length >= 3) {
        const isKorean = /korean|한국어|korea/.test(languageHint);
        const queryPrompt = `Write a YouTube search query (max 10 words, English only) to find the best educational tutorial video for this material.

Material summary: ${queryContext}
${isKorean ? "Preferred video language: Korean — include the word \"Korean\" in the query." : ""}

Rules:
- Natural YouTube search phrase (not a comma list)
- Name the exact subject, exam, or technology
- End with "tutorial", "lesson", or "explained"
- No generic filler words like "study" or "material"

Return ONLY the search query.

Examples:
TOPIK Korean writing essay intermediate level tutorial
Java JDBC database connection PreparedStatement tutorial
English present perfect tense grammar lesson explained`;

        const raw = (await askGroq(queryPrompt, 30)).trim()
          .replace(/^["']|["']$/g, "")
          .replace(/[^\x00-\x7F]/g, "")
          .trim();
        // Defense in depth against the same failure mode: reject anything
        // that looks like leaked prompt/instruction text rather than an
        // actual search phrase, even if the guard above didn't catch it.
        const looksLikePlaceholder = /\[|\bpaste\b|\bplease provide\b|\byour (query|search)\b|\bgenerate the\b|\binsert\b/i.test(raw);
        if (raw && raw.length > 5 && raw.length < 120 && !looksLikePlaceholder) searchQuery = raw;
      }
    } catch {
      const fallbackKeywords = extractCodeKeywords(usableText + " " + originalFilename);
      if (fallbackKeywords.length > 0) {
        searchQuery = `${fallbackKeywords.slice(0, 3).join(" ")} tutorial`;
      } else if (cleanFn.length > 3) {
        searchQuery = `${cleanFn} tutorial`;
      }
    }

    const pageToken = req.body.pageToken || "";
    let ytLang = "en";
    let ytRegion = "";
    let langQuerySuffix = "";
    if (/korean|한국어|korea/.test(languageHint)) {
      ytLang = "ko"; ytRegion = "KR"; langQuerySuffix = " Korean 한국어";
    }
    // append Korean suffix to push YouTube toward Korean-language results
    if (langQuerySuffix) searchQuery = searchQuery + langQuerySuffix;
    const ytLangParam = `&relevanceLanguage=${ytLang}${ytRegion ? `&regionCode=${ytRegion}` : ""}`;
    // Fetch 6 results (no duration filter — too restrictive; AI scoring will filter instead)
    const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=6${ytLangParam}&key=${YOUTUBE_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const ytRes = await fetch(ytUrl, { signal: AbortSignal.timeout(10000) });
    if (!ytRes.ok) return res.json({ videos: [] });

    const ytData = await ytRes.json();
    const rawVideos = (ytData.items || []).map(item => ({
      title: item.snippet.title,
      description: (item.snippet.description || "").slice(0, 200),
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      channel: item.snippet.channelTitle,
    }));

    // AI relevance filter — only run if we have enough topic context to judge by
    let videos = rawVideos;
    const topicContext = [
      contentSummary,
      !contentSummary && !isGenericTitle ? `Material title: "${title}"` : "",
      !contentSummary && cleanFn ? `Subject: "${cleanFn}"` : "",
    ].filter(Boolean).join("\n");

    if (rawVideos.length > 0 && topicContext.trim().length > 10) {
      try {
        const videoList = rawVideos.map((v, i) => `${i + 1}. "${v.title}" — ${v.description}`).join("\n");
        const scorePrompt = `Rate how relevant each YouTube video is to this educational material.

Material: ${topicContext}

Videos:
${videoList}

Output ONLY a JSON array of integer scores, one per video, like: [8, 2, 7, 1, 9, 4]
10 = perfectly matches the material topic. 1 = completely unrelated.
Output the array only, no other text.`;

        const scoreRaw = (await askGroq(scorePrompt, 40)).trim();
        const match = scoreRaw.match(/\[[\d,\s]+\]/);
        if (match) {
          const scores = JSON.parse(match[0]);
          const scored = rawVideos.map((v, i) => ({ ...v, score: scores[i] ?? 5 }));
          scored.sort((a, b) => b.score - a.score);
          // Show videos scoring ≥5, always show at least 2 even if scores are low
          const cutoff = scored[1]?.score >= 5 ? 5 : 0;
          videos = scored.filter(v => v.score >= cutoff).slice(0, 3);
        }
      } catch {
        // Scoring failed — return raw results unchanged
      }
    }

    const cleanVideos = videos.slice(0, 3).map(({ score: _s, description: _d, ...rest }) => rest);

    // Cache first-page results only — pagination is explicitly asking for
    // fresh alternatives, caching it would defeat the point of "next page".
    // Never cache an empty result: a bad/generic query or a transient
    // YouTube API hiccup returning 0 videos would otherwise get permanently
    // stuck as "no videos" for that document — every future search (and
    // even "Re-search", once its own fresh result also came back empty)
    // would keep reading that same empty cache entry forever.
    if (!req.body.pageToken && cleanVideos.length > 0) {
      pool.query(
        "INSERT INTO youtube_suggest_cache (content_hash, search_query, videos_json) VALUES (?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE search_query = VALUES(search_query), videos_json = VALUES(videos_json)",
        [contentHash, searchQuery, JSON.stringify(cleanVideos)]
      ).catch(err => console.warn("[YouTube cache] write failed:", err.message));
    }

    res.json({ videos: cleanVideos, searchQuery, nextPageToken: ytData.nextPageToken || null });
  } catch (err) {
    res.status(500).json({ error: err.message, videos: [] });
  } finally {
    if (tempFilePath) try { fs.unlinkSync(tempFilePath); } catch { /* cleanup */ }
  }
};

// Materials support one primary document (the field named "file" — drives
// the PDF viewer/OCR/highlight pipeline, unchanged) plus any number of
// supplementary attachments (the field named "files") stored in the
// material_files child table, mirroring assignment_files.
async function saveMaterialFiles(materialId, uploadedFiles) {
  for (const f of uploadedFiles) {
    await pool.query(
      "INSERT INTO material_files (material_id, file_name, file_path) VALUES (?, ?, ?)",
      [materialId, f.originalname, f.filename]
    );
  }
  const [files] = await pool.query("SELECT * FROM material_files WHERE material_id = ?", [materialId]);
  return files;
}

// POST /api/classroom/classes/:id/materials  (multipart/form-data)
exports.uploadMaterial = async (req, res) => {
  const classId = req.params.id;
  const userId = req.user.id;
  if (!req.body.title) return res.status(400).json({ error: "Title is required" });

  const primaryFile = req.files?.file?.[0] || null;
  const extraFiles = req.files?.files || [];

  try {
    const access = await checkAccess(classId, userId);
    if (access.error) {
      if (primaryFile) fs.unlink(primaryFile.path, () => {});
      extraFiles.forEach(f => fs.unlink(f.path, () => {}));
      return res.status(access.status).json({ error: access.error });
    }

    const title = req.body.title;
    const instructions = req.body.instructions || null;
    const week = parseInt(req.body.week) || 1;
    const filePath = primaryFile ? primaryFile.filename : null;

    if (!primaryFile) {
      const [result] = await pool.query(
        "INSERT INTO materials (class_id, title, instructions, week, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)",
        [classId, title, instructions, week, null, userId]
      );
      const materialId = result.insertId;
      const files = await saveMaterialFiles(materialId, extraFiles);
      await pool.query(
        "INSERT INTO class_posts (class_id, author_id, content, type, material_id) VALUES (?, ?, ?, 'material', ?)",
        [classId, userId, title, materialId]
      );
      return res.status(201).json({ id: materialId, title, instructions, week, file_url: null, summary: null, files });
    }

    // Extract text — only PDFs support extraction (Word/PowerPoint/images are stored as-is)
    let text = "";
    if (isPdfFile(primaryFile)) {
      const buffer = fs.readFileSync(primaryFile.path);
      text = await extractPdfTextWithPageMarkers(buffer);
    }

    // Save material with extracted text
    const [result] = await pool.query(
      "INSERT INTO materials (class_id, title, instructions, week, file_path, text_content, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [classId, title, instructions, week, filePath, text || null, userId]
    );
    const materialId = result.insertId;
    const files = await saveMaterialFiles(materialId, extraFiles);

    if (!text) {
      await pool.query(
        "INSERT INTO class_posts (class_id, author_id, content, type, material_id) VALUES (?, ?, ?, 'material', ?)",
        [classId, userId, title, materialId]
      );
      return res.status(201).json({
        id: materialId, title, instructions, week,
        file_url: `/uploads/${filePath}`, summary: null, files,
        warning: primaryFile.mimetype === "application/pdf"
          ? "Uploaded. No extractable text (scanned PDF?)."
          : "Uploaded. AI summary is only available for PDF files."
      });
    }

    // Fire-and-forget: the summary is a single ~3-6s call (short + paragraph
    // + detailed all in one prompt) — the material picks it up on its next
    // fetch once the INSERT lands, same non-blocking pattern used below for
    // the YouTube suggestions. Runs independently of (in parallel with) that.
    autoGenerateMaterialSummary(materialId, text);

    await pool.query(
      "INSERT INTO class_posts (class_id, author_id, content, type, material_id) VALUES (?, ?, ?, 'material', ?)",
      [classId, userId, title, materialId]
    );

    // Fire-and-forget: index into RAG so chat/quiz can use full document
    ragIngest(primaryFile.path, materialId, primaryFile.originalname || primaryFile.filename);

    // AI resource suggestions — use teacher's selection if provided, otherwise auto-generate
    let aiResources = null;
    if (req.body.ai_resources) {
      try {
        const parsed = typeof req.body.ai_resources === "string"
          ? JSON.parse(req.body.ai_resources)
          : req.body.ai_resources;
        if (Array.isArray(parsed) && parsed.length > 0) {
          aiResources = parsed;
          await pool.query("UPDATE materials SET ai_resources = ? WHERE id = ?", [JSON.stringify(aiResources), materialId]);
        }
      } catch { /* ignore malformed */ }
    }

    // Fire-and-forget: 2 sequential network calls (Groq query-gen + YouTube
    // search) add ~3s to the upload response if awaited here. The material
    // picks the result up on its next fetch once the UPDATE below lands.
    // summaryData isn't available yet (also backgrounded, above) — falls
    // back to the raw extracted text as its content hint, same as always
    // when no summary is available.
    if (!aiResources) autoSuggestYoutubeResources({ materialId, title, summaryData: null, text, instructions });

    res.status(201).json({
      id: materialId, title, instructions, week,
      file_url: `/uploads/${filePath}`,
      summary: null,
      ai_resources: aiResources,
      files,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/classroom/materials/:materialId/ai
exports.materialAI = async (req, res) => {
  const { action, message, history } = req.body;
  const isTeacherMode = action === "chat" && req.body.mode === "teacher";
  const allowedTeachingIntents = new Set(["start", "continue", "simplify", "check", "answer"]);
  const teachingIntent = allowedTeachingIntents.has(req.body.teachingIntent)
    ? req.body.teachingIntent
    : "answer";
  try {
    const [mats] = await pool.query(
      `SELECT m.title, m.instructions, m.text_content, m.file_path,
              s.summary_paragraph, s.summary_detailed
       FROM materials m LEFT JOIN material_summaries s ON s.material_id = m.id
       WHERE m.id = ?`,
      [req.params.materialId]
    );
    if (mats.length === 0) return res.status(404).json({ error: "Material not found" });
    const mat = mats[0];

    // Same across the whole handler: collapse to one of the app's supported
    // languages (see Settings.jsx) rather than silently caching under an
    // arbitrary lang value.
    const materialAiLang = ["my", "ko", "vi"].includes(req.body.lang) ? req.body.lang : "en";

    // Summary/quiz/highlights are pure functions of the material's own
    // content in a given language — the same for every student who opens it
    // in that language — so the first person to open "AI Study Mentor" in a
    // language pays for the AI call and everyone after (in that same
    // language) gets the cached result for free. lang is part of the cache
    // key so a Korean-set and Myanmar-set student never share a response
    // written in the other one's language.
    if (["summary", "quiz", "highlights"].includes(action)) {
      const [[cachedAi]] = await pool.query(
        "SELECT result_json FROM material_ai_cache WHERE material_id = ? AND action = ? AND lang = ?",
        [req.params.materialId, action, materialAiLang]
      );
      if (cachedAi) {
        await naturalCacheDelay();
        return res.json({ data: cachedAi.result_json, cached: true });
      }
    }

    // Cache first-turn assistant questions only — a question with prior
    // conversation history depends on that history for its answer, so it
    // can't be safely reused for a different conversation. Checked before
    // the RAG lookup below so a cache hit skips that call too, not just
    // the AI completion.
    const isFreshAssistantQuestion = action === "chat" && req.body.mode === "assistant" && !(history || []).length && message;
    let chatCacheKey = null;
    if (isFreshAssistantQuestion) {
      chatCacheKey = crypto.createHash("sha256")
        .update(message.trim().toLowerCase())
        .update("|" + (req.body.lang || "en"))
        .update("|" + (req.body.currentPage || ""))
        .digest("hex");
      const [[cached]] = await pool.query(
        "SELECT answer FROM material_chat_cache WHERE material_id = ? AND question_hash = ?",
        [req.params.materialId, chatCacheKey]
      );
      if (cached) {
        await naturalCacheDelay();
        return res.json({ reply: cached.answer, cached: true });
      }
    }

    // Build retrieval query: for chat use the user's message, for others use action keywords
    const retrievalQuery = action === "chat" && message
      ? message
      : action === "quiz"   ? "key concepts, vocabulary, grammar rules, main topics, important points"
      : action === "summary" ? "main topics, core concepts, key points, lesson overview"
      : action === "highlights" ? "key terms, definitions, important vocabulary, formulas"
      : mat.title;

    // Try RAG first (full-document coverage), fallback to text_content.
    // text_content may carry page markers (see extractPdfTextWithPageMarkers) —
    // stripped here so they never leak into anything the AI reads as prose.
    const cleanTextContent = stripPageMarkers(mat.text_content);
    const ragText = await ragRetrieve(retrievalQuery, req.params.materialId);
    const fullText = ragText
      || (cleanTextContent ? cleanTextContent.slice(0, 40000) : null)
      || [mat.summary_paragraph, mat.summary_detailed].filter(Boolean).join("\n\n");

    const context = [
      `Title: ${mat.title}`,
      mat.instructions ? `Instructions: ${mat.instructions}` : null,
      fullText ? `Content:\n${fullText}` : null,
    ].filter(Boolean).join("\n\n");

    if (action === "chat" && (req.body.mode === "assistant" || isTeacherMode)) {
      const { lang, currentPage, totalPages, voice } = req.body;

      // The student picks whatever language they type in, question by
      // question — it does not follow the Settings display language. The
      // system prompt below is therefore always authored in English (it's
      // instructions to the model, never shown to the student) so nothing in
      // it competes with langInstruction; only langInstruction decides what
      // language the actual reply comes back in, detected fresh off each
      // question. Writing part of the prompt in a fixed language (e.g.
      // matching req.body.lang, which only reflects the UI setting) was
      // found to make the model imitate that language's example wording —
      // e.g. the scope-refusal example below — even when the student's
      // question was in a different language entirely.
      const assistantLanguageInstruction = `Detect the language the student's latest question (the final "user" message) is written in, and reply in that exact same language — regardless of what language this system prompt, the document, or earlier messages in the conversation are in. This matters most, not least, for short low-signal messages like a bare greeting ("Hello", "Hi", "ok") — a one-word English greeting means detect English and reply in English, even if the material below is written entirely in another language (e.g. a Korean-language lesson document). Never let the document's own language pull your reply toward it; only the student's actual words decide the reply language. Keep technical/domain terms in their original language (e.g. English or Korean) when there's no natural equivalent, but write the surrounding explanation in the detected language. This applies to every part of your reply, including if you have to say you can't answer something — that refusal must also be in the detected language, not translated from an English example.

Exception: if the student explicitly asks you to switch languages ("can we talk in Burmese?", "explain that in Vietnamese", "answer in Korean from now on") — even though that request itself is written in whatever language they typed it in — comply immediately and reply in the language they asked for, not the language their request happened to be written in. Keep replying in that requested language for the rest of the conversation unless they ask to switch again or clearly go back to typing/speaking in a different one.`;

      // Teacher mode used to just teach in the Settings display language for
      // the whole lesson. Now: the lesson *opens* in Korean — like a
      // professor beginning class in the language of instruction — and once
      // the student actually says something of their own (not one of the
      // fixed lesson-control prompts below, which are UI-triggered, not
      // student speech), Nova detects that message's language and follows it
      // from then on, the same dynamic detection assistant mode already does.
      // Which past messages are the student's own words vs. a UI-triggered
      // lesson-control prompt ("Start this lesson...", "Continue the
      // lesson...", etc. — see continueLesson/simplifyLesson/
      // checkUnderstanding/continueLessonAloud on the frontend) is known for
      // certain server-side (teachingIntent "answer" = genuine; the frontend
      // always sets one of the other fixed intents for its own triggers) —
      // far more reliable than asking the model to pattern-match message text
      // against a list itself. Live-tested: when the model had to find and
      // judge this on its own, it caught an obviously different script
      // (Burmese) but kept answering in Korean after a student switched to
      // English or Vietnamese. Isolating the *exact* most recent genuine
      // student text and asking the model only to detect that one string's
      // language fixed it — a single clean detection task instead of a
      // search-and-judge one, and it naturally persists turn to turn since
      // the same most-recent genuine message keeps winning until a newer one
      // replaces it.
      const FIXED_LESSON_CONTROL_PROMPTS = new Set([
        "Start this lesson as my professor.",
        "Resume this lesson from where we stopped.",
        "Continue the lesson with the next important concept.",
        "Please explain the current concept more simply.",
        "Check my understanding with one question.",
      ]);
      const genuineStudentMessages = (history || [])
        .filter(h => h.role === "user" && !FIXED_LESSON_CONTROL_PROMPTS.has((h.content || "").trim()))
        .map(h => h.content);
      if (teachingIntent === "answer" && message && !FIXED_LESSON_CONTROL_PROMPTS.has(message.trim())) {
        genuineStudentMessages.push(message);
      }
      const latestGenuineStudentMessage = genuineStudentMessages[genuineStudentMessages.length - 1] || null;

      const teacherLanguageInstruction = latestGenuineStudentMessage
        ? `The most recent thing the student said in their own words, verbatim, was: "${latestGenuineStudentMessage.replace(/"/g, '\\"')}" — detect what language that exact text is written in, and reply in that same language for this turn, regardless of what language anything else in this conversation (your own past replies, the document, earlier turns) is in. Keep technical/domain terms in their original language (English/Korean) when there's no natural equivalent, but the surrounding explanation must follow this rule.`
        : `Teach in Korean (한국어), the way a professor opens a lecture in the language of instruction — the student hasn't written anything in their own words yet.`;
      const langInstruction = isTeacherMode
        ? teacherLanguageInstruction
        : assistantLanguageInstruction;

      const pageContext = currentPage && totalPages
        ? `The student is currently viewing page ${currentPage} of ${totalPages}.`
        : "";

      // Pages are only available for materials uploaded after the page-marker
      // format existed (extractPdfTextWithPageMarkers). Older materials fall
      // back to the previous whole-document-only sparse heuristic below.
      const pages = splitPagesFromMarkedText(mat.text_content);
      let currentPageEntry = currentPage ? pages.find(p => p.page === Number(currentPage)) : null;
      let currentPageHasText = Boolean(currentPageEntry && currentPageEntry.text.length >= 20);

      // The page renders fine visually but pdf-parse found nothing — likely a
      // broken font ToUnicode mapping (common in PPT-exported decks), not a
      // real image. Read the rendered page with Vision instead, and cache the
      // result back into text_content so no other student re-pays this cost.
      if (currentPage && pages.length > 0 && !currentPageHasText && mat.file_path?.toLowerCase().endsWith(".pdf")) {
        const pdfPath = path.join(__dirname, "../../uploads", path.basename(mat.file_path));
        const ocrText = await ocrPdfPageText(pdfPath, Number(currentPage));
        if (ocrText) {
          currentPageEntry = { page: Number(currentPage), text: ocrText };
          currentPageHasText = true;
          const updatedMarkedText = replacePageText(mat.text_content, Number(currentPage), ocrText);
          pool.query("UPDATE materials SET text_content = ? WHERE id = ?", [updatedMarkedText, req.params.materialId])
            .catch(err => console.warn("[OCR] cache write failed:", err.message));
        }
      }

      const currentPageBlock = currentPageHasText
        ? `\n\nCurrent page (page ${currentPage}) content, verbatim:\n${currentPageEntry.text}`
        : "";

      const extractedLength = cleanTextContent.length;
      const avgCharsPerPage = totalPages ? extractedLength / totalPages : Infinity;

      const pageSpecificWarning = currentPage && pages.length > 0 && !currentPageHasText
        ? `No extractable text was found for page ${currentPage} specifically — it's likely an image-based slide. Don't guess its content; say so honestly if asked about it. The rest of the document below may still be usable for other questions.`
        : "";

      const documentWideSparseWarning = pages.length === 0 && avgCharsPerPage < 80
        ? `Only ${extractedLength} characters of text could be extracted from this ${totalPages}-page document in total — most pages, likely including the current one, are image-based slides with no extractable text. You do NOT have reliable access to specific page content. If asked about "this page" or details you cannot verify in the Material content below, honestly say you can't read that page's content because it appears to be an image-based slide, instead of guessing or inventing details.`
        : "";

      // Nothing extracted at all (not even a sparse amount) — the title is
      // all that's left, and teaching confidently from a title alone is
      // exactly how a Korean-vocabulary lesson once got taught as a JDBC
      // course. Overrides the page-level warnings below: there's no document
      // to be sparse or full about, only a title.
      const noContentWarning = !fullText?.trim()
        ? `CRITICAL: no readable text could be extracted from this lesson's file at all (the "Material content" section below is empty) — you only have the title "${mat.title}" and possibly teacher instructions, nothing else. Do NOT invent, assume, or teach any specific facts, terms, or examples based on what the title sounds like it might be about. Instead, tell the student honestly (in the detected/target language) that this lesson's file isn't readable yet and they should let their teacher know, and do not proceed with teaching until real content is available.`
        : "";

      const sparseWarning = noContentWarning || pageSpecificWarning || documentWideSparseWarning;

      const scopeInstruction = `You only discuss this lesson's material. If the student asks something unrelated to this document (general chit-chat, other subjects, unrelated topics), politely say (in the detected language, not literally translated from this English sentence) that you can only help with this lesson's content and ask what they'd like to know about it — do not answer the unrelated question. A request about *how you talk to them* — asking you to reply in a different language, to explain something in their language, to speak more simply, etc. — is not an unrelated topic and must never trigger that refusal; just comply and keep discussing the lesson in the language they asked for.`;

      // Voice replies get read aloud through TTS immediately after — the same
      // multi-paragraph length that's fine to read on screen makes a spoken
      // reply feel like it rambles on forever and pushes up latency (more
      // tokens to generate, then synthesize, before the student hears anything).
      const voiceInstruction = voice
        ? `This reply will be read aloud by text-to-speech, not displayed as text — keep it to 1-3 short spoken sentences, like a quick verbal answer, not a written explanation. No lists, headings, markdown, or asterisks. If the full answer genuinely needs more than that, give the short version and end by asking if they want more detail, rather than saying it all at once.`
        : "";

      // A warm tutor persona rather than a flat "assistant" — explains instead
      // of reciting, encourages, checks understanding, and offers practice.
      // The voice/scope/honesty rules below still bound how it behaves.
      // Speaking register matters as much as wording, especially in Korean:
      // the model's default is a stiff, ceremonious formal register (합쇼체 —
      // "-습니다"/"-십니까") that reads as a customer-service script, not a
      // real teacher talking to their own students. A slightly closer, warm
      // 해요체 register (still respectful, not banmal/casual speech to a
      // stranger) sounds like an actual person. This applies in whichever
      // language the reply ends up in, not just Korean — the same "stop
      // sounding like a formal announcement" note holds in English, Burmese,
      // or Vietnamese too.
      const naturalToneInstruction = `Speak like a real teacher actually talks to their own students face to face, not like a formal announcement or a customer-service script. In Korean specifically, use warm 해요체 (e.g. "-예요"/"-해요"/"-볼까요") rather than the stiffer 합쇼체 ("-습니다"/"-십니까") — respectful, but the way a approachable professor actually talks in class, not a ceremony. Use natural fillers and rhythm a person would actually use ("음", "자", "그럼") instead of every sentence being a complete, polished statement. Skip stock throat-clearing openers like "훌륭한 지적이에요!" before every single reply — vary how you react, and sometimes just get straight to the point the way a person would.`;

      const tutorPersona = isTeacherMode
        ? `You are Professor Nova, an expert, warm, and patient teacher leading this exact lesson — never break character into a generic passive Q&A assistant, no matter what the student says or asks. You do not wait passively for questions. Teach with confident professor energy: make the concept clear, connect it to an example, then check understanding. Be encouraging but never childish or condescending. Stay grounded in the material and make uncertainty explicit rather than inventing facts. If the student says something vague like "I don't know" / "몰라요" / not sure what confused them — do NOT just ask them to specify which part was hard (that hands control back to a confused student instead of leading). Instead, take the initiative yourself: pick the most likely sticking point in what you just explained, re-explain that specific piece a different way (a simpler analogy or a concrete example), THEN ask a small check-understanding question — the way an actual professor would, not a support-ticket bot waiting for more detail. ${naturalToneInstruction}`
        : `You are Nova, a warm and patient study tutor for this lesson's material. Be encouraging and never condescending — normalize confusion ("that part trips a lot of people up", not "that's easy"). Don't just repeat the material back: explain it, and reach for a short, concrete example or analogy when the student seems stuck on something. After explaining anything non-trivial, check in with a brief question ("does that make sense so far?") instead of lecturing on and on. If the student seems to want practice, offer one quick question drawn from this lesson and give warm, specific feedback on their answer — encouraging if they're wrong, brief praise if right, and always explain the correct answer either way. ${naturalToneInstruction}`;

      const teachingInstruction = !isTeacherMode ? "" : {
        start: `Teaching intent: START. This is a brand-new lesson session — the student just opened this material and has heard nothing yet, so open like a professor actually opening class, in two clear beats: (1) a brief warm greeting plus one sentence naming today's topic in plain terms (what this lesson/page is actually about), ending with a short "let's get started" — style transition; then (2), in the same reply, begin teaching from the very beginning of the current page — explain one key concept, give one concrete example or analogy grounded in what's on the page, then ask exactly one brief check-understanding question. Do not ask what the student wants to do, and do not skip straight into content without that opening beat first.`,
        continue: `Teaching intent: CONTINUE. The viewer has just turned to this new page — explain THIS page's content specifically (see "Current page" content below), don't skip ahead to a different topic. Cover the main point of this page, explain why it matters, give a concrete example grounded in what's actually on the page, then ask exactly one brief check-understanding question.`,
        simplify: `Teaching intent: SIMPLIFY. Re-explain the current concept with simpler words and one different everyday analogy. Do not introduce a new topic. End with one brief check-understanding question.`,
        check: `Teaching intent: CHECK. Ask exactly one short question that tests the concept currently being taught. Do not answer the question yet and do not introduce a new concept.`,
        answer: `Teaching intent: ANSWER. Treat the student's latest message as a response or question inside the active lesson. Write this entire reply in the language identified by the REPLY LANGUAGE instruction — not the material's own language — even though you are drawing on and reinforcing an idea from the (Korean-language) material. First give supportive feedback. If there is a misunderstanding, correct the misunderstanding clearly and explain why; if it is correct, reinforce the precise idea. Then choose one next teaching step: either a short follow-up explanation or one brief question.`,
      }[teachingIntent];

      const systemContent = `### REPLY LANGUAGE (highest priority — follow this over everything below, including the language of the material content)
${langInstruction}
### END REPLY LANGUAGE

${tutorPersona} ${scopeInstruction} ${voiceInstruction}
${teachingInstruction}
${pageContext}${currentPageBlock}

Material content (full document):
${context}

${sparseWarning}

Answer the student's question directly and naturally. When asked about the current page, prioritize the "Current page" content above — it's the exact text of that page. Only state facts that are actually supported by the content above — never invent page numbers, headings, or details you cannot verify.

### REPLY LANGUAGE REMINDER (this is your last instruction before you write the reply — it overrides everything above, including the Korean material content)
${langInstruction}`;

      const msgs = [
        { role: "system", content: systemContent },
        ...(history || []).map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
        { role: "user", content: message },
      ];

      // Shared by both the streaming (voice) and non-streaming paths below —
      // see the streaming branch and the post-hoc language-fix check further
      // down for how this is used.
      const HANGUL_RE = /[가-힣]/g;
      const targetLang = latestGenuineStudentMessage
        ? (BURMESE_SCRIPT_RE.test(latestGenuineStudentMessage) ? "my"
          : HANGUL_RE.test(latestGenuineStudentMessage) ? "ko"
          : /[àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(latestGenuineStudentMessage) ? "vi"
          : "en")
        : null;

      // Voice mode streams the reply sentence-by-sentence over SSE instead of
      // returning one JSON blob once the model finishes the whole thing — the
      // frontend starts TTS on the first sentence the moment it arrives and
      // keeps speaking subsequent sentences as they stream in, instead of
      // sitting through the full "wait for all the text, then speak" delay on
      // every single turn. Falls back to the old whole-text path (see below)
      // for anything that isn't a voice turn, and internally falls back to a
      // one-shot corrected reply if the first sentence comes back in the
      // wrong language (the same fix the non-streaming path applies, just
      // detected one sentence earlier so nothing wrong gets spoken aloud).
      if (voice) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

        let fullText = "";
        let sentenceBuffer = "";
        let firstSentenceChecked = false;
        let languageOk = true;
        const SENTENCE_RE = /^(.*?[.!?。！？])\s*/s;

        try {
          for await (const delta of streamCompletion({ messages: msgs, maxTokens: 300 })) {
            fullText += delta;
            sentenceBuffer += delta;
            let match;
            while (languageOk && (match = SENTENCE_RE.exec(sentenceBuffer))) {
              const sentence = match[1].trim();
              sentenceBuffer = sentenceBuffer.slice(match[0].length);
              if (!sentence) continue;
              if (!firstSentenceChecked && isTeacherMode && targetLang) {
                firstSentenceChecked = true;
                const hangulCount = (sentence.match(HANGUL_RE) || []).length;
                if (targetLang !== "ko" && hangulCount > 5) { languageOk = false; break; }
              }
              send("sentence", { text: sentence });
            }
          }

          let finalReply = fullText.trim();
          if (!languageOk) {
            // First sentence came back in the wrong language — the same
            // failure mode the non-streaming path corrects for. Nothing has
            // been sent to the student yet (languageOk flips before any
            // send() for this reply), so it's safe to silently translate the
            // whole thing and deliver it as a single chunk instead — same
            // total latency as the old non-streaming path for this rare
            // case, never worse.
            try {
              const fixLangName = { my: "Burmese (Myanmar language)", vi: "Vietnamese", en: "English" }[targetLang];
              const translation = await completeText({
                messages: [
                  { role: "system", content: `Translate the following teacher's reply into ${fixLangName}. Keep any technical/domain terms (Java, JDBC, SQL, code snippets, etc.) as-is where a natural equivalent doesn't exist. Return ONLY the translated text, nothing else — no preamble, no quotes around it.` },
                  { role: "user", content: finalReply },
                ],
                maxTokens: 300,
              });
              finalReply = translation.choices[0].message.content;
            } catch (translateErr) {
              console.warn("[Teacher mode language fix] streaming translation fallback failed:", translateErr.message);
            }
            send("sentence", { text: finalReply });
          } else if (sentenceBuffer.trim()) {
            // Trailing text with no closing punctuation (the model's last
            // fragment) — still worth speaking, just flush it as-is.
            send("sentence", { text: sentenceBuffer.trim() });
          }

          pool.query(
            "INSERT INTO material_chat_messages (material_id, user_id, role, content) VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)",
            [req.params.materialId, req.user.id, message, req.params.materialId, req.user.id, finalReply]
          ).catch(err => console.warn("[Chat history] write failed:", err.message));

          send("done", {});
        } catch (streamErr) {
          send("error", { message: streamErr.message });
        }
        return res.end();
      }

      // 150 was too tight for non-Latin scripts — Korean/Burmese need
      // noticeably more tokens per sentence than English in this tokenizer,
      // so a "1-3 short sentences" reply in those languages was getting cut
      // off mid-word rather than actually finishing. 300 covers that same
      // short reply comfortably in every supported language.
      const completion = await completeText({ messages: msgs, maxTokens: voice ? 300 : 600 });
      let reply = completion.choices[0].message.content;

      // Live-tested: even given the exact same forceful, isolated language
      // instruction above, this model (google/gemini-2.5-flash) sometimes
      // stays in Korean after a genuine student switch anyway — same prompt,
      // same input, inconsistent result from one call to the next. Not fixable
      // by rewording the instruction (tried several variants; all showed the
      // same intermittent failure). So: verify deterministically instead of
      // trusting the model followed the rule. Target language is decided from
      // the student's own message script — not asked of the model — and if
      // the reply still came back full of Hangul when it shouldn't have, one
      // fast dedicated translation call (a much simpler task than "notice and
      // switch mid-lecture") corrects it before the student ever sees/hears it.
      // Not gated to teachingIntent "answer" specifically — once the student
      // has genuinely spoken in some language, every later turn (including a
      // proactive "continue"/"simplify"/"check" the student didn't ask for)
      // must keep following it, or the lesson reverts to Korean the instant
      // the student goes quiet for a moment, which would feel broken.
      if (isTeacherMode && latestGenuineStudentMessage) {
        // targetLang/HANGUL_RE computed once, shared with the streaming
        // branch above (which returns before reaching here for voice turns —
        // this block now only ever runs for non-voice, text-mode chat).
        const replyHangulCount = (reply.match(HANGUL_RE) || []).length;
        if (targetLang !== "ko" && replyHangulCount > 10) {
          try {
            const fixLangName = { my: "Burmese (Myanmar language)", vi: "Vietnamese", en: "English" }[targetLang];
            const translation = await completeText({
              messages: [
                { role: "system", content: `Translate the following teacher's reply into ${fixLangName}. Keep any technical/domain terms (Java, JDBC, SQL, code snippets, etc.) as-is where a natural equivalent doesn't exist. Return ONLY the translated text, nothing else — no preamble, no quotes around it.` },
                { role: "user", content: reply },
              ],
              maxTokens: 600,
            });
            reply = translation.choices[0].message.content;
          } catch (translateErr) {
            console.warn("[Teacher mode language fix] translation fallback failed:", translateErr.message);
          }
        }
      }

      if (chatCacheKey) {
        pool.query(
          "INSERT INTO material_chat_cache (material_id, question_hash, question, answer, lang) VALUES (?, ?, ?, ?, ?) " +
          "ON DUPLICATE KEY UPDATE answer = VALUES(answer)",
          [req.params.materialId, chatCacheKey, message, reply, lang || "en"]
        ).catch(err => console.warn("[Chat cache] write failed:", err.message));
      }

      pool.query(
        "INSERT INTO material_chat_messages (material_id, user_id, role, content) VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)",
        [req.params.materialId, req.user.id, message, req.params.materialId, req.user.id, reply]
      ).catch(err => console.warn("[Chat history] write failed:", err.message));

      return res.json({ reply });
    }

    if (action === "chat") {
      const { level, lang } = req.body;
      // System prompt is authored in English throughout (it's instructions to
      // the model, never shown to the student) — only langInstruction decides
      // what language the actual reply comes back in. This keeps the prompt a
      // single source of truth across all four app languages instead of a
      // hand-duplicated template per language (see the same reasoning at the
      // assistantLanguageInstruction comment above).
      const levelGuide = {
        beginner: {
          style: `The student is just starting to learn this material. Be patient and encouraging — the goal right now is building confidence, not testing limits.`,
          qStyle: `Ask simple, fundamental questions (e.g. define a term, what is X)`,
          explain: `If wrong, gently correct — name the specific misconception if it's a common one for beginners at this material, then explain simply with 1-2 concrete examples.`,
          correct: `✅ Correct!`,
          wrong: `❌ Not quite —`,
          summary: `Great job! Here's a summary of what we covered:`,
        },
        intermediate: {
          style: `The student knows the basics but has some gaps. Push a little past their comfort zone — the goal is closing those specific gaps, not repeating what they already know.`,
          qStyle: `Ask application-based questions (e.g. where/why do we use X)`,
          explain: `If wrong, name what they likely confused it with and explain the distinction clearly, not just the correct answer in isolation.`,
          correct: `✅ Correct!`,
          wrong: `❌ Not quite —`,
          summary: `Good effort! Here's a summary of what we covered:`,
        },
        advanced: {
          style: `The student knows the material well. Treat them like a peer, not a beginner — the goal is stress-testing edge cases and exam-trap-style questions, not restating the basics.`,
          qStyle: `Ask challenging questions (edge cases, compare/contrast, problem-solving, "which of these is NOT true" style traps)`,
          explain: `If wrong, don't just correct it — explain why the trap was tempting, give a deeper explanation, and follow up with a harder angle.`,
          correct: `✅ Correct!`,
          wrong: `❌ Not quite —`,
          summary: `Excellent! Here's a summary of the topics we explored:`,
        },
      };

      const lg = levelGuide[level] || levelGuide.intermediate;
      const levelUpLangNames = { my: "Burmese (Myanmar language)", ko: "Korean", vi: "Vietnamese", en: "English" };
      const langInstruction = lang === "en"
        ? `Respond in English only. For technical terms, use English as-is.`
        : `Respond only in ${levelUpLangNames[lang] || "English"} — the student reads that language, not English. Technical terms may stay in their original language (English/Korean) when there's no natural equivalent, but every surrounding explanation must be in ${levelUpLangNames[lang] || "English"}.`;

      const systemContent = `You are a Level Up AI Study Tutor. ${langInstruction}

Student profile: ${lg.style}

Material content:
${context}

**How to proceed (follow this format strictly):**
1. Ask one question — ${lg.qStyle}
2. When student answers:
   - Correct: "${lg.correct}" then add 1-2 lines of reinforcement
   - Wrong: "${lg.wrong}" ${lg.explain}
3. After evaluating, immediately ask the next question
4. After 5 questions, give a summary: "${lg.summary}"

**Important:** Don't wait for the student to ask — take initiative and ask questions yourself.`;

      const msgs = [
        { role: "system", content: systemContent },
        ...(history || []).map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
        { role: "user", content: message },
      ];
      const completion = await completeText({
        messages: msgs,
        maxTokens: 600,
      });
      return res.json({ reply: completion.choices[0].message.content });
    }

    // The student picked this language in Settings specifically so they're
    // not stuck needing a second AI/translator just to understand the
    // first one's explanation — every human-readable field below must
    // actually be written in it, not just the source material's language.
    const MATERIAL_AI_LANG_NAMES = { my: "Burmese (Myanmar language)", ko: "Korean", vi: "Vietnamese", en: "English" };
    const materialAiLangInstruction = materialAiLang === "en"
      ? `Write every explanation, example, and description in English.`
      : `Write every explanation, example, and description in ${MATERIAL_AI_LANG_NAMES[materialAiLang]} — the student reads ${MATERIAL_AI_LANG_NAMES[materialAiLang]}, not the material's own language. A technical term itself may stay in its original language (Korean/English) when there's no natural equivalent, but the surrounding explanation must be ${MATERIAL_AI_LANG_NAMES[materialAiLang]}.`;

    // No RAG chunks, no extracted text, no prior summary — the model has
    // nothing but a title and would otherwise confidently invent content for
    // it (the exact failure mode that made a Korean-vocabulary lesson quiz
    // students on JDBC, because that's what its title happened to suggest).
    // Say so honestly instead of generating anything, and don't cache this —
    // a later fix to the file's extraction should be picked up immediately,
    // not stuck behind a stale "no content" cache entry.
    if (["summary", "quiz", "highlights"].includes(action) && !fullText?.trim()) {
      const noContentMessage = {
        en: "This lesson's file couldn't be read yet (it may be a scanned/image-only PDF, or extraction failed). Ask your teacher to check the upload — AI tools need readable text to work on this material.",
        my: "ဒီသင်ခန်းစာရဲ့ file ကို မဖတ်နိုင်သေးပါ (scanned PDF ဖြစ်နေနိုင်သည် သို့မဟုတ် extraction မအောင်မြင်ပါ)။ ဆရာ/ဆရာမကို upload ပြန်စစ်ပေးဖို့ ပြောပါ — AI tool များ အလုပ်လုပ်ရန် ဖတ်နိုင်သော text လိုအပ်ပါသည်။",
        ko: "이 수업 자료의 파일을 아직 읽을 수 없습니다 (스캔된 이미지 PDF이거나 텍스트 추출에 실패했을 수 있습니다). 선생님께 업로드를 확인해 달라고 요청하세요 — AI 도구가 작동하려면 읽을 수 있는 텍스트가 필요합니다.",
        vi: "Không thể đọc tệp của bài học này (có thể là PDF dạng ảnh quét, hoặc trích xuất văn bản đã thất bại). Hãy nhờ giáo viên kiểm tra lại tệp đã tải lên — các công cụ AI cần văn bản có thể đọc được để hoạt động.",
      }[materialAiLang] || "This lesson's file couldn't be read yet.";
      const fallback = action === "summary"
        ? [{ label: "Core concept", detail: noContentMessage }]
        : action === "highlights"
        ? [{ term: "—", category: "concept", explanation: noContentMessage, example: "" }]
        : [{ question: noContentMessage, options: ["A. —", "B. —", "C. —", "D. —"], answer: "A", explanation: noContentMessage, difficulty: "easy" }];
      return res.json({ data: fallback, noContent: true });
    }

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "highlights") {
      systemPrompt = `You are an expert study coach for language and exam-prep learners (this platform's students are largely preparing for the Korean TOPIK exam). Always respond with valid JSON only. No explanation, no markdown.`;
      userPrompt = `Extract the 8 most important terms from this material for someone studying it for the first time.
For each term, judge which category it belongs to and give a short usage example that shows it in context (a real sentence, not a definition restated).

${materialAiLangInstruction} (the "category" value itself must stay exactly one of the English words vocabulary/grammar/concept/formula — only "explanation" and "example" follow the language instruction.)

Return JSON: {"data":[{"term":"...","category":"vocabulary|grammar|concept|formula","explanation":"1-2 sentences, plain and concrete","example":"one short example sentence or usage showing the term applied"}]}

Pick terms a student would actually get stuck on — skip anything too obvious. Order roughly by how foundational each term is (most fundamental first).

Material: ${context.slice(0, 6000)}`;
    } else if (action === "summary") {
      systemPrompt = `You are an expert study coach for language and exam-prep learners (this platform's students are largely preparing for the Korean TOPIK exam). Always respond with valid JSON only. No explanation, no markdown.`;
      userPrompt = `Summarize this material as exactly 5 points, but don't just restate content flatly — give each point a role so a student skimming gets both the "what" and the "why it matters":
- 1 point labeled "Core concept": the single most important idea in this material
- 2-3 points labeled "Key point": specific facts, rules, or steps worth remembering
- 1 point labeled "Why it matters": how this connects to the exam or to real use, or what it builds toward

${materialAiLangInstruction} (the "label" value itself must stay exactly one of "Core concept"/"Key point"/"Why it matters" in English — only "detail" follows the language instruction.)

Return JSON: {"data":[{"label":"Core concept|Key point|Why it matters","detail":"1-2 concrete sentences, no filler"}]}

Material: ${context.slice(0, 6000)}`;
    } else if (action === "quiz") {
      systemPrompt = `You are an expert exam-question writer for language and exam-prep learners (this platform's students are largely preparing for the Korean TOPIK exam). Always respond with valid JSON only. No explanation, no markdown.`;
      userPrompt = `Create 3 multiple choice questions from this material, one at each difficulty: easy, medium, hard.
- Easy: tests a term or fact stated directly in the material.
- Medium: requires connecting two ideas from the material or applying a rule to a new example.
- Hard: an edge case, a common student misconception about this material, or a "which of these is NOT true" style question.
Each wrong option should be a plausible mistake a real student would make, not a random distractor. In the explanation, say why the correct answer is right AND briefly why the most tempting wrong option is wrong.

${materialAiLangInstruction} (keep the "A. "/"B. "/"C. "/"D. " option prefixes and the "answer" and "difficulty" values in English exactly as specified — only "question", the text after each option's letter prefix, and "explanation" follow the language instruction.) This applies even when the material itself is in a different language than the student reads (e.g. a Korean-language course syllabus) — do not copy the material's own sentences into "question" or the options verbatim in their original language just because they state an exact fact or exact course title; translate or paraphrase them into the target language like everything else. Only a single untranslatable technical term may stay in its original language, never a full clause or sentence.

Return JSON: {"data":[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A","explanation":"why correct is right, and why the closest wrong option is wrong","difficulty":"easy|medium|hard"}]}

Material: ${context.slice(0, 6000)}`;
    }

    const completion = await completeText({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1500,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0].message.content);

    if (["summary", "quiz", "highlights"].includes(action)) {
      pool.query(
        "INSERT INTO material_ai_cache (material_id, action, lang, result_json) VALUES (?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE result_json = VALUES(result_json)",
        [req.params.materialId, action, materialAiLang, JSON.stringify(parsed.data)]
      ).catch(err => console.warn("[AI cache] write failed:", err.message));
    }

    return res.json({ data: parsed.data });
  } catch (err) {
    console.error("materialAI error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/materials/:materialId/summary
exports.getSummary = async (req, res) => {
  try {
    const [materials] = await pool.query("SELECT * FROM materials WHERE id = ?", [req.params.materialId]);
    if (materials.length === 0) return res.status(404).json({ error: "Material not found" });
    const access = await checkAccess(materials[0].class_id, req.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const [summaries] = await pool.query(
      "SELECT summary_short, summary_paragraph, summary_detailed FROM material_summaries WHERE material_id = ?",
      [req.params.materialId]
    );
    if (summaries.length === 0) return res.status(404).json({ error: "No summary available" });
    res.json(summaries[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/materials/:materialId/chat-history — this student's own
// prior conversation with the lesson assistant, so reopening the same lesson
// continues it instead of resetting to the greeting every time.
exports.getChatHistory = async (req, res) => {
  try {
    const [materials] = await pool.query("SELECT class_id FROM materials WHERE id = ?", [req.params.materialId]);
    if (materials.length === 0) return res.status(404).json({ error: "Material not found" });
    const access = await checkAccess(materials[0].class_id, req.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const [rows] = await pool.query(
      "SELECT role, content FROM material_chat_messages WHERE material_id = ? AND user_id = ? ORDER BY id ASC",
      [req.params.materialId, req.user.id]
    );
    res.json({ messages: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/materials/:materialId — metadata for the in-app preview page
exports.getMaterial = async (req, res) => {
  try {
    const [[m]] = await pool.query(
      "SELECT id, class_id, title, instructions, week, file_path, created_at FROM materials WHERE id = ?",
      [req.params.materialId]
    );
    if (!m) return res.status(404).json({ error: "Material not found" });
    const access = await checkAccess(m.class_id, req.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const [files] = await pool.query("SELECT * FROM material_files WHERE material_id = ?", [m.id]);

    const ext = m.file_path ? (m.file_path.split(".").pop() || "").toLowerCase() : null;
    res.json({
      id: m.id,
      class_id: m.class_id,
      title: m.title,
      instructions: m.instructions,
      week: m.week,
      created_at: m.created_at,
      file_ext: ext,
      file_url: m.file_path ? `/classroom/materials/${m.id}/file` : null,
      files,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/materials/:materialId/file — streams the file inline (in-app preview, not a download)
exports.getMaterialFile = async (req, res) => {
  try {
    const [[m]] = await pool.query("SELECT class_id, file_path FROM materials WHERE id = ?", [req.params.materialId]);
    if (!m || !m.file_path) return res.status(404).json({ error: "File not found" });
    const access = await checkAccess(m.class_id, req.user.id);
    if (access.error) return res.status(access.status).json({ error: access.error });

    // file_path is always a bare filename written by multer — basename() guards
    // against path traversal even if that assumption ever changes upstream.
    const safeName = path.basename(m.file_path);
    const filePath = path.join(__dirname, "../../uploads", safeName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });

    const ext = (safeName.split(".").pop() || "").toLowerCase();
    const contentType = FILE_CONTENT_TYPES[ext] || "application/octet-stream";
    const { size: fileSize } = fs.statSync(filePath);

    res.setHeader("Content-Type", contentType);
    // "inline" lets the browser render the file instead of triggering a download.
    // The frontend and this API are different origins (5173 vs 5001), and the
    // HTML `download` attribute on an <a> is silently ignored for cross-origin
    // links — the server's own Content-Disposition wins. So a real download
    // needs to opt into "attachment" here rather than relying on that attribute.
    const disposition = req.query.download ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(safeName)}"`);
    res.setHeader("Accept-Ranges", "bytes");
    // Deliberately not setting X-Frame-Options: the frontend (5173) and this API (5001)
    // are different origins, so even SAMEORIGIN would block the <iframe>. Express doesn't
    // set the header by default, so simply omitting it here keeps embedding allowed.

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1;
      if (!match || start >= fileSize || end >= fileSize || start > end) {
        res.setHeader("Content-Range", `bytes */${fileSize}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", fileSize);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/classroom/classes/:classId/members/:userId  (teacher: remove student)
exports.removeMember = async (req, res) => {
  const teacherId = req.user.id;
  const { classId, userId } = req.params;
  try {
    const [[cls]] = await pool.query("SELECT * FROM classes WHERE id=?", [classId]);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    if (cls.teacher_id !== teacherId) return res.status(403).json({ error: "Teachers only" });
    await pool.query("DELETE FROM class_members WHERE class_id=? AND user_id=?", [classId, userId]);
    res.json({ message: "Removed" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// PATCH /api/classroom/materials/:id/topic
exports.updateMaterialTopic = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[m]] = await pool.query("SELECT * FROM materials WHERE id=?", [req.params.id]);
    if (!m) return res.status(404).json({ error: "Not found" });
    const access = await checkAccess(m.class_id, userId);
    if (access.role !== "teacher") return res.status(403).json({ error: "Teachers only" });
    await pool.query("UPDATE materials SET topic=? WHERE id=?", [req.body.topic || null, req.params.id]);
    res.json({ topic: req.body.topic || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/classroom/classes/:classId/students/:studentId/stats
exports.getStudentStats = async (req, res) => {
  const { classId, studentId } = req.params;
  const userId = req.user.id;
  try {
    const access = await checkAccess(classId, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const [[student]] = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE id=?", [studentId]
    );
    if (!student) return res.status(404).json({ error: "Student not found" });

    // All assignments in this class
    const [assignments] = await pool.query(
      "SELECT id, title, points, due_date FROM assignments WHERE class_id=? AND is_draft=0", [classId]
    );

    // Student's submissions
    const [submissions] = await pool.query(
      `SELECT s.*, a.title AS assign_title, a.points AS max_points
       FROM submissions s JOIN assignments a ON s.assignment_id=a.id
       WHERE a.class_id=? AND s.student_id=?`, [classId, studentId]
    );
    const subMap = {};
    submissions.forEach(s => { subMap[s.assignment_id] = s; });

    const assignList = assignments.map(a => ({
      ...a,
      submission: subMap[a.id] || null,
      status: subMap[a.id]
        ? (subMap[a.id].grade !== null ? "graded" : "submitted")
        : "missing",
    }));

    const submitted = submissions.length;
    const total = assignments.length;
    const graded = submissions.filter(s => s.grade !== null);
    const avgGrade = graded.length > 0
      ? Math.round(graded.reduce((sum, s) => sum + (s.grade / s.max_points) * 100, 0) / graded.length)
      : null;

    // Attendance data for this student
    const [attendanceRows] = await pool.query(
      `SELECT s.title, s.session_date, r.status
       FROM attendance_sessions s
       LEFT JOIN attendance_records r ON r.session_id=s.id AND r.student_id=?
       WHERE s.class_id=? ORDER BY s.session_date DESC`,
      [studentId, classId]
    );
    const totalSessions = attendanceRows.length;
    const presentCount = attendanceRows.filter(r => r.status === "present").length;
    const lateCount = attendanceRows.filter(r => r.status === "late").length;
    const absentCount = attendanceRows.filter(r => r.status === "absent").length;
    const attendanceRate = totalSessions > 0
      ? Math.round(((presentCount + lateCount) / totalSessions) * 100)
      : null;

    res.json({
      student,
      stats: {
        totalAssignments: total,
        submittedCount: submitted,
        submissionRate: total > 0 ? Math.round((submitted / total) * 100) : 0,
        gradedCount: graded.length,
        avgGrade,
        totalSessions,
        presentCount,
        lateCount,
        absentCount,
        attendanceRate,
      },
      assignments: assignList,
      attendance: attendanceRows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/classroom/classes/:classId/invite  (invite by email)
exports.inviteStudent = async (req, res) => {
  const { classId } = req.params;
  const userId = req.user.id;
  const { email } = req.body;
  try {
    const [[cls]] = await pool.query("SELECT * FROM classes WHERE id=?", [classId]);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    if (cls.teacher_id !== userId) return res.status(403).json({ error: "Teachers only" });

    const [[targetUser]] = await pool.query("SELECT id, name, email FROM users WHERE email=?", [email]);
    if (!targetUser) return res.status(404).json({ error: "User not found. They must register first." });
    if (targetUser.id === userId) return res.status(400).json({ error: "Cannot invite yourself" });

    const [[existing]] = await pool.query(
      "SELECT id FROM class_members WHERE class_id=? AND user_id=?", [classId, targetUser.id]
    );
    if (existing) return res.status(400).json({ error: "Already a member" });

    await pool.query("INSERT INTO class_members (class_id, user_id) VALUES (?, ?)", [classId, targetUser.id]);
    res.json({ message: "Invited", user: targetUser });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// PUT /api/classroom/materials/:id
exports.updateMaterial = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[m]] = await pool.query("SELECT * FROM materials WHERE id=?", [req.params.id]);
    if (!m) return res.status(404).json({ error: "Not found" });
    const access = await checkAccess(m.class_id, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (access.role !== "teacher") return res.status(403).json({ error: "Teachers only" });

    const title = (req.body.title || m.title).trim();
    const instructions = req.body.instructions !== undefined ? (req.body.instructions || null) : m.instructions;
    const week = req.body.week ? parseInt(req.body.week) : m.week;

    let aiResources = m.ai_resources;
    if (req.body.ai_resources !== undefined) {
      try { aiResources = JSON.parse(req.body.ai_resources); } catch { aiResources = []; }
    }

    let filePath = m.file_path;
    let textContent = m.text_content;

    const primaryFile = req.files?.file?.[0] || null;
    const extraFiles = req.files?.files || [];

    if (primaryFile) {
      if (m.file_path) {
        const oldPath = path.join(__dirname, "../../uploads", m.file_path);
        try { fs.unlinkSync(oldPath); } catch {}
      }
      filePath = primaryFile.filename;
      if (isPdfFile(primaryFile)) {
        const buffer = fs.readFileSync(primaryFile.path);
        textContent = await extractPdfTextWithPageMarkers(buffer);
        // uploadMaterial does this on the initial upload, but a re-upload
        // through edit was never re-indexing RAG — the assistant chat
        // prefers RAG chunks over text_content, so a swapped file kept
        // answering from whatever the *previous* file's chunks were,
        // indefinitely, even though text_content above was already correct.
        // /ingest upserts by material_id, so this fully replaces the stale
        // chunks rather than appending alongside them.
        ragIngest(primaryFile.path, m.id, primaryFile.originalname || primaryFile.filename);
      } else {
        textContent = null;
      }
    }

    // Existing attachments are kept by default — only removed when the
    // caller explicitly lists their ids, never as a side effect of editing.
    let deleteFileIds = [];
    try { deleteFileIds = req.body.delete_file_ids ? JSON.parse(req.body.delete_file_ids) : []; } catch {}

    const aiResourcesJson = Array.isArray(aiResources) ? JSON.stringify(aiResources) : JSON.stringify([]);
    await pool.query(
      "UPDATE materials SET title=?, instructions=?, week=?, file_path=?, text_content=?, ai_resources=? WHERE id=?",
      [title, instructions, week, filePath, textContent, aiResourcesJson, m.id]
    );

    if (deleteFileIds.length) {
      await pool.query("DELETE FROM material_files WHERE id IN (?) AND material_id = ?", [deleteFileIds, m.id]);
    }
    const files = await saveMaterialFiles(m.id, extraFiles);

    const fileUrl = filePath ? `/uploads/${filePath}` : null;
    res.json({ id: m.id, title, instructions, week, file_url: fileUrl, class_id: m.class_id, ai_resources: aiResources || [], files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/classroom/materials/:materialId/assignments
exports.getMaterialAssignments = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[m]] = await pool.query("SELECT * FROM materials WHERE id=?", [req.params.materialId]);
    if (!m) return res.status(404).json({ error: "Not found" });
    const access = await checkAccess(m.class_id, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const [assignments] = await pool.query(
      "SELECT * FROM assignments WHERE material_id=? AND is_draft=0 ORDER BY created_at DESC",
      [req.params.materialId]
    );

    if (access.role === "student") {
      const ids = assignments.map(a => a.id);
      if (ids.length === 0) return res.json([]);
      const [subs] = await pool.query(
        `SELECT * FROM submissions WHERE student_id=? AND assignment_id IN (${ids.map(() => "?").join(",")})`,
        [userId, ...ids]
      );
      const subMap = {};
      subs.forEach(s => { subMap[s.assignment_id] = s; });
      return res.json(assignments.map(a => ({ ...a, my_submission: subMap[a.id] || null })));
    }

    const ids = assignments.map(a => a.id);
    if (ids.length === 0) return res.json([]);
    const [counts] = await pool.query(
      `SELECT assignment_id, COUNT(*) AS turned_in_count FROM submissions
       WHERE status IN ('turned_in','late','graded') AND assignment_id IN (${ids.map(() => "?").join(",")})
       GROUP BY assignment_id`,
      ids
    );
    const countMap = {};
    counts.forEach(c => { countMap[c.assignment_id] = c.turned_in_count; });
    res.json(assignments.map(a => ({ ...a, turned_in_count: countMap[a.id] || 0 })));
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/classroom/materials/:materialId/comments — private per-student threads with the teacher
exports.getMaterialComments = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[m]] = await pool.query("SELECT * FROM materials WHERE id=?", [req.params.materialId]);
    if (!m) return res.status(404).json({ error: "Not found" });
    const access = await checkAccess(m.class_id, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const query = access.role === "teacher"
      ? `SELECT mc.*, u.name AS author_name FROM material_comments mc JOIN users u ON u.id = mc.author_id WHERE mc.material_id = ? ORDER BY mc.created_at ASC`
      : `SELECT mc.*, u.name AS author_name FROM material_comments mc JOIN users u ON u.id = mc.author_id WHERE mc.material_id = ? AND (mc.author_id = ? OR mc.target_student_id = ?) ORDER BY mc.created_at ASC`;
    const params = access.role === "teacher" ? [req.params.materialId] : [req.params.materialId, userId, userId];
    const [comments] = await pool.query(query, params);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/classroom/materials/:materialId/comments
exports.addMaterialComment = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[m]] = await pool.query("SELECT * FROM materials WHERE id=?", [req.params.materialId]);
    if (!m) return res.status(404).json({ error: "Not found" });
    const access = await checkAccess(m.class_id, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const { content, target_student_id } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Comment cannot be empty" });

    const targetId = access.role === "teacher" ? (target_student_id || null) : userId;
    if (access.role === "teacher" && !targetId) return res.status(400).json({ error: "target_student_id is required" });

    const [result] = await pool.query(
      "INSERT INTO material_comments (material_id, author_id, target_student_id, content) VALUES (?, ?, ?, ?)",
      [req.params.materialId, userId, targetId, content.trim()]
    );
    const [[comment]] = await pool.query(
      `SELECT mc.*, u.name AS author_name FROM material_comments mc JOIN users u ON u.id = mc.author_id WHERE mc.id = ?`,
      [result.insertId]
    );
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/classroom/material-comments/:commentId  (author only, teacher or student)
exports.editMaterialComment = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[comment]] = await pool.query("SELECT * FROM material_comments WHERE id = ?", [req.params.commentId]);
    if (!comment) return res.status(404).json({ error: "Not found" });
    if (comment.author_id !== userId) return res.status(403).json({ error: "You can only edit your own comments" });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Comment cannot be empty" });

    await pool.query("UPDATE material_comments SET content=? WHERE id=?", [content.trim(), req.params.commentId]);
    const [[updated]] = await pool.query(
      `SELECT mc.*, u.name AS author_name FROM material_comments mc JOIN users u ON u.id = mc.author_id WHERE mc.id = ?`,
      [req.params.commentId]
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/classroom/material-comments/:commentId  (author only, teacher or student)
exports.deleteMaterialComment = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[comment]] = await pool.query("SELECT * FROM material_comments WHERE id = ?", [req.params.commentId]);
    if (!comment) return res.status(404).json({ error: "Not found" });
    if (comment.author_id !== userId) return res.status(403).json({ error: "You can only delete your own comments" });

    await pool.query("DELETE FROM material_comments WHERE id=?", [req.params.commentId]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Myanmar Unicode block (U+1000–U+109F) — presence of any character in it
// means the reply is Burmese, which ElevenLabs can't pronounce (it has no
// Burmese voice and returns mispronounced audio rather than an error).
const BURMESE_SCRIPT_RE = /[က-႟]/;

// POST /api/classroom/tts  { text }
// Speaks AI Chat replies aloud in voice mode with a natural voice instead of
// the browser's built-in (robotic) speech synthesis. Burmese goes to the
// Burmese TTS service (Azure's my-MM-NilarNeural, via Microsoft Edge's free
// Read Aloud endpoint — ElevenLabs has no Burmese voice); every other language
// goes to ElevenLabs.
exports.textToSpeech = async (req, res) => {
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });

  const isBurmese = BURMESE_SCRIPT_RE.test(text);
  try {
    const audio = isBurmese
      ? await burmeseTextToSpeech(text.slice(0, 5000))
      : await elevenLabsTextToSpeech(text.slice(0, 5000));
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    if (err.code === "ELEVENLABS_NOT_CONFIGURED") {
      return res.status(503).json({ error: err.message, code: err.code });
    }
    res.status(502).json({ error: err.message, code: err.code });
  }
};

// GET /api/classroom/deadlines — next 5 undue assignments across every class
// this user teaches or is enrolled in. No single-class assignment endpoint
// covers this; the Dashboard's "Upcoming Events" widget needs a cross-class view.
exports.listUpcomingDeadlines = async (req, res) => {
  const userId = req.user.id;
  try {
    const [deadlines] = await pool.query(
      `SELECT a.id, a.title, a.due_date, c.id AS class_id, c.name AS class_name,
              sub.status AS my_status
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
       WHERE a.is_draft = 0
         AND a.due_date IS NOT NULL
         AND a.due_date >= NOW()
         AND (c.teacher_id = ? OR c.id IN (SELECT class_id FROM class_members WHERE user_id = ?))
       ORDER BY a.due_date ASC
       LIMIT 5`,
      [userId, userId, userId]
    );
    res.json({ deadlines });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/classroom/classes/:id/notes  (teacher → student)
exports.sendNote = async (req, res) => {
  const { id: classId } = req.params;
  const { studentId, category, message } = req.body;
  const teacherId = req.user.id;
  try {
    const [[cls]] = await pool.query("SELECT * FROM classes WHERE id=?", [classId]);
    if (!cls || cls.teacher_id !== teacherId) return res.status(403).json({ error: "Not teacher of this class" });
    const [[teacher]] = await pool.query("SELECT name FROM users WHERE id=?", [teacherId]);
    const categoryLabel = { concern: "Attendance/Grade concern", reminder: "General reminder", positive: "Positive feedback" }[category] || category;
    await pool.query(
      "INSERT INTO notifications (user_id, type, title, message, link_url) VALUES (?,?,?,?,?)",
      [studentId, "teacher_note", `Note from ${teacher.name}`, `[${categoryLabel}] ${message}`, `/classroom/${classId}`]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// DELETE /api/classroom/materials/:id  (teacher only)
exports.deleteMaterial = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[m]] = await pool.query("SELECT * FROM materials WHERE id=?", [req.params.id]);
    if (!m) return res.status(404).json({ error: "Not found" });
    const access = await checkAccess(m.class_id, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (access.role !== "teacher") return res.status(403).json({ error: "Teachers only" });

    // Delete primary file from disk if it exists
    if (m.file_path) {
      const abs = path.join(__dirname, "../../uploads", m.file_path);
      fs.unlink(abs, () => {});
    }

    // Delete extra attachments
    const [extras] = await pool.query("SELECT file_path FROM material_files WHERE material_id=?", [m.id]);
    extras.forEach(f => {
      if (f.file_path) fs.unlink(path.join(__dirname, "../../uploads", f.file_path), () => {});
    });

    // Cascade delete (comments, files, highlights, etc.)
    await pool.query("DELETE FROM material_files WHERE material_id=?", [m.id]);
    await pool.query("DELETE FROM material_comments WHERE material_id=?", [m.id]);
    await pool.query("DELETE FROM pdf_highlights WHERE material_id=?", [m.id]).catch(() => {});
    await pool.query("DELETE FROM bookmarks WHERE material_id=?", [m.id]).catch(() => {});
    await pool.query("DELETE FROM materials WHERE id=?", [m.id]);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/classroom/classes/:id/members/rich  (teacher: members with grade% + attendance%)
exports.getRichMembers = async (req, res) => {
  const { id: classId } = req.params;
  const teacherId = req.user.id;
  try {
    const [[cls]] = await pool.query("SELECT * FROM classes WHERE id=?", [classId]);
    if (!cls || cls.teacher_id !== teacherId) return res.status(403).json({ error: "Not teacher of this class" });

    const [students] = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ?`,
      [classId]
    );
    const [assignments] = await pool.query(
      "SELECT id, points FROM assignments WHERE class_id=? AND is_draft=0 ORDER BY created_at ASC",
      [classId]
    );
    const [allSubs] = await pool.query(
      `SELECT s.student_id, s.assignment_id, s.grade FROM submissions s
       JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=? AND s.grade IS NOT NULL`,
      [classId]
    );
    const [attSessions] = await pool.query(
      "SELECT id FROM attendance_sessions WHERE class_id=?", [classId]
    );
    const sessionIds = attSessions.map(s => s.id);
    const attRecords = sessionIds.length
      ? (await pool.query("SELECT student_id, status FROM attendance_records WHERE session_id IN (?)", [sessionIds]))[0]
      : [];

    const subMap = {};
    allSubs.forEach(s => {
      if (!subMap[s.student_id]) subMap[s.student_id] = [];
      subMap[s.student_id].push(s);
    });
    const attMap = {};
    attRecords.forEach(r => {
      if (!attMap[r.student_id]) attMap[r.student_id] = [];
      attMap[r.student_id].push(r.status);
    });

    const rows = students.map(st => {
      const subs = subMap[st.id] || [];
      const earned = subs.reduce((acc, s) => acc + s.grade, 0);
      const possible = subs.reduce((acc, s) => {
        const a = assignments.find(a => a.id === s.assignment_id);
        return acc + (a?.points || 0);
      }, 0);
      const gradePct = possible > 0 ? Math.round((earned / possible) * 100) : null;

      const att = attMap[st.id] || [];
      const totalSessions = sessionIds.length;
      const presentCount = att.filter(s => s === "present" || s === "late").length;
      const attPct = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : null;

      return { id: st.id, name: st.name, email: st.email, gradePct, attPct };
    });

    res.json({ students: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── AI Tutor (Hint-Only Mode) ────────────────────────────────────────────────
// Schema (ai_tutor_config table) lives in scripts/setup_db.js — this used to
// bootstrap itself here via a bare pool.query() fired at module load, same
// anti-pattern as posts.controller.js and attendance.controller.js before it
// (real, unmocked query the instant this module is require()'d — silently
// corrupts any test that mocks pool.query and asserts on exactly which
// queries ran, since this fires before the test body ever gets a chance to
// set that mock up).

// GET /classroom/classes/:id/ai-tutor  — teacher & student can read
exports.getAITutorConfig = async (req, res) => {
  try {
    const [[row]] = await pool.query(
      "SELECT * FROM ai_tutor_config WHERE class_id=?", [req.params.id]
    );
    res.json(row || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /classroom/classes/:id/ai-tutor  — teacher only: save config
exports.saveAITutorConfig = async (req, res) => {
  const userId = req.user.id;
  try {
    const [[cls]] = await pool.query("SELECT teacher_id FROM classes WHERE id=?", [req.params.id]);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    if (cls.teacher_id !== userId) return res.status(403).json({ error: "Teachers only" });
    const { lesson_context, homework_context, enabled } = req.body;
    await pool.query(
      `INSERT INTO ai_tutor_config (class_id, lesson_context, homework_context, enabled, created_by)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE lesson_context=VALUES(lesson_context), homework_context=VALUES(homework_context), enabled=VALUES(enabled)`,
      [req.params.id, lesson_context || "", homework_context || "", enabled !== false ? 1 : 0, userId]
    );
    const [[row]] = await pool.query("SELECT * FROM ai_tutor_config WHERE class_id=?", [req.params.id]);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /classroom/classes/:id/ai-tutor/chat  — student sends message
exports.aiTutorChat = async (req, res) => {
  try {
    const { message, history = [], lang = "en" } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    const [[config]] = await pool.query(
      "SELECT * FROM ai_tutor_config WHERE class_id=? AND enabled=1", [req.params.id]
    );

    const lessonCtx = config?.lesson_context?.trim() || "";
    const homeworkCtx = config?.homework_context?.trim() || "";

    const systemPrompt = `You are a Socratic AI Tutor for a classroom. Your role is to guide students to discover answers themselves — never give direct answers.

STRICT RULES (never break):
1. NEVER give the direct answer to any question.
2. When a student is stuck or says "I don't know": give ONE small hint or a guiding question — just enough to nudge their thinking.
3. For homework problems: ONLY give approach hints, never solve them.
4. Ask follow-up questions to check their understanding step by step.
5. Praise correct reasoning; gently redirect wrong reasoning with hints.
6. Keep hints minimal — one clue at a time.
7. Detect the student's language and always respond in the same language (Myanmar/English/Korean etc.).
8. Be warm, encouraging, and patient.

${lessonCtx ? `Current lesson context:\n${lessonCtx}` : ""}
${homeworkCtx ? `\nCurrent homework context:\n${homeworkCtx}` : ""}

Remember: you are a HINT-ONLY tutor. If a student asks for the answer directly, respond with a hint instead.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const completion = await completeText({ messages, maxTokens: 600 });
    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
