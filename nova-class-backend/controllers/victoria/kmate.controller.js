const pool = require("../../config/db");
const { completeText } = require("../../services/ai/kmateText");
// Homework Coach and the code assistant use OpenAI; only the K-Mate TOPIK parts (tutor via the Python service, practice quiz) use Claude.
const { getSentenceAudio, AudioRequestError } = require("../../services/topik/sentenceAudio");
const { completeText: completeCodeText } = require("../../services/ai/openaiText");
const { runJava } = require("../../services/code/javaRunner");
const { tracePython } = require("../../services/code/pythonTracer");
const { traceJs } = require("../../services/code/jsTracer");
const { traceJava } = require("../../services/code/javaTracer");
const { runNative, traceNative } = require("../../services/code/nativeCode");
const { runSql, traceSql } = require("../../services/code/sqlRunner");

// Languages whose code is really run (and stepped through) to build the trace.
const TRACERS = { python: tracePython, javascript: traceJs, java: (code, stdin) => traceJava(code, stdin), c: (code, stdin) => traceNative(code, "c", stdin), cpp: (code, stdin) => traceNative(code, "cpp", stdin), sql: (code, stdin, context) => traceSql(code, context) };
const { LESSON_LANGUAGES, replyIsInWrongLanguage } = require("../../services/lecture/languageRequest");

const KMATE_AI_URL = process.env.KMATE_AI_URL || "http://localhost:8082";

// POST /api/kmate/ask  { question }
// Proxies to nova-class-ai (Thine's Python FastAPI service: OpenAI + ChromaDB
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

// POST /api/kmate/ask/stream  { question }
// Same as ask, but relays the answer as plain text while the model is still
// writing it, so the student sees it appear instead of waiting for all of it.
// The full answer is saved to history once the stream ends.
exports.askStream = async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: "question is required" });

  // A student who leaves the page should stop the model, not keep it writing.
  const cancel = new AbortController();
  res.on("close", () => { if (!res.writableFinished) cancel.abort(); });

  let answer = "";
  try {
    const upstream = await fetch(`${KMATE_AI_URL}/ask/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: AbortSignal.any([cancel.signal, AbortSignal.timeout(180000)]),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      throw new Error(`K.MATE AI service request failed: ${upstream.status} ${detail}`.slice(0, 300));
    }

    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const decoder = new TextDecoder();
    for await (const chunk of upstream.body) {
      const text = decoder.decode(chunk, { stream: true });
      answer += text;
      res.write(text);
    }
    answer += decoder.decode();

    await pool.query(
      "INSERT INTO kmate_history (user_id, question, answer) VALUES (?, ?, ?)",
      [req.user.id, question, answer]
    );
    res.end();
  } catch (err) {
    if (cancel.signal.aborted) return;
    if (!res.headersSent) return res.status(502).json({ error: err.message });
    // Part of the answer is already on screen; say it stopped rather than end silently.
    if (!answer) res.write("⚠️ The answer could not be loaded. Please ask again.");
    res.end();
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
- A hint must be good enough that the student can actually DO the next step with it.
  In 2-4 simple sentences it says (1) WHAT to do in this step, (2) WHY, and (3) HOW:
  name the exact construct or function to use and show a tiny example of it with
  DIFFERENT values than the homework. It teaches the idea of the step without
  writing the homework's own answer. Never give a vague hint such as "think about
  loops" or "try again".
- Each hint belongs to ONE of the "how to start" steps. Look at the student's code
  to see which steps are already done and give the hint for the FIRST step that is
  not done yet (step 1 if the code is empty). Say which step it is for.
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
- Use between 1 and 3 blanks. Never leave the whole line blank. (Exception: when the request says "no blank at all", give the complete line for the current step.)
- Keep real, valid syntax around the blanks so the filled code will run.
  Example (valid): for i in range(___, ___):\n    print(i)
- Each new hint may reveal one more piece than the previous one
  (hint level 1: 3 blanks, level 2: 2 blanks, level 3: 1 blank).
- Keep indentation with 4 spaces. Use "\n" for line breaks inside the JSON string.
- Every line of skeleton_code must be real code. For the parts of the program that belong to
  LATER steps use the single word "pass" or a "# comment" — never a line of plain English such
  as "compare the elements here", because the student would run it and get a SyntaxError.
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
  "try_next": "one small task for the student",
  "language": "python | javascript | java | c | cpp | sql | other",
  "steps": ["step 1: what to do. why/how (tiny example)", "step 2: ...", "step 3: ..."],
  "concepts": [
    {"name": "short name, e.g. for loop",
     "why": "the problem it solves, as a relatable situation (2-3 sentences)",
     "before": "tiny code showing the painful way WITHOUT this construct",
     "what": "what it is, 1-2 simple sentences",
     "how": "the pattern to write, every part explained (2-3 sentences)",
     "example": "tiny code WITH the construct, NOT the homework answer",
     "mistake": "the most common beginner mistake and how to avoid it (1-2 sentences)"}
  ]
}
- "language": the programming language the homework asks for, inferred from the homework
  text or any code in it (use "python" if it is unclear). Lowercase, one of the listed values.
  "c" is only for plain C. A homework that says C++ (or cpp, 씨플러스플러스) is always "cpp", never "c".
- "steps": 4-7 steps telling the student how to do this homework from start to finish, in the
  order they should do them, in plain words, WITHOUT the homework's solution code. Each step is
  small enough to be 1-3 lines of code and is written as 2 short sentences: WHAT to do (name
  the exact construct, e.g. "create a list with square brackets", "write a for loop with
  range()"), then WHY or HOW, with a tiny example using DIFFERENT values than the homework in
  parentheses when it helps. The first step is the very first thing to write; the last step is
  running or printing the result.
  NEVER write the homework's own answer in a step: no statement or line of code that uses the
  homework's own table, column, variable or function names and values (for a "students table" homework,
  never write "CREATE TABLE students (id INT, name ...)" or "INSERT INTO students VALUES (1, 'Alice' ...)").
  Name the construct and what it is for, and if you show a tiny example, use a completely different
  subject and names (e.g. a "pets" or "cars" table) and keep it to the construct's skeleton. The student
  must still be able to write the real code themselves.
  Bad step: "Create the students table. (CREATE TABLE students (id INT, name VARCHAR(50));)".
  Good step: "Make the table with CREATE TABLE, listing each column and its type. For example a pets
  table would list a name column as text and an age column as a number."
- "concepts": 2-4 items, one for EVERY programming construct the homework needs
  (e.g. for loop, list/array, function, class, condition). Each "example" must use
  different values than the homework. Teach each one PROBLEM FIRST, the way a good
  teacher would, so the student understands why it is worth learning:
    * "why": MUST open with a direct question to the student about a concrete job, with a number
      that then grows, and answer it. Follow this shape, with the construct at hand:
        for loop: "You want to print Hello 5 times — would you write print() five times? And if
          you needed 1000 times? You would be typing all day and could easily make a mistake.
          A loop lets you write it once and just say how many times."
        list: "You need to keep 5 test scores — would you make five separate variables? What
          about 100 students? A list keeps them all under one name."
        function: "You use the same 10 lines in 20 places — would you copy them 20 times? What
          if you later find a mistake? A function lets you write them once and call them."
        condition: "A program must say pass or fail — how can it decide by itself? ..."
      Use that question-then-answer style for every construct (3-4 short sentences).
    * "before": a few lines of REAL code showing that painful manual way (for 1000 repeats
      show two or three lines and end with a "# ... and so on" comment). Different values
      than the homework.
    * "what": the idea in one or two plain sentences (include the common name, e.g.
      "repeat / 반복문").
    * "how": the pattern to write, with EVERY part named and explained in order, e.g.
      "for NAME in range(COUNT): — NAME is the counter, COUNT is how many times, the
      colon ends the line, and the indented lines below are what gets repeated".
    * "example": the same tiny task done WITH the construct (mirror "before").
    * "mistake": the one error beginners make most with it and how to spot it.
  Keep every sentence short and in simple words. Never solve the homework itself.
All string values must be written in {{LANGUAGE}} (except code).
JSON keys stay in English.`;

const CODE_CHECK_PROMPT = `You are K_MATE Homework Coach checking a student's code attempt.

OUTPUT LANGUAGE: "feedback", "where", "why" and "next_hint" MUST be written in {{LANGUAGE}} — never in English unless {{LANGUAGE}} is English, even when the homework or code is in English. Only "analysis" is English. Keep code, keywords and error messages unchanged.

You are also told what happened when the student's code just ran (its printed output
and/or the error it raised). Use it as evidence.
- If the run raised an error, the code is NOT correct: in "where" name the line number
  and quote the faulty part (e.g. "Line 3: total = totl + i"); in "why" explain in 1-2
  simple sentences what that error means and what caused it.
- If it ran but printed the wrong thing, say in "where" which part produces the wrong
  result and in "why" how the output differs from what the homework asks.
- If the code could not be run here (e.g. Java), judge it by reading it.

Decide whether the student's code correctly solves the homework as written.
- Judge by behaviour, not wording: correct code written differently from the
  expected answer (e.g. range(1, 11) vs range(1, 10 + 1)) is still correct.
- If the code is incomplete, has syntax errors, still contains "___" blanks,
  or does not do what the homework asks, it is NOT correct.
- Be strict and honest: do not mark wrong code as correct to be encouraging.

If correct: short congratulation in "feedback"; "where", "why" and "next_hint" must be "".
If not correct: "feedback" is one sentence saying what is right so far and what is not;
fill "where" and "why" as described above; give ONE hint in "next_hint". Never write the
full corrected program. The hint gets more specific each time the student fails, per the
HINT LEVEL given in the user message:
- Level 1 (first miss): a guiding question or something to compare. Do NOT state the exact
  change. e.g. "Which variable did your loop create? Look at the name inside print()."
- Level 2 (second miss): more specific. Name the exact element that is wrong and what it
  should relate to (e.g. "the name inside print() does not match the variable your for
  loop creates"), but do NOT say the replacement value and do NOT write corrected code.
- Level 3 (third miss or more): be explicit. Say exactly what to change and why, in plain
  words (e.g. "use the loop variable i instead of j"), but still do not rewrite the program.

- Ignore typos, missing quotes or odd grammar in the homework wording; infer the
  obvious intent (e.g. "print (hello 5 time using for loop" means: print "hello"
  5 times using a for loop).
- Style, variable names and whitespace never make code incorrect.
- "is_correct" MUST agree with your analysis and feedback. If your analysis says the
  code does what the homework asks, is_correct is true.

Return JSON only, no markdown fences. Write "analysis" FIRST (one short English
sentence: what the code does vs. what the homework asks), then decide:
{"analysis": "...", "is_correct": true | false, "feedback": "1 sentence", "where": "line + faulty part, or empty", "why": "1-2 sentences, or empty", "next_hint": "one hint, or empty"}`;

const CODE_TRACE_PROMPT = `You are "K_MATE Visualizer", an AI coding coach that explains code execution step-by-step using a side-by-side view (code line tracking on the left, memory/variable state on the right).

Simulate the student's code EXACTLY as written, line by line, like a debugger.
- The code can be in ANY programming language (Python, Java, JavaScript, C, C++ ...). First recognise the
  language from the code itself, then trace it by that language's own rules (for Java: start at main, class
  and method lines are not executed steps, variables have types). Never say the code "cannot be run as
  Python" or complain about its language; the language is simply whatever the code is written in.
- For SQL or other database code: one step per statement or clause that does something (CREATE, INSERT,
  each part of a SELECT such as FROM, WHERE, GROUP BY, ORDER BY). memory_state maps each table (or the
  intermediate result) to its rows as a short string, and "printed" holds the rows the query returns so far.
- For languages that are not run for you (C, C++, C#, Go, Rust, PHP, Ruby ...), trace them with the same rules
  (declared types, main(), pointers and memory as the language really behaves).
- Do not fix the code and do not give the solution. If the code is wrong or does
  something unexpected, trace what it really does so the student can see the problem.
- Lines are numbered from 1, counting every line of the student's code including blank lines.
- Each step = exactly ONE line of code that has just finished executing, in the real
  execution order. code_line_highlighted is that line. A loop header line ("for ...:")
  gets a step each time it runs (it sets the loop variable); the body lines get their own
  steps; after the last iteration the line after the loop runs next. Never skip a line
  that executes (assignments, print, etc.) and never highlight a line that did not run.
- Count first: work out the full list of executed lines. If that is 14 steps or fewer, output ALL of
  them, every iteration of every loop (a loop of 5 iterations with a header line and one body line is
  1 + 5*2 = 11 steps, so all 11 must appear). Never stop early: the last step must be the last line that
  runs, with the complete output printed so far.
- Only when the full list is longer than 14 steps: show the first iterations and the last one, and
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
- If the code cannot run because of a real error in ITS OWN language (a syntax or compile error), return one step explaining that error in {{LANGUAGE}}. A different language is never an error.

Return JSON only, no markdown fences:
{
  "total_steps": 3,
  "steps": [
    {"current_step": 1, "code_line_highlighted": 1, "memory_state": {"i": "0"}, "printed": "", "short_explanation": "..."}
  ]
}`;

const CODE_ASK_PROMPT = `You are Professor Nova, a patient programming tutor answering a student's question about their coding homework, in a chat panel beside their editor.

OUTPUT LANGUAGE: write "answer" and "hint" in {{LANGUAGE}} — never in English unless {{LANGUAGE}} is English. Keep code, keywords and error messages unchanged.

- Answer the student's actual question. If they ask where/how to start, explain the plan as 2-4 short numbered steps in plain words (what to create first, what to repeat, what to print) WITHOUT writing the solution code. Put each numbered step on its own line (use \\n between steps inside the JSON string).
- If the student's code is shown, react to it specifically.
- Never give the full homework solution, even if asked. Use simple words; the student is a beginner.
- "hint": ONE short next-step hint (empty string if the question needs none).
- "hint_code": a small fill-in-the-blank outline for the CURRENT step only (empty string if not helpful). Exactly three underscores "___" per blank, 1-3 blanks, valid syntax around them, 4-space indentation, no comments in Burmese/Korean.

Return JSON only, no markdown fences:
{"answer": "...", "hint": "...", "hint_code": "..."}`;

function parseAskJson(raw) {
  const r = parseLooseJson(raw);
  if (!r.answer) throw new Error("Professor Nova returned an incomplete response");
  return { answer: String(r.answer), hint: String(r.hint || ""), hintCode: String(r.hint_code || "") };
}

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

// Line numbers let the model point at "Line 3" accurately.
function numberLines(code) {
  return code.split("\n").map((line, i) => `${i + 1}: ${line}`).join("\n");
}

function runSummary(run) {
  if (!run || typeof run !== "object") return "(the code was not run)";
  const output = String(run.output || "").slice(0, 2000).trim();
  const error = String(run.error || "").slice(0, 1500).trim();
  if (run.notRun) return "(the code could not be run here — judge it by reading it)";
  if (run.timedOut) return "The program was stopped after 10 seconds (probably an infinite loop).";
  return [`Printed output:\n${output || "(nothing)"}`, error ? `Error raised:\n${error}` : "No error was raised."].join("\n");
}

function parseCheckJson(raw) {
  const r = parseLooseJson(raw);
  if (typeof r.is_correct !== "boolean") throw new Error("Code check returned an incomplete response");
  return {
    isCorrect: r.is_correct,
    feedback: r.feedback || "",
    where: r.is_correct ? "" : String(r.where || ""),
    why: r.is_correct ? "" : String(r.why || ""),
    nextHint: r.is_correct ? "" : String(r.next_hint || ""),
  };
}

const LANGUAGE_ALIASES = { js: "javascript", node: "javascript", "c++": "cpp", py: "python" };
const KNOWN_LANGUAGES = new Set(["python", "javascript", "java", "c", "cpp", "sql"]);

function normalizeLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  const name = LANGUAGE_ALIASES[key] || key;
  return KNOWN_LANGUAGES.has(name) ? name : "";
}

// Maps the model's flat JSON onto the { lesson, coach } shape the frontend reads.
function parseCoachJson(raw) {
  const r = parseLooseJson(raw);
  // The hint is the one thing every reply must have. The concept name is only a label (a
  // hint-only request legitimately leaves it out), so fall back to the first concept card.
  if (!r.hint) throw new Error("Code coach returned an incomplete response");
  if (!r.concept) r.concept = (Array.isArray(r.concepts) && r.concepts[0]?.name) || "—";
  const concepts = (Array.isArray(r.concepts) ? r.concepts : [])
    .filter(c => c && c.name)
    .slice(0, 5)
    .map(c => ({
      name: String(c.name),
      why: String(c.why || ""),
      before: String(c.before || ""),
      what: String(c.what || ""),
      how: String(c.how || ""),
      example: String(c.example || ""),
      mistake: String(c.mistake || ""),
    }));
  if (concepts.length === 0) {
    concepts.push({ name: r.concept, why: "", before: "", what: r.explanation || "", how: r.where_used || "", example: r.example_code || "", mistake: "" });
  }
  return {
    lesson: {
      topic: r.concept,
      explanation: r.explanation || "",
      whereUsed: r.where_used || "",
      example: r.example_code || "",
      concepts,
      language: normalizeLanguage(r.language),
      steps: (Array.isArray(r.steps) ? r.steps : []).map(x => String(x).trim()).filter(Boolean).slice(0, 8),
    },
    coach: {
      hint: r.hint,
      scaffold: r.skeleton_code || "",
      nextStep: r.try_next || "",
    },
  };
}

// Is the student's new message a NEW homework problem, or something about the one they are
// already working on? Decided here (not guessed by the browser) because the wording gives
// no reliable clue: "print hello 3 times" is a task, "how do I print three times?" is a
// question about the current task.
const CODE_CLASSIFY_PROMPT = `A student is working on a coding homework with an AI tutor. They have just sent a new message.
Decide whether the message is:
  (A) a NEW coding homework problem — a self-contained task to solve, a different one from the current homework
      (e.g. "Write a program that prints hello 3 times", "print hello 3 times use for loop", "리스트를 정렬하세요"), or
  (B) about the CURRENT homework — asking for help, a hint or an explanation, saying they are stuck, asking what a
      line or error means, asking a general programming question, chatting, or asking about their own code.
A question addressed to the tutor ("how do I...", "why...", "what does...", "I am stuck") is (B), even if it mentions
the same topic. A task statement that differs from the current homework is (A). If you are not sure, answer (B).
Reply with ONLY JSON: {"new_problem": true} for (A) or {"new_problem": false} for (B).`;

const CODE_REVIEW_PROMPT = `You are a senior engineer doing a friendly peer code review for a student. Review the student's code for professional quality: style guide compliance (PEP 8 for Python; the language's standard conventions otherwise), naming, function size and structure, duplication, comments/docstrings, and readability. Do NOT rewrite the whole solution and do not just hand over the homework answer; point at specific lines and show small before/after fixes.
Reply with ONLY JSON:
{"score": <0-100 integer>, "summary": "<1-2 sentence overall verdict>", "praise": ["<what is done well>"], "issues": [{"line": <line number or 0>, "category": "style"|"naming"|"structure"|"clarity"|"correctness", "severity": "info"|"warn"|"error", "message": "<what is wrong and why it matters>", "suggestion": "<short corrected snippet or advice>"}]}
Give at most 8 issues, most important first. Write every string in {{LANGUAGE}}. Code and identifiers stay as they are.`;

function parseReviewJson(raw) {
  const r = parseLooseJson(raw);
  const categories = new Set(["style", "naming", "structure", "clarity", "correctness"]);
  const severities = new Set(["info", "warn", "error"]);
  const issues = (Array.isArray(r.issues) ? r.issues : [])
    .filter(i => i && i.message)
    .slice(0, 8)
    .map(i => ({
      line: Math.max(parseInt(i.line, 10) || 0, 0),
      category: categories.has(i.category) ? i.category : "style",
      severity: severities.has(i.severity) ? i.severity : "info",
      message: String(i.message),
      suggestion: String(i.suggestion || ""),
    }));
  const score = Math.min(Math.max(parseInt(r.score, 10) || 0, 0), 100);
  if (!r.summary && issues.length === 0) throw new Error("Code review returned an empty response");
  return {
    score,
    summary: String(r.summary || ""),
    praise: (Array.isArray(r.praise) ? r.praise : []).map(x => String(x)).filter(Boolean).slice(0, 4),
    issues,
  };
}

// The model sometimes answers in the language of the HOMEWORK (a Korean problem → Korean
// explanations) instead of the language the student chose, even though it is told which one
// to use. So the reply is checked by its script, and when it is clearly in the wrong language
// the model is asked once to write the same JSON again in the right one.
async function completeInLanguage(request, languageCode) {
  const first = await completeCodeText(request);
  const text = first.choices?.[0]?.message?.content || "";
  if (!LESSON_LANGUAGES[languageCode] || !replyIsInWrongLanguage(text, languageCode)) return first;
  try {
    const name = LESSON_LANGUAGES[languageCode];
    const retry = await completeCodeText({
      ...request,
      messages: [
        ...request.messages,
        { role: "assistant", content: text },
        { role: "user", content: `That answer is not written in ${name}. Write it again with exactly the same JSON structure, but every string value (explanations, hints, steps, feedback) must be in ${name}; only code stays as it is.` },
      ],
    });
    if (!replyIsInWrongLanguage(retry.choices?.[0]?.message?.content || "", languageCode)) return retry;
  } catch {
    // keep the first answer rather than fail the student's request
  }
  return first;
}

// Python, JavaScript and Java are traced by really running them (see the *Tracer services), so every iteration is shown. The model only
// writes the one-line explanation of each step. Long runs keep the first steps and the last ones.
const TRACE_KEEP_HEAD = 30;
const TRACE_KEEP_TAIL = 6;
async function traceByRunning(codeLanguage, code, stdin, context, languageName, languageCode) {
  const run = await TRACERS[codeLanguage](code, stdin, context);
  let steps = run.steps;
  if (steps.length === 0) return null;
  let skipped = 0;
  if (steps.length > TRACE_KEEP_HEAD + TRACE_KEEP_TAIL) {
    skipped = steps.length - TRACE_KEEP_HEAD - TRACE_KEEP_TAIL;
    steps = [...steps.slice(0, TRACE_KEEP_HEAD), ...steps.slice(-TRACE_KEEP_TAIL)];
  }
  const lines = code.split("\n");
  const listing = steps.map((st, i) => `${i + 1}. line ${st.line}: ${(st.text ? st.text.replace(/\s+/g, " ").slice(0, 160) : lines[st.line - 1].trim())} | variables: ${JSON.stringify(st.memory)} | printed so far: ${JSON.stringify(st.printed.slice(-80))}`).join("\n");
  let explanations = [];
  try {
    const completion = await completeInLanguage({
      maxTokens: 3000,
      temperature: 0,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: `You explain a program run to a beginner. For EACH numbered step write ONE short, simple sentence in ${languageName} saying what that line just did (use the variable values given). Keep code, variable names and keywords unchanged. Return JSON only: {"explanations": ["...", "..."]} with exactly one string per step, in order.` },
        { role: "user", content: `Code:\n\`\`\`\n${code}\n\`\`\`\n\nSteps:\n${listing}` },
      ],
    }, languageCode);
    const parsed = parseLooseJson(completion.choices[0].message.content);
    if (Array.isArray(parsed.explanations)) explanations = parsed.explanations;
  } catch {
    // the steps are still correct without the sentences
  }
  const out = steps.map((st, i) => ({
    step: i + 1,
    line: st.line,
    memory: st.memory,
    printed: st.printed,
    explanation: String(explanations[i] || st.error || (i === steps.length - 1 && run.error ? run.error : "")),
  }));
  if (run.error && !out.at(-1).explanation) out.at(-1).explanation = run.error;
  if (skipped > 0) out[TRACE_KEEP_HEAD - 1].explanation += ` (… ${skipped} steps skipped …)`;
  return { total: out.length, steps: out };
}

// POST /api/kmate/run-java { code, stdin } → { ok, output, error, timedOut? }
exports.runJavaCode = async (req, res) => {
  try {
    res.json(await runJava(req.body.code, req.body.stdin));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/kmate/run-native { code, language: "c" | "cpp", stdin } → { ok, output, error, timedOut? }
exports.runNativeCode = async (req, res) => {
  try {
    const language = req.body.language === "c" ? "c" : "cpp";
    res.json(await runNative(req.body.code, language, req.body.stdin));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/kmate/run-sql { code, context } → { ok, output, error, timedOut? }; `context` = SQL of the earlier cells
exports.runSqlCode = async (req, res) => {
  try {
    res.json(await runSql(req.body.code, req.body.context));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// A step "leaks" the answer when it contains a piece of code (a call, a statement, a semicolon-ended line)
// that uses one of the homework's own identifiers, e.g. "INSERT INTO students ..." for a "students" homework.
const GENERIC_WORDS = new Set(["create", "table", "select", "insert", "into", "values", "from", "where", "print", "range", "name", "type", "text", "value", "list", "string", "number", "numbers", "data", "program", "write", "make", "show", "update", "delete", "using", "that", "with", "each", "have", "your", "this", "then", "loop", "function", "class", "output", "input", "index", "order", "group", "limit", "count", "true", "false", "none", "null", "main", "void", "static", "public", "int", "float", "double", "char", "bool"]);
function stepLeaksAnswer(step, homework) {
  const words = new Set((String(homework).match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) || []).map(w => w.toLowerCase()).filter(w => !GENERIC_WORDS.has(w)));
  if (words.size === 0) return false;
  const fragments = String(step).match(/[A-Za-z_][\w.]*\s*\([^()]*\)|\b(?:CREATE|INSERT|SELECT|UPDATE|DELETE|print|for|while|def|let|const|var|int|String)\b[^.\n]*[;)]/gi) || [];
  return fragments.some(fragment => (fragment.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) || []).some(w => words.has(w.toLowerCase())));
}

// POST /api/kmate/code-coach { homework, code, action }
exports.codeCoach = async (req, res) => {
  const homework = (req.body.homework || "").trim();
  const code = (req.body.code || "").trim();
  const action = ["start", "hint", "check", "trace", "ask", "review", "classify"].includes(req.body.action) ? req.body.action : "start";
  if (!homework && !code) return res.status(400).json({ error: "Paste a coding homework instruction or code first" });

  const languageName = REPLY_LANGUAGES[req.body.language] || REPLY_LANGUAGES.en;

  if (action === "classify") {
    const question = (req.body.question || "").trim().slice(0, 1000);
    if (!question) return res.status(400).json({ error: "Write your message first" });
    if (!homework) return res.json({ newProblem: false });
    try {
      const completion = await completeInLanguage({
        maxTokens: 30,
        temperature: 0,
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: CODE_CLASSIFY_PROMPT },
          { role: "user", content: `Current homework:\n${homework.slice(0, 1500)}\n\nStudent's new message:\n${question}` },
        ],
      }, req.body.language);
      const parsed = parseLooseJson(completion.choices[0].message.content);
      return res.json({ newProblem: parsed.new_problem === true });
    } catch {
      // Not being able to tell is not worth failing over: treat it as an ordinary question.
      return res.json({ newProblem: false });
    }
  }

  if (action === "ask") {
    const question = (req.body.question || "").trim().slice(0, 1000);
    if (!question) return res.status(400).json({ error: "Write your question first" });
    if (!homework && !code) return res.status(400).json({ error: "Write the homework first" });
    const earlier = (Array.isArray(req.body.chat) ? req.body.chat : [])
      .slice(-3)
      .map(turn => `Student: ${String(turn.q || "").slice(0, 400)}\nProfessor Nova: ${String(turn.a || "").slice(0, 600)}`)
      .join("\n\n");
    try {
      const completion = await completeInLanguage({
        maxTokens: 700,
        temperature: 0.3,
        messages: [
          { role: "system", content: CODE_ASK_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
          { role: "user", content: `Coding homework:\n${homework.slice(0, 5000) || "(not provided)"}\n\nStudent's current code:\n\`\`\`\n${code.slice(0, 4000) || "(not written yet)"}\n\`\`\`${earlier ? `\n\nEarlier in this chat:\n${earlier}` : ""}\n\nStudent's question: ${question}` },
        ],
      }, req.body.language);
      const ask = parseAskJson(completion.choices[0].message.content);
      await pool.query(
        "INSERT INTO kmate_history (user_id, question, answer) VALUES (?, ?, ?)",
        [req.user.id, `[Code Coach: ask] ${question}`.slice(0, 10000), JSON.stringify(ask)]
      );
      return res.json({ ask });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === "trace") {
    if (!code) return res.status(400).json({ error: "Write your code first" });
    try {
      if (TRACERS[req.body.codeLanguage]) {
        const real = await traceByRunning(req.body.codeLanguage, code.slice(0, 4000), String(req.body.stdin || ""), String(req.body.context || ""), languageName, req.body.language).catch(() => null);
        if (real) return res.json({ trace: real });
      }
      const completion = await completeInLanguage({
        maxTokens: 3000,
        temperature: 0,
        model: "gpt-4o",
        messages: [
          { role: "system", content: CODE_TRACE_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
          { role: "user", content: `Student's code:\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\`` },
        ],
      }, req.body.language);
      return res.json({ trace: parseTraceJson(completion.choices[0].message.content, code.slice(0, 4000)) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === "review") {
    if (!code) return res.status(400).json({ error: "Write your code first" });
    try {
      const completion = await completeInLanguage({
        maxTokens: 1200,
        temperature: 0.2,
        messages: [
          { role: "system", content: CODE_REVIEW_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
          { role: "user", content: `Coding homework:\n${homework.slice(0, 3000) || "(not provided)"}\n\nStudent's code:\n\`\`\`\n${numberLines(code.slice(0, 8000))}\n\`\`\`` },
        ],
      }, req.body.language);
      return res.json({ review: parseReviewJson(completion.choices[0].message.content) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === "check") {
    if (!code) return res.status(400).json({ error: "Write your code first" });
    const hintLevel = Math.min(Math.max(parseInt(req.body.attempt, 10) || 1, 1), 3);
    // In a notebook a cell builds on the cells above it (a table created, a variable set): that code is
    // background, not part of what is being judged.
    const earlierCells = String(req.body.context || "").trim().slice(0, 4000);
    const checkContext = earlierCells
      ? `\n\nEarlier cells of the notebook, already run before this one. What they created exists for this cell; do NOT say something they already did is missing. If the cell above is fine but the problem was caused by one of the earlier cells (for example a row inserted twice), say so in plain words ("a cell above ...") and leave "where" empty: "where" may only quote a line of the cell being judged, never a line of another cell. Judge the cell below:\n\`\`\`\n${earlierCells}\n\`\`\``
      : "";
    try {
      const completion = await completeInLanguage({
        maxTokens: 700,
        temperature: 0.2,
        messages: [
          { role: "system", content: CODE_CHECK_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
          { role: "user", content: `Coding homework:\n${homework.slice(0, 5000) || "(not provided)"}\n\nStudent's code (the cell being judged):\n\`\`\`\n${numberLines(code.slice(0, 8000))}\n\`\`\`${checkContext}\n\nWhat happened when it ran:\n${runSummary(req.body.run)}\n\nHINT LEVEL: ${hintLevel}\n\nWrite "feedback", "where", "why" and "next_hint" in ${languageName} (the student's language), not in English unless that is ${languageName}.` },
        ],
      }, req.body.language);
      const check = parseCheckJson(completion.choices[0].message.content);
      check.hintLevel = check.isCorrect ? 0 : hintLevel;
      await pool.query(
        "INSERT INTO kmate_history (user_id, question, answer) VALUES (?, ?, ?)",
        [req.user.id, `[Code Coach: check] ${homework || code}`.slice(0, 10000), JSON.stringify(check)]
      );
      return res.json({ check });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // A "next hint" has to move the student FORWARD. The model can only do that if it
  // knows what it has already said, so the hints given so far (oldest first) are sent
  // along and it is told which hint number this one is.
  const earlierHints = Array.isArray(req.body.hints)
    ? req.body.hints.map(h => String(h || "").trim().slice(0, 400)).filter(Boolean).slice(-12)
    : [];
  const howToStart = Array.isArray(req.body.steps)
    ? req.body.steps.map(x => String(x || "").trim().slice(0, 400)).filter(Boolean).slice(0, 8)
    : [];
  const stepsContext = action === "hint" && howToStart.length > 0
    ? `\n\nThe "how to start" steps the student was given:\n${howToStart.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nGive the hint for the first step the student's code has not done yet, and say which step number it is.`
    : "";
  // Each further hint is clearly more explicit than the last: by hint 4 the student is told the
  // exact line for the current step (never the whole program).
  const hintNumber = earlierHints.length + 1;
  const hintStrength = hintNumber === 2
    ? "Name the exact tool (function, keyword or operator) to use for this step and say what to put in it, in plain words. Skeleton: 2 blanks."
    : hintNumber === 3
      ? "Show the line for this step almost completely and explain each part of it; only one small value is left for the student. Skeleton: 1 blank."
      : "The student is clearly stuck. Give the EXACT line(s) of code for the current step, with a short explanation of why each part is there. Skeleton: no blank at all (the full line for this step only). Still do not write the other steps.";
  const hintInstruction = action === "hint" && earlierHints.length > 0
    ? `\n\nHints already given to the student (oldest first):\n${earlierHints.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nThis is hint number ${hintNumber}. The student is still stuck, so this hint must be clearly MORE obvious and concrete than the last one, never repeating or rephrasing an earlier hint. ${hintStrength}${stepsContext}`
    : stepsContext;

  // A hint request only needs the hint: the guide and concept cards were already made when the
  // problem started and are not shown again, so they are not written again (faster, cheaper).
  const hintOnly = action === "hint"
    ? `\n\nThis request is only for the next hint. Fill "hint", "skeleton_code" and "try_next" carefully. Still return every field of the JSON (never leave one out), but for "steps" and "concepts" use empty arrays and keep "concept", "explanation", "where_used" and "example_code" to a few words.`
    : "";

  try {
    // JSON mode makes the model return valid JSON (an unescaped quote in a code sample used to break
    // parsing); if it still fails to parse, ask once more before giving up.
    const request = {
      maxTokens: 3000,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: CODE_COACH_PROMPT.replaceAll("{{LANGUAGE}}", languageName) },
        {
          role: "user",
          content: `Action: ${action}\n\nCoding homework:\n${homework.slice(0, 5000) || "(student only provided code)"}\n\nStudent's current code:\n\`\`\`\n${code.slice(0, 8000) || "(not written yet)"}\n\`\`\`${hintInstruction}${hintOnly}`,
        },
      ],
    };
    let answer;
    try {
      answer = parseCoachJson((await completeInLanguage(request, req.body.language)).choices[0].message.content);
    } catch (parseErr) {
      if (!/JSON|invalid|incomplete/i.test(parseErr.message)) throw parseErr;
      answer = parseCoachJson((await completeInLanguage(request, req.body.language)).choices[0].message.content);
    }

    // The "how to start" steps must not hand over the homework's own code, and must be in the chosen
    // language (the whole-reply language check can pass while only the steps drifted); ask once more if not.
    if (action === "start") {
      // (a whole reply in the wrong language was already rewritten once above; this catches only the steps drifting)
      const wholeReplyOk = !replyIsInWrongLanguage(JSON.stringify(answer), req.body.language);
      const wrongLanguage = wholeReplyOk && LESSON_LANGUAGES[req.body.language] && replyIsInWrongLanguage(answer.lesson.steps.join(" "), req.body.language);
      const leaks = answer.lesson.steps.filter(step => stepLeaksAnswer(step, homework));
      if (leaks.length > 0 || wrongLanguage) {
        const complaints = [
          leaks.length ? `These "how to start" steps give away the homework's own code (they use its table, column, variable or function names):\n${leaks.map(x => `- ${x}`).join("\n")}\nIn "steps" never write a statement or line of code that uses the homework's own names and values; name the construct and what it is for, and if you show an example use a completely different subject (e.g. pets or cars).` : "",
          wrongLanguage ? `The "steps" are not written in ${languageName}; every step must be written in ${languageName} (only code stays as it is).` : "",
        ].filter(Boolean).join("\n");
        try {
          const retry = await completeInLanguage({
            ...request,
            messages: [...request.messages, { role: "user", content: `${complaints}\nWrite the whole JSON again with the same structure and keep everything else as it was.` }],
          }, req.body.language);
          const again = parseCoachJson(retry.choices[0].message.content);
          const againLeaks = again.lesson.steps.filter(step => stepLeaksAnswer(step, homework)).length;
          const againWrong = LESSON_LANGUAGES[req.body.language] && replyIsInWrongLanguage(again.lesson.steps.join(" "), req.body.language);
          if (againLeaks + (againWrong ? 1 : 0) < leaks.length + (wrongLanguage ? 1 : 0)) answer = again;
        } catch {
          // keep the first answer rather than fail the student's request
        }
      }
    }

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
const { domainByKey, rangeByKey, rangesForQuestionSpan, rangeForQuestionNumber } = require("../../services/topik/questionRanges");
const { patternFor } = require("../../services/topik/rangePatterns");
const questionBank = require("../../services/topik/questionBank");const guides = require("../../services/topik/guides");

const EXPLAIN_LANGUAGE = { my: "Burmese (Myanmar)", ko: "Korean", vi: "Vietnamese" };

// Asks the model for multiple-choice questions. `focus` is a list of weak points (e.g. "-(으)ㄴ 지 + time");
// when given, every question must test one of them, in a new sentence (not a copy of an earlier question).
// One request to the model for a few questions. (makeQuizQuestions below cuts a big set into several of these.)
async function makeQuizBatch({ topic, count, language, focus = [], type, difficulty, domain, range, startQuestion, endQuestion }) {
  const questionCount = Math.min(Math.max(parseInt(count, 10) || 5, 1), 50);
  const questionType = typeByKey(type);
  const examDomain = domainByKey(domain);
  const examRange = examDomain && rangeByKey(domain, range);
  const spanRanges = examDomain && rangesForQuestionSpan(domain, startQuestion, endQuestion);
  // One question for every number of the span (e.g. 읽기 1~6 -> 6 questions): each number is written in the pattern of ITS part of the
  // real exam, in order, and comes back with its number. Any other count is spread over the patterns of the span.
  const oneEach = spanRanges && Number(endQuestion) - Number(startQuestion) + 1 === questionCount;
  const numberPatterns = oneEach
    ? Array.from({ length: questionCount }, (_, i) => { const n = Number(startQuestion) + i; const r = rangeForQuestionNumber(domain, n); return `- ${examDomain.ko} ${n}번 → ${r ? `${r.range}번 pattern: ${r.ko}. How it is written: ${patternFor(r.key)}` : "the pattern of that part of the exam"}`; })
    : [];
  const spanRule = spanRanges
    ? oneEach
      ? `\nStudent-selected question numbers: ${examDomain.ko} ${Number(startQuestion) === Number(endQuestion) ? startQuestion : `${startQuestion}~${endQuestion}`}번. Write exactly ONE question for each number, in this order, and write each one the way that number is asked in the real TOPIK II exam (its instruction, its text type, its difficulty):\n${numberPatterns.join("\n")}\nPut the number in "number". Do not copy a past exam question.`
      : `\nStudent-selected question span: ${examDomain.ko} ${startQuestion}~${endQuestion}번. It contains these official TOPIK question patterns:\n${spanRanges.map(r => `- ${r.range}번 — ${r.ko}. How it is written: ${patternFor(r.key)}`).join("\n")}\nDistribute the ${questionCount} new questions across these matching patterns. Every question must follow one of them; do not copy a past exam question.`
    : "";
  const domainRule = examDomain
    ? `\nExam domain: ${examDomain.ko} (${examDomain.label}). ${examDomain.rule}${spanRule || (examRange ? `\nTarget question range: ${examDomain.ko} ${examRange.range}번 — ${examRange.ko}.${patternFor(examRange.key) ? ` How it is written: ${patternFor(examRange.key)}` : ""} ${examRange.focus ? `Focus of this part: ${examRange.focus}. Match the style, length and difficulty of that part of the real TOPIK II exam.` : "Write the questions exactly in the pattern of that part of the real TOPIK II exam."}` : "")}`
    : "";
  const level = difficultyByKey(difficulty);
  const typeRule = questionType
    ? `\nEvery question is a TOPIK II "${questionType.label}" (${questionType.ko}) question, written like the real exam: ${questionType.format}${questionType.styleRules ? `\n${questionType.styleRules}` : ""}${questionType.levelNotes?.[level?.key] ? `\n${questionType.levelNotes[level.key]}` : ""}`
    : "";
  const levelRule = level ? `\nDifficulty: ${level.label} — ${level.level}` : "";
  const focusRule = focus.length
    ? `\nThe student keeps getting these points wrong, so EVERY question must test one of them (spread them out), in a NEW sentence and with different wrong options than before:\n${focus.map(f => `- ${f}`).join("\n")}\nKeep the difficulty the same or slightly easier, and make the explanation say exactly what to look for. In "weakness" copy the listed point EXACTLY as written above (same words, same language) so progress on it can be tracked.`
    : "";
  const prompt = `You are the "Smart Drill" engine of a TOPIK preparation platform. Generate ${questionCount} brand-new, customized multiple-choice practice questions about: ${topic}, following the official TOPIK exam patterns.${typeRule}${domainRule}${levelRule}${focusRule}

Rules:
1. Do NOT copy past exam questions. Write NEW, original questions that test the same grammar rule, vocabulary or reading pattern.
2. Make the difficulty match the real TOPIK exam.
3. Give 4 options: 1 correct answer and 3 natural distractors (wrong options that a real student could be tempted by).
4. Write a clear, easy explanation for foreign students: why the correct answer is right AND why each wrong option is wrong.
5. Add one short practical test-taking tip (실전 꿀팁) for this kind of question.
6. Return exactly ${questionCount} questions.
Language for explanations and tips: ${EXPLAIN_LANGUAGE[language] || "English"}. Keep the Korean sentences, grammar patterns and options in Korean.
Write the questions as plain text: no HTML tags or entities (no <u>, no &nbsp;), and show a blank as ( ).
For an exam domain, "question" holds ONLY the official instruction line of that part of the exam (for example 다음을 순서에 맞게 배열한 것을 고르십시오.): no ※, no question numbers and no extra notes in brackets; everything the student must read or hear goes in "passage".

Return ONLY valid JSON array:
[
  {
    "domain": "${examDomain ? examDomain.ko : ""}",${oneEach ? '\n    "number": the question number from the list above (an integer),' : ""}
    "passage": "${examDomain ? "the Korean reading text or listening script the question is about" : "leave empty unless the question needs a short text"}",
    "question": "question text in Korean or about Korean",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "answer": "A",
    "weakness": "the ONE grammar pattern or vocabulary point this question tests, in a few words (e.g. -(으)ㄴ 지 + time, 피동 표현)",
    "explanation": "why the answer is right, and why each of the other options is wrong",
    "tip": "one short practical tip for answering this kind of question in the exam"
  }
]`;
  const ask = async () => {
    const completion = await completeText({ maxTokens: Math.min(Math.max(questionCount * 700, 2800), 16000), messages: [{ role: "user", content: prompt }] });
    const out = completion.choices[0].message.content.trim().replace(/```json\s*/g, "").replace(/```\s*/g, "");
    return JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
  };
  let questions;
  try { questions = await ask(); } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    console.error("[Quiz] the model's answer was not valid JSON, asking once more:", err.message);
    questions = await ask();                                   // an answer cut off or with a stray quote: one more try
  }
  return questions.map((q, i) => ({ ...q, ...(oneEach ? { number: Number.isInteger(Number(q.number)) && Number(q.number) > 0 ? Number(q.number) : Number(startQuestion) + i } : {}), domain: examDomain?.key || "", passage: String(q.passage || "").trim(), weakness: quizStore.cleanWeakness(q.weakness), tip: String(q.tip || "").trim() }));
}

// POST /api/kmate/quiz/generate  { topic, count, language }
// How many questions one request to the model asks for: with a passage or script each question is long, and a request for
// 50 of them came back cut off and unreadable (JSON error after ~2 minutes), so a big set is cut into smaller requests.
const BATCH_SIZE = { withPassage: 5, listening: 3, plain: 10 };     // a listening script is long: fewer questions per request keep each answer short and valid
const batchSizeFor = domain => (domain === "listening" ? BATCH_SIZE.listening : domainByKey(domain) ? BATCH_SIZE.withPassage : BATCH_SIZE.plain);
const PARALLEL_BATCHES = 3;

async function generateQuestions(args) {
  const total = Math.min(Math.max(parseInt(args.count, 10) || 5, 1), 50);
  const size = batchSizeFor(args.domain);
  if (total <= size) return makeQuizBatch({ ...args, count: total });

  // If the student asked for exactly one question per number of the chosen span (e.g. 읽기 1~30 -> 30), each batch gets its own
  // slice of the span, so the questions follow the real order of the exam.
  const start = Number(args.startQuestion), end = Number(args.endQuestion);
  const bySpan = Number.isInteger(start) && Number.isInteger(end) && end - start + 1 === total;
  const batches = [];
  for (let done = 0; done < total; done += size) {
    const n = Math.min(size, total - done);
    batches.push({ ...args, count: n, ...(bySpan ? { startQuestion: start + done, endQuestion: start + done + n - 1 } : {}) });
  }
  const results = new Array(batches.length);
  let next = 0;
  const worker = async () => { while (next < batches.length) { const i = next++; results[i] = await makeQuizBatch(batches[i]); } };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker));
  return results.flat();
}

// One question for every number of an exam section is served from the bank when it has them (no waiting for the model); only
// the numbers it does not have yet are written by the model and stored. Numbers that are thin in the bank are topped up in the
// background so the next student gets a different question. Anything else (topic quiz, weak-point practice, a chosen question type)
// is not banked.
const topUpRunning = new Set();
const runs = numbers => numbers.reduce((out, n) => { const last = out[out.length - 1]; if (last && last[last.length - 1] === n - 1) last.push(n); else out.push([n]); return out; }, []);
const generateRuns = (args, numbers) => Promise.all(runs(numbers).map(run => generateQuestions({ ...args, count: run.length, startQuestion: run[0], endQuestion: run[run.length - 1] }))).then(r => r.flat());

async function makeQuizQuestions(args) {
  const total = Math.min(Math.max(parseInt(args.count, 10) || 5, 1), 50);
  const start = Number(args.startQuestion), end = Number(args.endQuestion);
  const banked = domainByKey(args.domain) && !args.type && !(args.focus && args.focus.length)
    && Number.isInteger(start) && Number.isInteger(end) && end - start + 1 === total;
  if (!banked) return generateQuestions(args);

  const numbers = Array.from({ length: total }, (_, i) => start + i);
  const key = { domain: args.domain, difficulty: args.difficulty || "", language: args.language || "en" };
  let picked = new Map(), counts = new Map();
  try { ({ picked, counts } = await questionBank.pick(pool, { ...key, numbers })); }
  catch (err) { console.error("[Quiz] question bank unavailable:", err.message); return generateQuestions(args); }

  const missing = numbers.filter(n => !picked.has(n));
  const made = missing.length ? await generateRuns(args, missing) : [];
  const store = made.length ? questionBank.save(pool, { ...key, questions: made }).catch(err => console.error("[Quiz] could not store the questions:", err.message)) : Promise.resolve();
  const byNumber = new Map([...picked, ...made.map(q => [q.number, q])]);

  // a thin number gets one more question in the background (a few at a time, never twice at once)
  const thin = numbers.filter(n => (counts.get(n) || 0) + (missing.includes(n) ? 1 : 0) < questionBank.TARGET_PER_NUMBER)
    .filter(n => !topUpRunning.has(`${key.domain}|${n}|${key.difficulty}|${key.language}`)).slice(0, 5);
  if (thin.length && process.env.QUESTION_BANK_TOPUP !== "off") {
    const tags = thin.map(n => `${key.domain}|${n}|${key.difficulty}|${key.language}`);
    tags.forEach(t => topUpRunning.add(t));
    exports._topUp = store.then(() => generateRuns(args, thin)).then(more => questionBank.save(pool, { ...key, questions: more }))
      .catch(err => console.error("[Quiz] background top-up failed:", err.message))
      .finally(() => tags.forEach(t => topUpRunning.delete(t)));
  }
  await store;
  return numbers.map(n => byNumber.get(n)).filter(Boolean);
}

// Writes and stores questions for these numbers ahead of time (scripts/warm_question_bank.js); returns how many were stored.
exports.fillQuestionBank = async ({ domain, difficulty = "", language = "en", numbers }) => {
  // each batch is stored on its own, so one broken answer from the model does not throw away the others
  const base = { topic: "TOPIK II", language, difficulty, domain };
  const batches = [];
  for (const run of runs(numbers)) for (let i = 0; i < run.length; i += batchSizeFor(domain)) {
    const part = run.slice(i, i + batchSizeFor(domain));
    batches.push({ ...base, count: part.length, startQuestion: part[0], endQuestion: part[part.length - 1] });
  }
  let stored = 0, failure = null;
  const worker = async () => {
    while (batches.length) {
      const batch = batches.shift();
      try {
        const made = await makeQuizBatch(batch);
        await questionBank.save(pool, { domain, difficulty, language, questions: made });
        stored += made.filter(questionBank.isStorable).length;
      } catch (err) { failure = err; }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_BATCHES }, worker));
  if (!stored && failure) throw failure;
  return stored;
};

exports.generateQuiz = async (req, res) => {
  const { topic = "TOPIK vocabulary", count = 5, language = "en", type, difficulty, domain, range, startQuestion, endQuestion } = req.body;
  try {
    res.json({ questions: await makeQuizQuestions({ topic, count, language, type, difficulty, domain, range, startQuestion, endQuestion }) });
  } catch (err) {
    console.error("[Quiz] could not make the questions:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/kmate/quiz/options -> { types: [{ key, label, ko, skill, description }], difficulties: [{ key, label }] }
exports.quizOptions = (req, res) => res.json(publicOptions());

// GET /api/kmate/quiz/strategy?type=main_idea&language=my -> the strategy guide for that question type (cached in MySQL)
exports.quizStrategy = async (req, res) => {
  try {
    const guide = await guides.getStrategyGuide(pool, completeText, req.query.type, req.query.language);
    if (!guide) return res.status(400).json({ error: "unknown question type" });
    res.json(guide);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/kmate/quiz/explain?point=...&source=quiz|exam&language=my
// What a student sees when they open one of their weak points: a quiz point gets a grammar explanation with 3
// examples; an exam point (a question type) gets that type's strategy guide. Both come from the MySQL cache.
exports.explainWeakPoint = async (req, res) => {
  const { point, source, language } = req.query;
  if (!String(point || "").trim()) return res.status(400).json({ error: "point is required" });
  try {
    if (source === "exam") {
      const key = guides.examTypeToGuideKey(point);
      if (!key) return res.json({ kind: "none", point });
      return res.json({ kind: "strategy", ...(await guides.getStrategyGuide(pool, completeText, key, language)) });
    }
    res.json({ kind: "grammar", ...(await guides.getGrammarExplanation(pool, completeText, point, language)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/kmate/grammar/explain?content=-(으)려고&language=en|my|vi|ko
// A structured explanation (pattern, meaning, explanation, usage notes, one example) written strictly in the student's language.
exports.explainGrammar = async (req, res) => {
  const { content, language } = req.query;
  if (!String(content || "").trim()) return res.status(400).json({ error: "content is required" });
  try {
    res.json(await guides.getGrammarSummary(pool, completeText, content, language));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/kmate/quiz/followup  { weaknesses: ["..."], count, language }
// Practice questions aimed at the points the student just got wrong (or the ones in their weakness list).
exports.followupQuiz = async (req, res) => {
  const weaknesses = (Array.isArray(req.body.weaknesses) ? req.body.weaknesses : []).map(quizStore.cleanWeakness).filter(Boolean).slice(0, 6);
  if (weaknesses.length === 0) return res.status(400).json({ error: "weaknesses are required" });
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || weaknesses.length + 1, 2), 8);
  try {
    const questions = await makeQuizQuestions({ topic: "TOPIK II (targeted practice)", count, language: req.body.language || "en", focus: weaknesses, type: req.body.type, difficulty: req.body.difficulty, domain: req.body.domain, range: req.body.range });
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
        passage: q.passage || "",
        options: q.options,
        yourAnswer: answers[i],
        correctAnswer: q.answer,
        isCorrect,
        weakness: q.weakness || "",
        domain: q.domain || "",
        number: Number.isInteger(Number(q.number)) && Number(q.number) > 0 ? Number(q.number) : null,
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

// POST /api/kmate/tts  { text, speed: "normal" | "slow" } -> audio/mpeg of a Korean sentence (ElevenLabs, kept on disk after the first time)
exports.sentenceAudio = async (req, res) => {
  try {
    const { audio, cached } = await getSentenceAudio(req.body?.text, req.body?.speed || "normal");
    res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Audio-Cache": cached ? "hit" : "miss" });
    res.send(audio);
  } catch (err) {
    if (err instanceof AudioRequestError) return res.status(400).json({ error: err.message });
    console.error("sentence audio error:", err.message);
    res.status(err.code === "ELEVENLABS_NOT_CONFIGURED" ? 503 : 502).json({ error: "Could not make the audio" });
  }
};
