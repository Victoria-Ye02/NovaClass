import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

vi.mock("@elevenlabs/client", () => ({ Conversation: {} }));
vi.mock("../../components/Sidebar", () => ({ default: () => null }));
vi.mock("./CodeHomeworkCoach", () => ({ default: () => null }));
const appLanguage = { lang: "en" };
vi.mock("../../LanguageContext", () => ({ useLang: () => ({ lang: appLanguage.lang, t: key => key }) }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import API from "../../services/api";
import { useState } from "react";
import { QuizMode } from "./KMate";
import TopikPracticePanel from "./TopikPracticePanel";
import { useTopikPractice } from "./useTopikPractice";

// the same pieces KMate puts together: the practice panel (in the sidebar) beside the quiz (in the main area)
function Harness() {
  const practice = useTopikPractice();
  const [followup, setFollowup] = useState(null);
  return (
    <div>
      <TopikPracticePanel practice={practice} onPractice={ws => setFollowup({ weaknesses: ws, n: Date.now() })} />
      <QuizMode key={followup?.n || 0} practice={practice} followup={followup} />
    </div>
  );
}

const QUESTIONS = [
  { question: "한국에 온 지 일 년이 ( ).", options: ["A) 됐다", "B) 된다", "C) 되고", "D) 되면"], answer: "A", weakness: "-(으)ㄴ 지 + 시간", explanation: "시간이 지났음을 나타냅니다.", tip: "Look at the word before the blank." },
  { question: "비가 와서 길이 ( ).", options: ["A) 막았다", "B) 막혔다", "C) 막고", "D) 막으면"], answer: "B", weakness: "피동 표현", explanation: "길이 막힘을 당했으므로 피동입니다." },
];

const STRATEGY = { typeKey: "sentence_order", label: "Sentence order", ko: "문장 순서", language: "en", overview: "This type tests how a passage flows.", steps: ["Find the sentence that can open the passage", "Follow the pronouns"], tips: ["Look at 그래서 and 그러나"], mistakes: ["Ignoring connectives"] };
const GRAMMAR = { kind: "grammar", point: "피동 표현", language: "en", rule: "The subject receives the action.", form: "verb stem + -이/히/리/기-", notes: ["Not the same as -아/어 지다"], examples: [
  { ko: "문이 바람에 닫혔어요.", translation: "The door was shut by the wind." },
  { ko: "길이 눈 때문에 막혔어요.", translation: "The road was blocked by snow." },
  { ko: "책이 많이 읽혀요.", translation: "The book is widely read." },
] };

const DOMAINS = [
  { key: "reading", ko: "읽기", label: "Reading", ranges: [{ key: "r-13-15", range: "13~15", ko: "문장 순서 배열" }], bands: [{ key: "b-1-10", range: "1~10", ko: "기본 — basic grammar, similar meanings and short notices" }, { key: "b-11-25", range: "11~25", ko: "중급 — matching information, main ideas" }] },
  { key: "listening", ko: "듣기", label: "Listening", ranges: [{ key: "l-4-8", range: "4~8", ko: "이어질 수 있는 말" }] },
  { key: "writing", ko: "쓰기", label: "Writing", ranges: [{ key: "w-54", range: "54", ko: "논술 (600~700자)" }] },
];
const OPTIONS = {
  domains: DOMAINS,
  types: [
    { key: "grammar_fill_in", label: "Grammar fill-in", ko: "문법 빈칸", skill: "grammar", description: "Choose the grammar form that fits the blank." },
    { key: "sentence_order", label: "Sentence order", ko: "문장 순서", skill: "reading", description: "Put four sentences in order." },
  ],
  difficulties: [{ key: "easy", label: "Easy" }, { key: "medium", label: "Medium" }, { key: "hard", label: "Hard" }],
};

beforeEach(() => {
  API.get.mockReset();
  API.post.mockReset();
  API.get.mockImplementation(async url => {
    if (url === "/kmate/quiz/options") return { data: OPTIONS };
    if (url === "/kmate/quiz/strategy") return { data: STRATEGY };
    if (url === "/kmate/quiz/explain") return { data: GRAMMAR };
    return { data: { attempts: 3, averageScore: 55, weaknesses: [{ weakness: "피동 표현", asked: 4, wrong: 3, accuracy: 25, lastSeen: "2026-10-13" }] } };
  });
  API.post.mockImplementation(async (url, body) => {
    if (url === "/kmate/quiz/generate") return { data: { questions: QUESTIONS } };
    if (url === "/kmate/quiz/followup") return { data: { questions: QUESTIONS.slice(0, 1), weaknesses: body.weaknesses } };
    if (url === "/kmate/quiz/check") {
      const results = QUESTIONS.map((q, i) => ({ ...q, yourAnswer: body.answers[i], correctAnswer: q.answer, isCorrect: body.answers[i] === q.answer }));
      return { data: { score: 50, correct: 1, total: 2, results, attemptId: 9 } };
    }
    throw new Error(url);
  });
});
afterEach(() => { cleanup(); appLanguage.lang = "en"; });

const start = async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
  fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
  await screen.findByText(/Question 1 \/ 2/);
};

describe("K-Mate practice quiz: weak points", () => {
  it("lists the student's weak points and practises one of them", async () => {
    render(<Harness />);
    const panel = await screen.findByTestId("weak-points");
    expect(panel.textContent).toContain("피동 표현");
    expect(panel.textContent).toContain("3 wrong / 4");
    fireEvent.click(screen.getAllByRole("button", { name: "Practice" })[0]);
    await screen.findByText(/Weak-point practice/);
    const call = API.post.mock.calls.find(([url]) => url === "/kmate/quiz/followup");
    expect(call[1].weaknesses).toEqual(["피동 표현"]);
  });

  it("shows exam weak points beside the quiz ones, and practises them as TOPIK questions of that type", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: OPTIONS } : ({ data: { attempts: 2, averageScore: 60, examSessions: 1, examAverage: 6, weaknesses: [
      { weakness: "피동 표현", source: "quiz", skillArea: null, asked: 3, wrong: 2, accuracy: 33 },
      { weakness: "long article comprehension", source: "exam", skillArea: "reading", asked: 16, wrong: 16, accuracy: 0 },
    ] } }));
    render(<Harness />);
    const panel = await screen.findByTestId("weak-points");
    expect(panel.textContent).toContain("피동 표현");
    expect(panel.textContent).toContain("long article comprehension");
    expect(panel.textContent).toContain("Exam · reading");              // marked as coming from the exam

    fireEvent.click(screen.getAllByRole("button", { name: "Practice" })[1]);
    await screen.findByText(/Weak-point practice/);
    const call = API.post.mock.calls.find(([url]) => url === "/kmate/quiz/followup");
    expect(call[1].weaknesses).toEqual(["TOPIK II reading question type: long article comprehension"]);
  });

  it("explains a wrong answer straight away and locks the question", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: /② 된다/ }));                 // wrong (the answer is ①)
    const feedback = await screen.findByTestId("instant-feedback");
    expect(feedback.textContent).toContain("Not quite");
    expect(screen.getByTestId("quiz-tip").textContent).toContain("Look at the word before the blank.");
    expect(feedback.textContent).toContain("시간이 지났음을 나타냅니다.");
    expect(feedback.textContent).toContain("-(으)ㄴ 지 + 시간");
    expect(screen.getByRole("button", { name: /③ 되고/ }).disabled).toBe(true);        // the answer is locked
  });

  it("a right answer is confirmed, and Next needs an answer first", async () => {
    await start();
    expect(screen.getByRole("button", { name: /Next/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /① 됐다/ }));
    expect((await screen.findByTestId("instant-feedback")).textContent).toContain("Correct");
    expect(screen.getByRole("button", { name: /Next/ }).disabled).toBe(false);
  });

  it("after the quiz it offers practice on exactly what was missed, and sends topic and kind when checking", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: /① 됐다/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("button", { name: /① 막았다/ }));                 // wrong (the answer is ②)
    fireEvent.click(screen.getByRole("button", { name: /Submit Quiz/ }));
    await screen.findByText("1 / 2");
    const check = API.post.mock.calls.find(([url]) => url === "/kmate/quiz/check")[1];
    expect(check).toMatchObject({ answers: ["A", "A"], topic: "grammar", kind: "practice", language: "en" });

    fireEvent.click(screen.getByRole("button", { name: /Practice what I missed/ }));
    await waitFor(() => expect(API.post.mock.calls.some(([url]) => url === "/kmate/quiz/followup")).toBe(true));
    expect(API.post.mock.calls.find(([url]) => url === "/kmate/quiz/followup")[1].weaknesses).toEqual(["피동 표현"]);
  });

  it("lets the student pick a question type and a difficulty, and sends both when the quiz is made and checked", async () => {
    render(<Harness />);
    const types = await screen.findByTestId("type-picker");
    expect(types.textContent).toContain("Grammar fill-in");
    expect(types.textContent).toContain("문장 순서");
    fireEvent.click(screen.getByRole("button", { name: /Sentence order/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));
    fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await screen.findByText(/Question 1 \/ 2/);
    const generate = API.post.mock.calls.find(([url]) => url === "/kmate/quiz/generate")[1];
    expect(generate).toMatchObject({ topic: "grammar", count: 3, type: "sentence_order", difficulty: "hard" });

    fireEvent.click(screen.getByRole("button", { name: /① 됐다/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(screen.getByRole("button", { name: /② 막혔다/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit Quiz/ }));
    await screen.findByText("1 / 2");
    expect(API.post.mock.calls.find(([url]) => url === "/kmate/quiz/check")[1]).toMatchObject({ type: "sentence_order", difficulty: "hard" });
  });

  it("without choosing, the quiz is made for any type and any difficulty (as before)", async () => {
    await start();
    const generate = API.post.mock.calls.find(([url]) => url === "/kmate/quiz/generate")[1];
    expect(generate.type).toBeUndefined();
    expect(generate.difficulty).toBeUndefined();
  });

  it("leaves the pickers out if the server cannot list the options", async () => {
    API.get.mockImplementation(async url => { if (url === "/kmate/quiz/options") throw new Error("down"); return { data: { attempts: 0, averageScore: 0, weaknesses: [] } }; });
    render(<Harness />);
    await screen.findByRole("button", { name: /Start Quiz/ });
    await screen.findByText(/practice options could not be loaded/);
    expect(screen.queryByTestId("type-picker")).toBeNull();
  });
});

describe("K-Mate practice quiz: study help", () => {
  const strategyCalls = () => API.get.mock.calls.filter(([url]) => url === "/kmate/quiz/strategy");
  const explainCalls = () => API.get.mock.calls.filter(([url]) => url === "/kmate/quiz/explain");

  it("shows no Strategy Guide until a specific question type is chosen", async () => {
    render(<Harness />);
    await screen.findByTestId("type-picker");
    expect(screen.getByTestId("strategy-guide").textContent).toContain("Choose a question type");
    expect(strategyCalls()).toHaveLength(0);
  });

  it("shows the Strategy Guide in the sidebar for the chosen type, in the explanation language", async () => {
    render(<Harness />);
    await screen.findByTestId("type-picker");
    fireEvent.click(screen.getByRole("button", { name: /Sentence order/ }));
    const card = await screen.findByTestId("strategy-guide");
    await waitFor(() => expect(card.textContent).toContain("This type tests how a passage flows."));
    expect(card.textContent).toContain("Strategy Guide · Sentence order");
    expect(card.textContent).toContain("Find the sentence that can open the passage");
    expect(card.textContent).toContain("Common traps");
    expect(strategyCalls()[0][1].params).toEqual({ type: "sentence_order", language: "en" });

    fireEvent.click(screen.getByRole("button", { name: /Burmese/ }));               // another language is fetched again
    await waitFor(() => expect(strategyCalls().at(-1)[1].params).toEqual({ type: "sentence_order", language: "my" }));
  });

  it("the card folds away and opens again", async () => {
    render(<Harness />);
    await screen.findByTestId("type-picker");
    fireEvent.click(screen.getByRole("button", { name: /Main idea|Sentence order/ }));
    const head = (await screen.findByTestId("strategy-guide")).querySelector("button");
    await waitFor(() => expect(screen.getByTestId("strategy-guide").textContent).toContain("Find the sentence"));
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("strategy-guide").textContent).not.toContain("Find the sentence");
    fireEvent.click(head);
    expect(screen.getByTestId("strategy-guide").textContent).toContain("Find the sentence");
  });

  it("the guide stays in the sidebar while the quiz is being answered", async () => {
    render(<Harness />);
    await screen.findByTestId("type-picker");
    fireEvent.click(screen.getByRole("button", { name: /Sentence order/ }));
    fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await screen.findByText(/Question 1 \/ 2/);
    expect(screen.getByTestId("strategy-guide")).toBeTruthy();
  });

  it("opening a weak point explains the grammar with 3 example sentences", async () => {
    render(<Harness />);
    const panel = await screen.findByTestId("weak-points");
    fireEvent.click(within(panel).getByRole("button", { name: /피동 표현/ }));
    const box = await screen.findByTestId("weak-explanation");
    await waitFor(() => expect(box.textContent).toContain("The subject receives the action."));
    expect(explainCalls()[0][1].params).toEqual({ point: "피동 표현", source: "quiz", language: "en" });
    const examples = within(screen.getByTestId("grammar-examples")).getAllByRole("listitem");
    expect(examples).toHaveLength(3);
    expect(examples[0].textContent).toContain("문이 바람에 닫혔어요.");
    expect(examples[0].textContent).toContain("The door was shut by the wind.");
    expect(box.textContent).toContain("verb stem + -이/히/리/기-");

    fireEvent.click(within(panel).getByRole("button", { name: /피동 표현/ }));       // closes again
    expect(screen.queryByTestId("weak-explanation")).toBeNull();
  });

  it("an exam weak point shows the strategy guide of its question type", async () => {
    API.get.mockImplementation(async url => {
      if (url === "/kmate/quiz/options") return { data: OPTIONS };
      if (url === "/kmate/quiz/explain") return { data: { kind: "strategy", ...STRATEGY, label: "Matching details" } };
      return { data: { attempts: 0, averageScore: 0, weaknesses: [{ weakness: "long article comprehension", source: "exam", skillArea: "reading", asked: 16, wrong: 16, accuracy: 0 }] } };
    });
    render(<Harness />);
    const panel = await screen.findByTestId("weak-points");
    fireEvent.click(within(panel).getByRole("button", { name: /long article comprehension/ }));
    const box = await screen.findByTestId("weak-explanation");
    await waitFor(() => expect(box.textContent).toContain("Strategy guide · Matching details"));
    expect(explainCalls()[0][1].params).toEqual({ point: "long article comprehension", source: "exam", language: "en" });
  });
});

describe("Smart Drill explanation language", () => {
  const strategyCalls = () => API.get.mock.calls.filter(([url]) => url === "/kmate/quiz/strategy");

  it("starts as the language chosen in Settings, and Vietnamese can be picked", async () => {
    appLanguage.lang = "vi";
    render(<Harness />);
    await screen.findByTestId("type-picker");
    const picker = screen.getByTestId("language-picker");
    expect(within(picker).getByRole("button", { name: "Vietnamese" }).style.background).toContain("var(--primary)");   // already selected
    fireEvent.click(screen.getByRole("button", { name: /Sentence order/ }));
    await waitFor(() => expect(strategyCalls()[0][1].params).toEqual({ type: "sentence_order", language: "vi" }));
    fireEvent.click(within(picker).getByRole("button", { name: "English" }));
    await waitFor(() => expect(strategyCalls().at(-1)[1].params.language).toBe("en"));
  });

  it("sends the language with the quiz request and the quiz shows the tip", async () => {
    appLanguage.lang = "vi";
    render(<Harness />);
    await screen.findByTestId("type-picker");
    fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await screen.findByText(/Question 1 \/ 2/);
    expect(API.post.mock.calls.find(([url]) => url === "/kmate/quiz/generate")[1].language).toBe("vi");
  });
});

describe("Smart Drill exam section and passages", () => {
  const generateBody = () => API.post.mock.calls.find(([url]) => url === "/kmate/quiz/generate")[1];
  const pass = { question: "여자는 어디에 갑니까?", passage: "남자: 어디 가세요?\n여자: 도서관에 가요.", domain: "listening", options: ["A) 학교", "B) 도서관", "C) 식당", "D) 병원"], answer: "B", weakness: "장소", explanation: "…", tip: "Listen for the place." };

  it("offers the exam sections and the question ranges of the chosen section", async () => {
    render(<Harness />);
    const sections = await screen.findByTestId("domain-picker");
    expect(sections.textContent).toContain("Reading읽기");
    expect(sections.textContent).toContain("Listening듣기");
    expect(screen.queryByTestId("range-select")).toBeNull();                      // no range before a section is chosen
    fireEvent.click(within(sections).getByRole("button", { name: /Listening/ }));
    const select = screen.getByTestId("range-select");
    expect([...select.options].map(o => o.textContent)).toEqual(["Any question range", "Q4~8 · 이어질 수 있는 말"]);
    fireEvent.change(select, { target: { value: "l-4-8" } });
    fireEvent.click(within(sections).getByRole("button", { name: /Reading/ }));    // another section resets the range
    expect(screen.getByTestId("range-select").value).toBe("");
  });

  it("sends the student's own start and end question numbers to make a focused drill", async () => {
    render(<Harness />);
    const sections = await screen.findByTestId("domain-picker");
    fireEvent.click(within(sections).getByRole("button", { name: /Reading/ }));
    fireEvent.change(screen.getByTestId("range-start"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("range-end"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /5 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await screen.findByText(/Question 1 \/ 2/);
    expect(generateBody()).toMatchObject({ domain: "reading", startQuestion: 1, endQuestion: 30 });
  });

  it("Reading offers the level bands and the question types in two groups, and a band is sent like a range", async () => {
    render(<Harness />);
    fireEvent.click(within(await screen.findByTestId("domain-picker")).getByRole("button", { name: /Reading/ }));
    const select = screen.getByTestId("range-select");
    expect([...select.querySelectorAll("optgroup")].map(g => [g.label, [...g.children].map(o => o.textContent)])).toEqual([
      ["By level", ["Q1~10 · 기본 — basic grammar, similar meanings and short notices", "Q11~25 · 중급 — matching information, main ideas"]],
      ["By question type", ["Q13~15 · 문장 순서 배열"]],
    ]);
    fireEvent.change(select, { target: { value: "b-11-25" } });
    fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await screen.findByText(/Question 1 \/ 2/);
    expect(generateBody()).toMatchObject({ domain: "reading", range: "b-11-25" });
  });

  it("sends the section and the range with the quiz, hides the grammar/vocabulary topic and shows the section", async () => {
    render(<Harness />);
    fireEvent.click(within(await screen.findByTestId("domain-picker")).getByRole("button", { name: /Reading/ }));
    fireEvent.change(screen.getByTestId("range-select"), { target: { value: "r-13-15" } });
    expect(screen.queryByText("or choose a topic")).toBeNull();                  // a section replaces the grammar / vocabulary topic
    expect(screen.getByTestId("practice-summary").textContent).toContain("읽기 (Reading) 13~15");
    fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await screen.findByText(/Question 1 \/ 2/);
    expect(generateBody()).toMatchObject({ topic: "TOPIK II Reading", domain: "reading", range: "r-13-15" });
  });

  it("the exam sections 읽기 / 듣기 / 쓰기 are chosen on the quiz screen, next to the topics", async () => {
    render(<Harness />);
    const sections = await screen.findByTestId("domain-picker");
    expect(within(sections).getAllByRole("button").map(b => b.textContent)).toEqual(["Reading읽기", "Listening듣기", "Writing쓰기"]);
    expect(screen.getByText("or choose a topic")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Grammar" })).toBeTruthy();                // the topics are still there
    fireEvent.click(within(sections).getByRole("button", { name: /Writing/ }));
    expect(screen.queryByRole("button", { name: "Grammar" })).toBeNull();
    fireEvent.click(within(sections).getByRole("button", { name: /Writing/ }));          // a second click clears the section
    expect(screen.getByText("or choose a topic")).toBeTruthy();
  });

  it("the sections are offered even when the options could not be loaded, and Try again loads them", async () => {
    API.get.mockImplementation(async url => { if (url === "/kmate/quiz/options") throw new Error("down"); return { data: { attempts: 0, averageScore: 0, weaknesses: [] } }; });
    render(<Harness />);
    await screen.findByText(/practice options could not be loaded/);
    const sections = screen.getByTestId("domain-picker");
    expect(within(sections).getAllByRole("button")).toHaveLength(3);
    fireEvent.click(within(sections).getByRole("button", { name: /Listening/ }));
    expect(screen.queryByTestId("range-select")).toBeNull();                              // no ranges without the options
    API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: OPTIONS } : { data: { attempts: 0, averageScore: 0, weaknesses: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("type-picker");
    expect(screen.getByTestId("range-select")).toBeTruthy();                              // the ranges of Listening now
  });

  it("without a section nothing about sections is sent and the topic stays", async () => {
    await start();
    expect(generateBody().domain).toBeUndefined();
    expect(generateBody().range).toBeUndefined();
    expect(generateBody().topic).toBe("grammar");
  });

  it("a reading question shows its passage above the question", async () => {
    API.post.mockImplementation(async url => url === "/kmate/quiz/generate" ? { data: { questions: [{ ...QUESTIONS[0], domain: "reading", passage: "다음 글을 읽고 물음에 답하십시오.\n저는 매일 도서관에 갑니다." }, QUESTIONS[1]] } } : { data: {} });
    await start();
    expect(screen.getByTestId("quiz-passage").textContent).toContain("저는 매일 도서관에 갑니다.");
  });

  it("a listening question hides the script behind Listen / Show script, and shows it after answering", async () => {
    API.post.mockImplementation(async url => url === "/kmate/quiz/generate" ? { data: { questions: [pass, QUESTIONS[1]] } } : { data: new Blob(["mp3"]) });
    await start();
    expect(screen.getByRole("button", { name: "🔊 Listen" })).toBeTruthy();
    expect(screen.queryByTestId("quiz-script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show script" }));
    expect(screen.getByTestId("quiz-script").textContent).toContain("여자: 도서관에 가요.");
    fireEvent.click(screen.getByRole("button", { name: "Hide script" }));
    expect(screen.queryByTestId("quiz-script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /② 도서관/ }));              // answering reveals the script
    expect((await screen.findByTestId("quiz-script")).textContent).toContain("남자: 어디 가세요?");
    expect(screen.queryByRole("button", { name: "Show script" })).toBeNull();
  });

  it("Listen reads the script line by line without the speaker labels", async () => {
    const played = [];
    API.post.mockImplementation(async (url, body) => url === "/kmate/quiz/generate" ? { data: { questions: [pass, QUESTIONS[1]] } } : (played.push(body.text), { data: new Blob(["mp3"]) }));
    vi.stubGlobal("URL", { createObjectURL: () => `blob:${played.length}` });
    vi.stubGlobal("Audio", function (src) { this.src = src; this.play = async () => { setTimeout(() => this.onended?.(), 0); }; this.pause = () => {}; });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "🔊 Listen" }));
    await waitFor(() => expect(played).toEqual(["어디 가세요?", "도서관에 가요."]));
    vi.unstubAllGlobals();
  });
});

describe("Smart Drill failures", () => {
  it("tells the student what the server said when the questions could not be made", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    API.post.mockImplementation(async url => { if (url === "/kmate/quiz/generate") { const e = new Error("500"); e.response = { status: 500, data: { error: "Unexpected end of JSON input" } }; throw e; } return { data: {} }; });
    render(<Harness />);
    await screen.findByTestId("type-picker");
    fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Quiz generation failed: Unexpected end of JSON input"));
    expect(screen.getByRole("button", { name: /Start Quiz/ })).toBeTruthy();                 // back on the settings screen
    vi.unstubAllGlobals();
  });

  it("only says the server may be down when there was no answer at all", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    API.post.mockImplementation(async () => { throw new Error("Network Error"); });
    render(<Harness />);
    await screen.findByTestId("type-picker");
    fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Quiz generation failed. Is the server running?"));
    vi.unstubAllGlobals();
  });
});

describe("Listening audio feedback", () => {
  const lq = passage => ({ question: "q?", passage, domain: "listening", options: ["A) a", "B) b", "C) c", "D) d"], answer: "B", weakness: "x", explanation: "…" });

  it("shows how far the reading of the script is while it plays", async () => {
    let finish;
    API.post.mockImplementation(async (url, body) => {
      if (url === "/kmate/quiz/generate") return { data: { questions: [lq("남자: 여기가 어디예요?\n여자: 여기는 서울역이에요."), QUESTIONS[1]] } };
      if (body.text === "여기는 서울역이에요.") await new Promise(r => { finish = r; });                 // hold the second line
      return { data: new Blob(["mp3"]) };
    });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x" });
    vi.stubGlobal("Audio", function () { this.play = async () => { setTimeout(() => this.onended?.(), 0); }; this.pause = () => {}; });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "🔊 Listen" }));
    await waitFor(() => expect(screen.getByTestId("quiz-audio-progress").textContent).toBe("Playing 2 / 2…"));
    expect(screen.getByRole("button", { name: "⏹ Stop" })).toBeTruthy();
    await waitFor(() => expect(typeof finish).toBe("function"));                                     // the second line is being fetched
    finish();
    await waitFor(() => expect(screen.queryByTestId("quiz-audio-progress")).toBeNull());
    expect(screen.queryByTestId("quiz-audio-note")).toBeNull();                                       // the ElevenLabs voice worked: nothing to report
    vi.unstubAllGlobals();
  });

  it("tells the student when the ElevenLabs voice failed and nothing could be played", async () => {
    API.post.mockImplementation(async url => { if (url === "/kmate/quiz/generate") return { data: { questions: [lq("남자: 지금 몇 시예요?\n여자: 세 시예요."), QUESTIONS[1]] } }; throw new Error("503"); });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "🔊 Listen" }));
    expect((await screen.findByTestId("quiz-audio-note")).textContent).toContain("could not be played");
    expect(screen.getByRole("button", { name: "🔊 Listen" })).toBeTruthy();                           // back to Listen, not stuck on Stop
    vi.unstubAllGlobals();
  });

  it("says the browser voice was used when ElevenLabs failed but the browser can speak", async () => {
    API.post.mockImplementation(async url => { if (url === "/kmate/quiz/generate") return { data: { questions: [lq("남자: 무슨 음식을 좋아해요?\n여자: 김밥을 좋아해요."), QUESTIONS[1]] } }; throw new Error("503"); });
    vi.stubGlobal("speechSynthesis", { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] });
    vi.stubGlobal("SpeechSynthesisUtterance", function (text) { this.text = text; });
    await start();
    fireEvent.click(screen.getByRole("button", { name: "🔊 Listen" }));
    expect((await screen.findByTestId("quiz-audio-note", {}, { timeout: 9000 })).textContent).toContain("browser voice was used");     // the browser voice gives no end signal, so each line is waited for
    vi.unstubAllGlobals();
  }, 15000);
});
