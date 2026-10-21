const test = require("node:test");
const assert = require("node:assert/strict");
process.env.KMATE_AI_PROVIDER = "openai";
process.env.QUESTION_BANK_TOPUP = "off";   // no background model calls after a test ends   // the model is stubbed below; never reach a real provider

const pool = require("../config/db");
const originalQuery = pool.query;
const controllerPath = require.resolve("../controllers/victoria/kmate.controller");
const openaiTextPath = require.resolve("../services/ai/openaiText");
const storePath = require.resolve("../services/topik/quizStore");
const bankPath = require.resolve("../services/topik/questionBank");

function load(t, reply) {
  const calls = [];
  const originalOpenAi = require.cache[openaiTextPath];
  require.cache[openaiTextPath] = {
    id: openaiTextPath, filename: openaiTextPath, loaded: true,
    exports: { completeText: async request => { calls.push(request); return { choices: [{ message: { content: typeof reply === "function" ? reply(request) : reply } }] }; } },
  };
  delete require.cache[controllerPath];
  delete require.cache[storePath];                     // a fresh "tables are ready" state per test
  delete require.cache[bankPath];
  pool.query = async () => [[]];                       // an empty question bank unless a test says otherwise; never the real database
  const controller = require(controllerPath);
  t.after(() => {
    pool.query = originalQuery;
    delete require.cache[controllerPath];
    delete require.cache[storePath];
    delete require.cache[bankPath];
    if (originalOpenAi) require.cache[openaiTextPath] = originalOpenAi; else delete require.cache[openaiTextPath];
  });
  return { controller, calls };
}

function http(body = {}, user = { id: 7 }) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  return { req: { user, body }, res };
}

const MODEL_QUESTIONS = JSON.stringify([
  { question: "한국에 온 지 일 년이 ( ).", options: ["A) 됐다", "B) 된다", "C) 되고", "D) 되면"], answer: "A", weakness: "  -(으)ㄴ 지   + 시간  ", explanation: "…" },
  { question: "비가 와서 길이 ( ).", options: ["A) 막혔다", "B) 막았다", "C) 막히고", "D) 막으면"], answer: "A", weakness: "피동 표현", explanation: "…" },
]);

test("generateQuiz returns questions, each with the weak point it tests (tidied)", async t => {
  const { controller, calls } = load(t, "```json\n" + MODEL_QUESTIONS + "\n```");
  const { req, res } = http({ topic: "grammar", count: 2, language: "my" });
  await controller.generateQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.questions.length, 2);
  assert.equal(res.body.questions[0].weakness, "-(으)ㄴ 지 + 시간");
  assert.match(calls[0].messages[0].content, /Burmese/);
  assert.match(calls[0].messages[0].content, /"weakness"/);
});

test("generateQuiz asks for the Smart Drill rules: new questions, 3 natural distractors, why every option, and a tip", async t => {
  const reply = JSON.stringify([{ question: "q ( )", options: ["A) a", "B) b", "C) c", "D) d"], answer: "B", weakness: "피동 표현", explanation: "B is right; A, C and D are wrong because …", tip: "  Look at the word before the blank.  " }, { question: "q2 ( )", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", weakness: "x", explanation: "…" }]);
  const { controller, calls } = load(t, reply);
  const { req, res } = http({ topic: "grammar", count: 2, language: "vi" });
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /"Smart Drill" engine/);
  assert.match(prompt, /Do NOT copy past exam questions/);
  assert.match(prompt, /match the real TOPIK exam/);
  assert.match(prompt, /1 correct answer and 3 natural distractors/);
  assert.match(prompt, /why the correct answer is right AND why each wrong option is wrong/);
  assert.match(prompt, /"tip"/);
  assert.match(prompt, /Vietnamese/);
  assert.equal(res.body.questions[0].tip, "Look at the word before the blank.");     // tidied
  assert.equal(res.body.questions[1].tip, "");                                           // a reply without a tip still works
});

test("generateQuiz for a domain and range asks for a passage in that exam pattern and returns it", async t => {
  const reply = JSON.stringify([{ domain: "듣기", passage: "남자: 어디 가세요?\n여자: 도서관에 가요.", question: "여자는 어디에 갑니까?", options: ["A) 학교", "B) 도서관", "C) 식당", "D) 병원"], answer: "B", weakness: "장소", explanation: "…", tip: "Listen for the place." }]);
  const { controller, calls } = load(t, reply);
  const { req, res } = http({ topic: "TOPIK II listening", count: 1, language: "vi", domain: "listening", range: "l-4-8" });
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /Exam domain: 듣기 \(Listening\)/);
  assert.match(prompt, /audio SCRIPT/);
  assert.match(prompt, /Target question range: 듣기 4~8번 — 이어질 수 있는 말/);
  assert.match(prompt, /"domain": "듣기"/);
  assert.equal(res.body.questions[0].passage, "남자: 어디 가세요?\n여자: 도서관에 가요.");
  assert.equal(res.body.questions[0].domain, "listening");
});

test("a Reading level band tells the model what that band is about", async t => {
  const reply = JSON.stringify([{ question: "q", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", weakness: "x", explanation: "…" }]);
  const { controller, calls } = load(t, reply);
  const { req, res } = http({ count: 1, domain: "reading", range: "b-26-38" });
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /Target question range: 읽기 26~38번/);
  assert.match(prompt, /Focus of this part: ordering sentences, advanced context and specific viewpoints\./);
  assert.match(prompt, /Match the style, length and difficulty of that part of the real TOPIK II exam/);
  assert.equal(res.body.questions[0].domain, "reading");
});

test("a student-selected question span makes a mixed practice set from every TOPIK pattern it covers", async t => {
  const reply = JSON.stringify([{ question: "q", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", weakness: "x", explanation: "…" }]);
  const { controller, calls } = load(t, reply);
  const { req, res } = http({ count: 2, domain: "reading", startQuestion: 6, endQuestion: 8 });          // fewer questions than numbers: spread over the patterns
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /Student-selected question span: 읽기 6~8번/);
  assert.match(prompt, /5~8번 — 안내문 \/ 광고 \/ 안내판/);
  assert.match(prompt, /Distribute the 2 new questions across these matching patterns/);
  assert.match(prompt, /Return exactly 2 questions/);
  assert.equal(res.body.questions[0].domain, "reading");
});

test("one question per number: each number is written in ITS pattern, in order, and the number comes back", async t => {
  const reply = request => JSON.stringify([{ number: 6, question: "a", passage: "p", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", weakness: "x", explanation: "…" }, { question: "b", passage: "p", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", weakness: "x", explanation: "…" }]);
  const { controller, calls } = load(t, reply);
  const { req, res } = http({ count: 2, language: "ko", domain: "reading", startQuestion: 6, endQuestion: 7 });
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /Write exactly ONE question for each number/);
  assert.match(prompt, /- 읽기 6번 → 5~8번 pattern: 안내문 \/ 광고 \/ 안내판/);
  assert.match(prompt, /- 읽기 7번 → 5~8번 pattern/);
  assert.match(prompt, /"number": the question number/);
  assert.deepEqual(res.body.questions.map(q => q.number), [6, 7]);                         // a missing number is counted on from the start
});

test("each number of 읽기 1~4 gets its own pattern: 1~2 grammar fill-in, 3~4 similar grammar", async t => {
  const { controller, calls } = load(t, manyQuestions);
  const { req, res } = http({ count: 4, language: "en", domain: "reading", startQuestion: 1, endQuestion: 4 });
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /- 읽기 1번 → 1~2번 pattern: 문법 - 빈칸 채우기/);
  assert.match(prompt, /- 읽기 2번 → 1~2번 pattern: 문법 - 빈칸 채우기/);
  assert.match(prompt, /- 읽기 3번 → 3~4번 pattern: 유사 문법. How it is written: Instruction: "다음 밑줄 친 부분과 의미가 비슷한 것을 고르십시오\."/);
  assert.match(prompt, /- 읽기 1번 → 1~2번 pattern: 문법 - 빈칸 채우기. How it is written: Instruction: "\( \)에 들어갈 가장/);
  assert.match(prompt, /"question" holds ONLY the official instruction line/);
  assert.match(prompt, /- 읽기 4번 → 3~4번 pattern: 유사 문법/);
});

test("a count that is not one per number gets no number field", async t => {
  const { controller } = load(t, manyQuestions);
  const { req, res } = http({ count: 3, language: "en", domain: "reading", startQuestion: 1, endQuestion: 30 });
  await controller.generateQuiz(req, res);
  assert.ok(res.body.questions.every(q => !("number" in q)));
});

test("a wide span (읽기 6~23) covers every pattern of it across the batches of its slices", async t => {
  const { controller, calls } = load(t, manyQuestions);
  const { req, res } = http({ count: 18, domain: "reading", startQuestion: 6, endQuestion: 23 });
  await controller.generateQuiz(req, res);
  assert.equal(res.body.questions.length, 18);
  const prompts = calls.map(c => c.messages[0].content).join("\n");
  assert.match(prompts, /Student-selected question numbers: 읽기 6~10번/);
  assert.match(prompts, /Student-selected question numbers: 읽기 21~23번/);
  assert.match(prompts, /- 읽기 6번 → 5~8번 pattern: 안내문 \/ 광고 \/ 안내판/);
  assert.match(prompts, /- 읽기 23번 → 23~24번 pattern: 수필\/소설 - 심정 & 내용/);
});

test("a domain without a range, a range of another domain and no domain at all are handled", async t => {
  const reply = JSON.stringify([{ question: "q", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", weakness: "x", explanation: "…" }]);
  const { controller, calls } = load(t, reply);
  const only = http({ count: 1, domain: "reading" });
  await controller.generateQuiz(only.req, only.res);
  assert.match(calls[0].messages[0].content, /Exam domain: 읽기/);
  assert.doesNotMatch(calls[0].messages[0].content, /Target question range/);
  const wrong = http({ count: 1, domain: "reading", range: "l-4-8" });                  // a listening range is ignored for reading
  await controller.generateQuiz(wrong.req, wrong.res);
  assert.doesNotMatch(calls[1].messages[0].content, /Target question range/);
  const none = http({ count: 1 });
  await controller.generateQuiz(none.req, none.res);
  assert.doesNotMatch(calls[2].messages[0].content, /Exam domain/);
  assert.equal(none.res.body.questions[0].domain, "");
  assert.equal(none.res.body.questions[0].passage, "");
});

test("the practice quiz result keeps the passage of each question", async t => {
  const { controller } = load(t, "[]");
  pool.query = async () => [{ insertId: 1 }];                    // never touch the real database
  const { req, res } = http({ questions: [{ question: "q", passage: "지문", options: ["A) a", "B) b"], answer: "A", weakness: "x", explanation: "…" }], answers: ["A"], topic: "t", language: "en" });
  await controller.checkQuiz(req, res);
  assert.equal(res.body.results[0].passage, "지문");
});

// a model double that answers with as many questions as the prompt asks for ("Generate 5 brand-new ...")
const askedFor = request => Number(/Generate (\d+) /.exec(request.messages[0].content)[1]);
const manyQuestions = request => JSON.stringify(Array.from({ length: askedFor(request) }, (_, i) => ({ question: `q${i} ( )`, options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", weakness: "x", explanation: "…" })));

test("a big set is cut into smaller requests: 12 plain questions -> 10 + 2", async t => {
  const { controller, calls } = load(t, manyQuestions);
  const { req, res } = http({ topic: "grammar", count: 12, language: "en" });
  await controller.generateQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.questions.length, 12);
  assert.deepEqual(calls.map(askedFor).sort((a, b) => b - a), [10, 2]);
});

test("a question span of 읽기 1~12 is cut into batches of 5 that each get their own slice of the span, in order", async t => {
  const { controller, calls } = load(t, manyQuestions);
  const { req, res } = http({ topic: "TOPIK II Reading", count: 12, language: "ko", domain: "reading", startQuestion: 1, endQuestion: 12 });
  await controller.generateQuiz(req, res);
  assert.equal(res.body.questions.length, 12);
  const spans = calls.map(c => /Student-selected question numbers: 읽기 (\d+)~(\d+)번/.exec(c.messages[0].content).slice(1).map(Number)).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(spans, [[1, 5], [6, 10], [11, 12]]);
  assert.deepEqual(calls.map(askedFor).sort((a, b) => b - a), [5, 5, 2]);
});

test("a count that is not one question per number keeps the whole span in every batch", async t => {
  const { controller, calls } = load(t, manyQuestions);
  const { req, res } = http({ count: 8, language: "ko", domain: "reading", startQuestion: 1, endQuestion: 30 });
  await controller.generateQuiz(req, res);
  assert.equal(res.body.questions.length, 8);
  assert.ok(calls.every(c => /읽기 1~30번/.test(c.messages[0].content)));
});

test("the largest set (50) is capped, and the batches run at most three at a time", async t => {
  let running = 0, peak = 0;
  const { controller, calls } = load(t, request => manyQuestions(request));
  const original = require.cache[openaiTextPath].exports.completeText;
  require.cache[openaiTextPath].exports.completeText = async request => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 5)); running--; return original(request); };
  const { req, res } = http({ count: 500, language: "en", domain: "listening", startQuestion: 1, endQuestion: 50 });
  await controller.generateQuiz(req, res);
  assert.equal(res.body.questions.length, 50);
  assert.equal(calls.length, 17);                                         // listening is asked for 3 questions at a time: 16 x 3 + 2
  assert.ok(peak <= 3, `at most 3 requests at a time, saw ${peak}`);
});

test("an answer that is not valid JSON is asked for once more, and a second bad answer is a clear 500", async t => {
  const good = manyQuestions({ messages: [{ content: "Generate 2 " }] });
  let answers = ["[{\"question\": \"cut off", good];
  const { controller, calls } = load(t, () => answers.shift());
  const first = http({ count: 2 });
  await controller.generateQuiz(first.req, first.res);
  assert.equal(first.res.statusCode, 200);
  assert.equal(first.res.body.questions.length, 2);
  assert.equal(calls.length, 2);

  answers = ["not json", "still not json"];
  const second = http({ count: 2 });
  await controller.generateQuiz(second.req, second.res);
  assert.equal(second.res.statusCode, 500);
  assert.match(second.res.body.error, /JSON/);
});

test("followupQuiz targets the given weak points and needs at least one", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const empty = http({ weaknesses: [] });
  await controller.followupQuiz(empty.req, empty.res);
  assert.equal(empty.res.statusCode, 400);

  const { req, res } = http({ weaknesses: ["피동 표현", "-(으)ㄴ 지 + 시간"], count: 99, language: "en" });
  await controller.followupQuiz(req, res);
  assert.equal(res.statusCode, 200);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /- 피동 표현/);
  assert.match(prompt, /- -\(으\)ㄴ 지 \+ 시간/);
  assert.match(prompt, /Generate 8 /);                              // the count is capped
  assert.match(prompt, /EVERY question must test one of them/);
});

test("checkQuiz grades, stores the attempt and every answer with its weak point, and returns the review", async t => {
  const { controller } = load(t, "[]");
  const sql = [];
  pool.query = async (q, params) => {
    sql.push({ q: q.replace(/\s+/g, " "), params });
    if (/INSERT INTO topik_quiz_attempts/.test(q)) return [{ insertId: 41 }];
    return [{}];
  };
  const questions = JSON.parse(MODEL_QUESTIONS);
  const { req, res } = http({ questions, answers: ["A", "B"], topic: "grammar", language: "en", kind: "followup" });
  await controller.checkQuiz(req, res);
  assert.equal(res.body.score, 50);
  assert.equal(res.body.attemptId, 41);
  assert.equal(res.body.results[1].isCorrect, false);
  assert.equal(res.body.results[1].weakness, "피동 표현");

  const attempt = sql.find(c => /INSERT INTO topik_quiz_attempts/.test(c.q));
  assert.deepEqual(attempt.params, [7, "grammar", "en", "followup", null, null, 2, 1, 50]);
  const answers = sql.filter(c => /INSERT INTO topik_quiz_answers/.test(c.q));
  assert.equal(answers.length, 2);
  assert.deepEqual(answers[1].params.slice(0, 2), [41, 7]);
  assert.equal(answers[1].params[6], 0);                            // is_correct = 0
  assert.equal(answers[1].params[7], "피동 표현");
});

test("a storage failure never takes the student's result away", async t => {
  const { controller } = load(t, "[]");
  pool.query = async () => { throw new Error("db down"); };
  const { req, res } = http({ questions: JSON.parse(MODEL_QUESTIONS), answers: ["A", "A"] });
  const log = console.error; console.error = () => {};
  t.after(() => { console.error = log; });
  await controller.checkQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.score, 100);
  assert.equal(res.body.attemptId, null);
});

test("quizWeaknesses lists quiz and exam weak points together, most-missed first, with where each comes from", async t => {
  const { controller } = load(t, "[]");
  pool.query = async q => {
    if (/FROM topik_weakness_profiles/.test(q)) return [[
      { source: "exam", skill_area: "reading", weakness: "long article comprehension", attempts: 16, correct_count: 0, last_seen: "2026-10-13T11:00:00.000Z" },
      { source: "quiz", skill_area: "", weakness: "피동 표현", attempts: 4, correct_count: 1, last_seen: "2026-10-13T10:00:00.000Z" },
    ]];
    if (/FROM topik_quiz_attempts/.test(q)) return [[{ attempts: 5, averageScore: 62 }]];
    if (/FROM topik_exam_sessions/.test(q)) return [[{ sessions: 2, averageScore: 6 }]];
    if (/FROM topik_quiz_answers/.test(q)) return [[{ domain: "reading", question_number: 13, asked: 4, wrong: 3, last_seen: "2026-10-13T09:00:00.000Z" }]];
    return [{}];
  };
  const { req, res } = http();
  await controller.quizWeaknesses(req, res);
  assert.deepEqual(res.body, {
    attempts: 5, averageScore: 62, examSessions: 2, examAverage: 6,
    missedNumbers: [{ domain: "reading", number: 13, asked: 4, wrong: 3, accuracy: 25, lastSeen: "2026-10-13T09:00:00.000Z" }],
    weaknesses: [
      { weakness: "long article comprehension", source: "exam", skillArea: "reading", asked: 16, wrong: 16, accuracy: 0, lastSeen: "2026-10-13T11:00:00.000Z" },
      { weakness: "피동 표현", source: "quiz", skillArea: null, asked: 4, wrong: 3, accuracy: 25, lastSeen: "2026-10-13T10:00:00.000Z" },
    ],
  });
});

test("saving a quiz attempt rebuilds the student's weakness profile (quiz and exam rows)", async t => {
  const { controller } = load(t, "[]");
  const sql = [];
  pool.query = async q => { sql.push(q.replace(/\s+/g, " ")); return /INSERT INTO topik_quiz_attempts/.test(q) ? [{ insertId: 3 }] : [{}]; };
  const { req, res } = http({ questions: JSON.parse(MODEL_QUESTIONS), answers: ["A", "A"] });
  await controller.checkQuiz(req, res);
  assert.ok(sql.some(q => /DELETE FROM topik_weakness_profiles/.test(q)));
  assert.ok(sql.some(q => /INSERT INTO topik_weakness_profiles .* 'quiz'/.test(q)));
  assert.ok(sql.some(q => /INSERT INTO topik_weakness_profiles .* 'exam'/.test(q)));
});

test("quizOptions lists the question types and difficulty levels the screen offers (no prompt text)", async t => {
  const { controller } = load(t, "[]");
  const { req, res } = http();
  controller.quizOptions(req, res);
  assert.equal(res.body.types.length, 8);
  assert.deepEqual(res.body.types[0], { key: "grammar_fill_in", label: "Grammar fill-in", ko: "문법 빈칸", skill: "grammar", description: "Choose the grammar form that fits the blank in a sentence." });
  assert.deepEqual(res.body.difficulties.map(d => d.key), ["easy", "medium", "hard"]);
  assert.equal(JSON.stringify(res.body).includes('"format"'), false);                       // the model-only fields are not sent (a word like "information" is fine)
  assert.equal(JSON.stringify(res.body).includes('"rule"'), false);
  assert.equal(JSON.stringify(res.body).includes('"focus"'), false);
});

test("generateQuiz writes the chosen question type and difficulty into the request to the model", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const { req, res } = http({ topic: "grammar", count: 2, language: "en", type: "sentence_order", difficulty: "hard" });
  await controller.generateQuiz(req, res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /"Sentence order" \(문장 순서\)/);
  assert.match(prompt, /\(가\) \(나\) \(다\) \(라\)/);               // the real exam format of that type
  assert.match(prompt, /Difficulty: Hard — about TOPIK level 5-6/);
});

test("an unknown type or difficulty is ignored, not passed to the model", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const { req, res } = http({ topic: "grammar", count: 2, type: "nonsense", difficulty: "impossible" });
  await controller.generateQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(calls[0].messages[0].content, /Difficulty:|question, written like the real exam/);
});

test("checkQuiz stores the type and difficulty with the attempt and each answer; followup practice can keep them", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  const sql = [];
  pool.query = async (q, params) => { sql.push({ q: q.replace(/\s+/g, " "), params }); return /INSERT INTO topik_quiz_attempts/.test(q) ? [{ insertId: 8 }] : [{}]; };
  const { req, res } = http({ questions: JSON.parse(MODEL_QUESTIONS), answers: ["A", "A"], type: "main_idea", difficulty: "easy", kind: "practice" });
  await controller.checkQuiz(req, res);
  assert.deepEqual(sql.find(c => /INSERT INTO topik_quiz_attempts/.test(c.q)).params.slice(3, 6), ["practice", "main_idea", "easy"]);
  const answer = sql.find(c => /INSERT INTO topik_quiz_answers/.test(c.q));
  assert.deepEqual(answer.params.slice(8, 10), ["main_idea", "easy"]);

  const follow = http({ weaknesses: ["피동 표현"], type: "grammar_fill_in", difficulty: "easy" });
  await controller.followupQuiz(follow.req, follow.res);
  assert.match(calls.at(-1).messages[0].content, /"Grammar fill-in"/);
});

test("older tables get the new columns added, and 'already there' is not an error", async t => {
  const { controller } = load(t, "[]");
  const ddl = [];
  pool.query = async q => {
    ddl.push(q.replace(/\s+/g, " "));
    if (/ALTER TABLE/.test(q)) { const e = new Error("dup"); e.code = "ER_DUP_FIELDNAME"; throw e; }
    return /FROM topik_/.test(q) ? [[]] : [{}];
  };
  const { req, res } = http();
  await controller.quizWeaknesses(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(ddl.filter(q => /^ALTER TABLE topik_quiz_(attempts|answers) ADD COLUMN (question_type|difficulty)/.test(q)).length, 4);
});

test("Hard headline questions are asked for compact newspaper noun phrases, not sentences", async t => {
  const { controller, calls } = load(t, MODEL_QUESTIONS);
  await controller.generateQuiz(http({ topic: "reading", count: 2, type: "news_headline", difficulty: "hard" }).req, http().res);
  const prompt = calls[0].messages[0].content;
  assert.match(prompt, /HEADLINE STYLE \(strict/);
  assert.match(prompt, /ONE noun phrase of about 8-25 characters/);
  assert.match(prompt, /NOT end with a verb or a sentence ending/);
  assert.match(prompt, /Good: .*금리 동결에 가계 대출 증가세 주춤/);        // a real-looking example is given
  assert.match(prompt, /Sino-Korean compound nouns/);                         // the hard-level note
  assert.match(prompt, /distorts exactly one nuance/);

  await controller.generateQuiz(http({ topic: "reading", count: 2, type: "news_headline", difficulty: "easy" }).req, http().res);
  assert.match(calls[1].messages[0].content, /everyday news topics/);          // each level has its own note
  assert.doesNotMatch(calls[1].messages[0].content, /Sino-Korean compound nouns/);

  await controller.generateQuiz(http({ topic: "reading", count: 2, type: "main_idea", difficulty: "hard" }).req, http().res);
  assert.doesNotMatch(calls[2].messages[0].content, /HEADLINE STYLE/);          // other types are not affected
});

// ── question bank: questions the model wrote once are served again without waiting for it ──
function fakeBank(rows = []) {
  const inserts = [];
  const query = async (sql, params) => {
    if (/CREATE TABLE/.test(sql)) return [{}];
    if (/^SELECT id, number/.test(sql)) return [rows.filter(r => r.domain === params[0] && r.difficulty === params[1] && r.language === params[2] && params[3].includes(r.number))];
    if (/SELECT COUNT/.test(sql)) return [[{ n: rows.filter(r => r.domain === params[0] && r.number === params[1]).length + inserts.filter(i => i[0] === params[0] && i[1] === params[1]).length }]];
    if (/INSERT IGNORE/.test(sql)) { inserts.push(params); return [{}]; }
    return [{}];                                                       // the times_served update
  };
  return { query, inserts };
}
const bankRow = (id, number, language = "en", difficulty = "") => ({ id, number, domain: "reading", difficulty, language, question_json: JSON.stringify({ number, domain: "reading", question: `cached ${number}`, options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", passage: "p", weakness: "w", tip: "t", explanation: "e" }) });
const numbered = ns => JSON.stringify(ns.map(n => ({ number: n, question: `new ${n}`, passage: "p", options: ["A) a", "B) b", "C) c", "D) d"], answer: "B", weakness: "w", explanation: "e", tip: "t" })));

test("question bank: numbers that are stored are served at once, with no call to the model", async t => {
  const { controller, calls } = load(t, "[]");
  const bank = fakeBank([bankRow(1, 6), bankRow(2, 7)]);
  pool.query = bank.query;
  const { req, res } = http({ count: 2, language: "en", domain: "reading", startQuestion: 6, endQuestion: 7 });
  await controller.generateQuiz(req, res);
  assert.deepEqual(res.body.questions.map(q => q.question), ["cached 6", "cached 7"]);
  assert.equal(calls.length, 0);
});

test("question bank: only the missing numbers are written by the model, and they are stored for next time", async t => {
  const { controller, calls } = load(t, request => numbered(/읽기 8번/.test(request.messages[0].content) ? [8] : []));
  const bank = fakeBank([bankRow(1, 6), bankRow(2, 7)]);
  pool.query = bank.query;
  const { req, res } = http({ count: 3, language: "en", domain: "reading", startQuestion: 6, endQuestion: 8 });
  await controller.generateQuiz(req, res);
  assert.deepEqual(res.body.questions.map(q => `${q.number}:${q.question}`), ["6:cached 6", "7:cached 7", "8:new 8"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /Student-selected question numbers: 읽기 8번/);   // only number 8 is asked for
  assert.equal(bank.inserts.length, 1);
  assert.deepEqual(bank.inserts[0].slice(0, 4), ["reading", 8, "", "en"]);
});

test("question bank: another language or difficulty is a different question, so it is not served", async t => {
  const { controller, calls } = load(t, numbered([6]));
  pool.query = fakeBank([bankRow(1, 6, "my", "hard")]).query;
  const { req, res } = http({ count: 1, language: "en", difficulty: "hard", domain: "reading", startQuestion: 6, endQuestion: 6 });
  await controller.generateQuiz(req, res);
  assert.equal(res.body.questions[0].question, "new 6");
  assert.equal(calls.length, 1);
});

test("question bank: a broken database never stops the quiz, the model is asked as before", async t => {
  const { controller, calls } = load(t, numbered([6]));
  pool.query = async () => { throw new Error("db down"); };
  const { req, res } = http({ count: 1, language: "en", domain: "reading", startQuestion: 6, endQuestion: 6 });
  await controller.generateQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.questions[0].question, "new 6");
  assert.equal(calls.length, 1);
});

test("question bank: topic quizzes, a chosen question type and weak-point practice are not banked", async t => {
  const { controller } = load(t, MODEL_QUESTIONS);
  const queries = [];
  pool.query = async sql => { queries.push(sql); return [[]]; };
  const a = http({ topic: "grammar", count: 2, language: "en" });
  await controller.generateQuiz(a.req, a.res);
  const b = http({ count: 1, language: "en", domain: "reading", type: "notice_sign", startQuestion: 6, endQuestion: 6 });
  await controller.generateQuiz(b.req, b.res);
  assert.equal(queries.filter(q => /topik_question_bank/.test(q)).length, 0);
});

test("question bank: a number with too few stored questions gets one more in the background", async t => {
  process.env.QUESTION_BANK_TOPUP = "on";
  t.after(() => { process.env.QUESTION_BANK_TOPUP = "off"; });
  const { controller, calls } = load(t, numbered([6]));
  const bank = fakeBank([bankRow(1, 6)]);
  pool.query = bank.query;
  const { req, res } = http({ count: 1, language: "en", domain: "reading", startQuestion: 6, endQuestion: 6 });
  await controller.generateQuiz(req, res);
  assert.equal(res.body.questions[0].question, "cached 6");            // answered at once from the bank
  await controller._topUp;
  assert.equal(calls.length, 1);
  assert.equal(bank.inserts.length, 1);
});

test("a checked quiz keeps the exam section and number of every answer, so the missed numbers can be listed", async t => {
  const { controller } = load(t, "[]");
  const inserts = [];
  pool.query = async (q, params) => { if (/INSERT INTO topik_quiz_answers/.test(q)) inserts.push(params); return /INSERT INTO topik_quiz_attempts/.test(q) ? [{ insertId: 3 }] : [{}]; };
  const questions = [{ ...JSON.parse(MODEL_QUESTIONS)[0], domain: "reading", number: 13 }, JSON.parse(MODEL_QUESTIONS)[1]];
  const { req, res } = http({ questions, answers: ["B", "A"] });
  await controller.checkQuiz(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual([inserts[0][10], inserts[0][11]], ["reading", 13]);     // domain, question_number
  assert.deepEqual([inserts[1][10], inserts[1][11]], [null, null]);       // a topic quiz question has no exam number
});
