const pool = require("../../config/db");
const { completeText } = require("../../services/ai/kmateText");
// Homework Coach and the code assistant use OpenAI; only the K-Mate TOPIK parts (tutor via the Python service, practice quiz) use Claude.
const { completeText: completeCodeText } = require("../../services/ai/openaiText");

const KMATE_AI_URL = process.env.KMATE_AI_URL || "http://localhost:8082";

// POST /api/kmate/ask  { question }
// Proxies to nova-class-ai (Thine's Python FastAPI service: Gemini + ChromaDB
// RAG over the official TOPIK II exam papers) instead of the plain Groq
// completion this used to call directly — the RAG service grounds answers in
// the actual exam material instead of the model's own unaided knowledge.
exports.ask = async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "question is required" });

  try {
    const upstream = await fetch(`${KMATE_AI_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      throw new Error(`K.MATE AI service request failed: ${upstream.status} ${detail}`.slice(0, 300));
    }
    const { answer } = await upstream.json();

    // Save to history
    await pool.query(
      "INSERT INTO kmate_history (user_id, question, answer) VALUES (?, ?, ?)",
      [req.user.id, question, answer]
    );

    res.json({ answer });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

// The Code Assistant persona for kmate's second mode — deliberately never
// calls the TOPIK RAG service above (its ChromaDB collection only has TOPIK
// exam content, nothing about programming) and never hands back a working
// solution: same hint-only, self-directed-learning contract the rest of the
// app's tutoring features use (see MaterialPreview's tutorPersona and
// StudyScheduler's AIClient.TUTOR_MODE for the same pattern elsewhere).
const CODE_MENTOR_PROMPT = `You are K.Mate in Code Assistant mode — acting as a patient coding teacher, not an answer machine. Your job is to help the student learn to solve the problem themselves, one small step at a time, never to hand them a finished solution.
Absolute rules:
1. Never write the complete solution code for the student's problem, and never paste a full working answer — not even if they ask repeatedly or insist. Decline warmly each time and keep guiding instead.
2. Look at whatever the student pasted (code, error message, or question) and identify specifically where they're stuck or what's missing — react to their actual code, not a generic answer.
3. Teach with hints, not answers: start with the smallest possible nudge (a question to make them look in the right place, or the name of a concept to think about). Only go one level more specific if they say they're still stuck — and even then, still stop short of the fix itself.
4. For concept questions, a short illustrative example (1-3 lines, on a different toy example than their actual problem) is fine — never the solution to what they're actually working on.
5. If they paste an error message, explain what that error generally means and what kind of mistake usually causes it, without pointing at the exact line or exact fix.
6. Keep replies short and encouraging, like a teacher talking through a problem with a student one-on-one — not a documentation dump.`;

// Maps the frontend's Settings language code to an explicit reply-language
// instruction. Code, identifiers and JSON keys always stay in English.
const REPLY_LANGUAGES = { en: "English", my: "Burmese (မြန်မာဘာသာ)", ko: "Korean (한국어)" };
function languageRule(code) {
  const name = REPLY_LANGUAGES[code] || REPLY_LANGUAGES.en;
  return `\n\nReply language: write all explanations, hints and feedback in ${name}. Keep source code, identifiers, programming keywords and JSON keys exactly as-is (never translate them).`;
}

// POST /api/kmate/code-ask  { question }
exports.codeAsk = async (req, res) => {
  const { question, language } = req.body;
  if (!question) return res.status(400).json({ error: "question is required" });

  try {
    const completion = await completeCodeText({
      maxTokens: 1024,
      messages: [
        { role: "system", content: CODE_MENTOR_PROMPT + languageRule(language) },
        { role: "user", content: question },
      ],
    });
    const answer = completion.choices[0].message.content.trim();

    await pool.query(
      "INSERT INTO kmate_history (user_id, question, answer) VALUES (?, ?, ?)",
      [req.user.id, question, answer]
    );

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Code-only homework coach. Unlike the free-form Code Assistant, this returns
// two deliberately separate pieces of guidance: a professor-style explanation
// of the programming concept and a hint-only workspace response. The schema
// lets the frontend keep teaching on the right and the student's own work on
// the left, rather than turning into another answer-generating chat box.
const CODE_COACH_PROMPT = `You are K_MATE Homework Coach, a patient programming tutor for international
students at a Korean university.

OUTPUT LANGUAGE (most important rule):
- Write ALL explanations, hints, and feedback in {{LANGUAGE}}.
- This applies even if the student's question or code comments are written in
  another language (for example Korean). Never switch to the question's language.
- Keep these unchanged: code, function names, keywords (for, range, print),
  and error messages.
- If a technical term helps the student, you may put the Korean term in
  parentheses once, e.g. "ထပ်ခါထပ်ခါ လုပ်ခြင်း (반복문)".

TEACHING RULES:
- Do NOT give the full answer to the homework. Guide step by step.
- Give only ONE hint at a time, slightly more specific than the previous hint.
- Use simple words. The student is a beginner and not a native speaker of Korean.
- The "small example" must be a DIFFERENT example from the homework
  (different numbers), so the student still has to solve it themselves.
- When checking an attempt: first say what is correct, then point out the one
  most important problem, then give a hint. Do not rewrite the whole solution.

SKELETON CODE RULES (strict):
- "skeleton_code" is a fill-in-the-blank version of the CORRECT SOLUTION STEP
  for the CURRENT hint only, not the full solution.
- Use EXACTLY three underscores "___" for every blank. Never use "____",
  "...", "???" or "<blank>".
- Use between 1 and 3 blanks. Never leave the whole line blank.
- Keep real, valid syntax around the blanks so the filled code will run.
  Example (valid): for i in range(___, ___):\n    print(i)
- Each new hint may reveal one more piece than the previous one
  (hint level 1: 3 blanks, level 2: 2 blanks, level 3: 1 blank).
- Keep indentation with 4 spaces. Use "\n" for line breaks inside the JSON string.
- Do not put comments in Burmese or Korean inside the code.
- When checking an attempt: if the code is correct but written differently from
  the expected answer (e.g. range(1, 11) vs range(1, 10 + 1)), treat it as correct.

OUTPUT FORMAT: return JSON only, no markdown fences:
{
  "concept": "short concept name",
  "explanation": "2-3 sentences explaining the concept",
  "where_used": "1-2 sentences on when it is used",
  "example_code": "small example NOT identical to the homework",
  "hint": "ONE next hint",
  "skeleton_code": "code with blanks (___) for the student to fill in",
  "try_next": "one small task for the student"
}
All string values must be written in {{LANGUAGE}} (except code).
JSON keys stay in English.`;

const CODE_CHECK_PROMPT = `You are K_MATE Homework Coach checking a student's code attempt.

OUTPUT LANGUAGE: "feedback" and "next_hint" MUST be written in {{LANGUAGE}} — never in English unless {{LANGUAGE}} is English, even when the homework or code is in English. Only "analysis" is English. Keep code, keywords and error messages unchanged.

Decide whether the student's code correctly solves the homework as written.
- Judge by behaviour, not wording: correct code written differently from the
  expected answer (e.g. range(1, 11) vs range(1, 10 + 1)) is still correct.
- If the code is incomplete, has syntax errors, still contains "___" blanks,
  or does not do what the homework asks, it is NOT correct.
- Be strict and honest: do not mark wrong code as correct to be encouraging.

If correct: short congratulation in "feedback", "next_hint" must be "".
If not correct: say what is right so far, name the ONE most important problem,
and give ONE hint in "next_hint". Never write the full corrected solution.

- Ignore typos, missing quotes or odd grammar in the homework wording; infer the
  obvious intent (e.g. "print (hello 5 time using for loop" means: print "hello"
  5 times using a for loop).
- Style, variable names and whitespace never make code incorrect.
- "is_correct" MUST agree with your analysis and feedback. If your analysis says the
  code does what the homework asks, is_correct is true.

Return JSON only, no markdown fences. Write "analysis" FIRST (one short English
sentence: what the code does vs. what the homework asks), then decide:
{"analysis": "...", "is_correct": true | false, "feedback": "1-2 sentences", "next_hint": "one hint or empty string"}`;

const CODE_TRACE_PROMPT = `You are "K_MATE Visualizer", an AI coding coach that explains code execution step-by-step using a side-by-side view (code line tracking on the left, memory/variable state on the right).

Simulate the student's code EXACTLY as written, line by line, like a debugger.
- Do not fix the code and do not give the solution. If the code is wrong or does
  something unexpected, trace what it really does so the student can see the problem.
- Lines are numbered from 1, counting every line of the student's code including blank lines.
- Each step = exactly ONE line of code that has just finished executing, in the real
  execution order. code_line_highlighted is that line. A loop header line ("for ...:")
  gets a step each time it runs (it sets the loop variable); the body lines get their own
  steps; after the last iteration the line after the loop runs next. Never skip a line
  that executes (assignments, print, etc.) and never highlight a line that did not run.
- Use at most 14 steps: for long loops, show the first iterations and the last one, and
  say so in short_explanation.
- Worked example. Code (line 1 "total = 0", line 2 "for i in range(1, 3):",
  line 3 "    total = total + i", line 4 "print(total)") gives these steps:
  (line 1, {total:0}), (line 2, {total:0,i:1}), (line 3, {total:1,i:1}),
  (line 2, {total:1,i:2}), (line 3, {total:3,i:2}), (line 4, {total:3,i:2}, printed "3").
- memory_state maps each variable name to its value AFTER that step runs, as a string
  (e.g. {"i": "2", "total": "3"}). Use {} when nothing exists yet. Show lists as "[1, 2]".
- "printed" is the full text printed to the screen so far (empty string if nothing yet).
- short_explanation: ONE short, simple, encouraging sentence in {{LANGUAGE}}. Keep code,
  variable names and keywords unchanged.
- If the code cannot run (syntax error), return one step explaining the error in {{LANGUAGE}}.

Return JSON only, no markdown fences:
{
  "total_steps": 3,
  "steps": [
    {"current_step": 1, "code_line_highlighted": 1, "memory_state": {"i": "0"}, "printed": "", "short_explanation": "..."}
  ]
}`;

function parseTraceJson(raw, code) {
  const r = parseLooseJson(raw);
  if (!Array.isArray(r.steps) || r.steps.length === 0) throw new Error("Visualizer returned an incomplete response");
  const lineCount = code.split("\n").length;
  const steps = r.steps.slice(0, 20).map((st, i) => {
    const mem = st.memory_state && typeof st.memory_state === "object" && !Array.isArray(st.memory_state) ? st.memory_state : {};
    return {
      step: i + 1,
      line: Math.min(Math.max(parseInt(st.code_line_highlighted, 10) || 1, 1), lineCount),
      memory: Object.fromEntries(Object.entries(mem).map(([k, v]) => [String(k), String(v)])),
      printed: typeof st.printed === "string" ? st.printed : "",
      explanation: st.short_explanation || "",
    };
  });
  return { total: steps.length, steps };
}

// Models sometimes emit JSON that JSON.parse rejects: raw newlines/tabs inside
// strings (multi-line code) and stray backslashes (LaTeX like "\\times", Windows
// paths). Repair both, inside strings only.
function parseLooseJson(raw) {
  const clean = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}") + 1;
  if (start < 0 || end <= start) throw new Error("AI returned an invalid response");
  const text = clean.slice(start, end);
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
    } else if (ch === "\\") {
      const next = text[i + 1];
      const validUnicode = next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6));
      if (next !== undefined && ('"\\/bfnrt'.includes(next) || validUnicode)) {
        out += ch + next;
        i++;
      } else {
        out += "\\\\";
      }
    } else if (ch.charCodeAt(0) < 0x20) {
      out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : " ";
    } else {
      out += ch;
    }
  }
  return JSON.parse(out);
}

function parseCheckJson(raw) {
  const r = parseLooseJson(raw);
  if (typeof r.is_correct !== "boolean") throw new Error("Code check returned an incomplete response");
  return { isCorrect: r.is_correct, feedback: r.feedback || "", nextHint: r.next_hint || "" };
}

// Maps the model's flat JSON onto the { lesson, coach } shape the frontend reads.
function parseCoachJson(raw) {
  const r = parseLooseJson(raw);
  if (!r.concept || !r.hint) throw new Error("Code coach returned an incomplete response");
  return {
    lesson: {
      topic: r.concept,
      explanation: r.explanation || "",
      whereUsed: r.where_used || "",
      example: r.example_code || "",
    },
    coach: {
      hint: r.hint,
      scaffold: r.skeleton_code || "",
      nextStep: r.try_next || "",
    },
  };
}

// POST /api/kmate/code-coach { homework, code, action }
exports.codeCoach = async (req, res) => {
  const homework = (req.body.homework || "").trim();
  const code = (req.body.code || "").trim();
  const action = ["start", "hint", "check", "trace"].includes(req.body.action) ? req.body.action : "start";
  if (!homework && !code) return res.status(400).json({ error: "Paste a coding homework instruction or code first" });

  const languageName = REPLY_LANGUAGES[req.body.language] || REPLY_LANGUAGES.en;

  if (action === "trace") {
    if (!code) return res.status(400).json({ error: "Write your code first" });
    try {
      const completion = await completeCodeText({
        maxTokens: 1500,
        temperature: 0,
        model: "gpt-4o",
        messages: [
          { role: "system", content: CODE_TRACE_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
          { role: "user", content: `Student's code:\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\`` },
        ],
      });
      return res.json({ trace: parseTraceJson(completion.choices[0].message.content, code.slice(0, 4000)) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === "check") {
    if (!code) return res.status(400).json({ error: "Write your code first" });
    try {
      const completion = await completeCodeText({
        maxTokens: 500,
        temperature: 0.2,
        messages: [
          { role: "system", content: CODE_CHECK_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
          { role: "user", content: `Coding homework:\n${homework.slice(0, 5000) || "(not provided)"}\n\nStudent's code:\n\`\`\`\n${code.slice(0, 8000)}\n\`\`\`` },
        ],
      });
      const check = parseCheckJson(completion.choices[0].message.content);
      await pool.query(
        "INSERT INTO kmate_history (user_id, question, answer) VALUES (?, ?, ?)",
        [req.user.id, `[Code Coach: check] ${homework || code}`.slice(0, 10000), JSON.stringify(check)]
      );
      return res.json({ check });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const completion = await completeCodeText({
      maxTokens: 900,
      messages: [
        { role: "system", content: CODE_COACH_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
        {
          role: "user",
          content: `Action: ${action}\n\nCoding homework:\n${homework.slice(0, 5000) || "(student only provided code)"}\n\nStudent's current code:\n\`\`\`\n${code.slice(0, 8000) || "(not written yet)"}\n\`\`\``,
        },
      ],
    });
    const answer = parseCoachJson(completion.choices[0].message.content);

    await pool.query(
      "INSERT INTO kmate_history (user_id, question, answer) VALUES (?, ?, ?)",
      [req.user.id, `[Code Coach: ${action}] ${homework || code}`.slice(0, 10000), JSON.stringify(answer)]
    );

    res.json(answer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/kmate/history
exports.history = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, question, answer, created_at FROM kmate_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ---- K-Mate TOPIK practice quiz --------------------------------------------------------------
const quizStore = require("../../services/topik/quizStore");
const { typeByKey, difficultyByKey, publicOptions } = require("../../services/topik/questionTypes");

const EXPLAIN_LANGUAGE = { my: "Burmese (Myanmar)", ko: "Korean" };

// Asks the model for multiple-choice questions. `focus` is a list of weak points (e.g. "-(으)ㄴ 지 + time");
// when given, every question must test one of them, in a new sentence (not a copy of an earlier question).
async function makeQuizQuestions({ topic, count, language, focus = [], type, difficulty }) {
  const questionType = typeByKey(type);
  const level = difficultyByKey(difficulty);
  const typeRule = questionType
    ? `\nEvery question is a TOPIK II "${questionType.label}" (${questionType.ko}) question, written like the real exam: ${questionType.format}`
    : "";
  const levelRule = level ? `\nDifficulty: ${level.label} — ${level.level}` : "";
  const focusRule = focus.length
    ? `\nThe student keeps getting these points wrong, so EVERY question must test one of them (spread them out), in a NEW sentence and with different wrong options than before:\n${focus.map(f => `- ${f}`).join("\n")}\nKeep the difficulty the same or slightly easier, and make the explanation say exactly what to look for. In "weakness" copy the listed point EXACTLY as written above (same words, same language) so progress on it can be tracked.`
    : "";
  const prompt = `Generate ${count} multiple-choice Korean language quiz questions about: ${topic}.${typeRule}${levelRule}${focusRule}
Language for explanations: ${EXPLAIN_LANGUAGE[language] || "English"}.
Write the questions as plain text: no HTML tags or entities (no <u>, no &nbsp;), and show a blank as ( ).

Return ONLY valid JSON array:
[
  {
    "question": "question text in Korean or about Korean",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "answer": "A",
    "weakness": "the ONE grammar pattern or vocabulary point this question tests, in a few words (e.g. -(으)ㄴ 지 + time, 피동 표현)",
    "explanation": "why the answer is right and why a student might pick a wrong option"
  }
]`;
  const completion = await completeText({ maxTokens: 2048, messages: [{ role: "user", content: prompt }] });
  const out = completion.choices[0].message.content.trim().replace(/```json\s*/g, "").replace(/```\s*/g, "");
  const questions = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
  return questions.map(q => ({ ...q, weakness: quizStore.cleanWeakness(q.weakness) }));
}

// POST /api/kmate/quiz/generate  { topic, count, language }
exports.generateQuiz = async (req, res) => {
  const { topic = "TOPIK vocabulary", count = 5, language = "en", type, difficulty } = req.body;
  try {
    res.json({ questions: await makeQuizQuestions({ topic, count, language, type, difficulty }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/kmate/quiz/options -> { types: [{ key, label, ko, skill, description }], difficulties: [{ key, label }] }
exports.quizOptions = (req, res) => res.json(publicOptions());

// POST /api/kmate/quiz/followup  { weaknesses: ["..."], count, language }
// Practice questions aimed at the points the student just got wrong (or the ones in their weakness list).
exports.followupQuiz = async (req, res) => {
  const weaknesses = (Array.isArray(req.body.weaknesses) ? req.body.weaknesses : []).map(quizStore.cleanWeakness).filter(Boolean).slice(0, 6);
  if (weaknesses.length === 0) return res.status(400).json({ error: "weaknesses are required" });
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || weaknesses.length + 1, 2), 8);
  try {
    const questions = await makeQuizQuestions({ topic: "TOPIK II (targeted practice)", count, language: req.body.language || "en", focus: weaknesses, type: req.body.type, difficulty: req.body.difficulty });
    res.json({ questions, weaknesses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/kmate/quiz/check  { questions, answers, topic, language, kind }
// Grades the answers, stores the attempt (and each answer's weak point) and returns the detailed review.
exports.checkQuiz = async (req, res) => {
  const { questions, answers, topic, language, kind, type, difficulty } = req.body;
  if (!questions || !answers) return res.status(400).json({ error: "questions and answers are required" });

  try {
    let correct = 0;
    const results = questions.map((q, i) => {
      const isCorrect = answers[i] === q.answer;
      if (isCorrect) correct++;
      return {
        question: q.question,
        options: q.options,
        yourAnswer: answers[i],
        correctAnswer: q.answer,
        isCorrect,
        weakness: q.weakness || "",
        explanation: q.explanation,
      };
    });

    const score = Math.round((correct / questions.length) * 100);
    let attemptId = null;
    try {
      // a storage problem must not take the student's result away
      attemptId = (await quizStore.saveAttempt(pool, { userId: req.user.id, topic, language, kind, questionType: typeByKey(type)?.key, difficulty: difficultyByKey(difficulty)?.key, results })).attemptId;
    } catch (storeErr) {
      console.error("[Quiz] could not save the attempt:", storeErr.message);
    }
    res.json({ score, correct, total: questions.length, results, attemptId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/kmate/quiz/weaknesses -> { attempts, averageScore, weaknesses: [{ weakness, asked, wrong, accuracy, lastSeen }] }
exports.quizWeaknesses = async (req, res) => {
  try {
    res.json(await quizStore.weaknessSummary(pool, req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
