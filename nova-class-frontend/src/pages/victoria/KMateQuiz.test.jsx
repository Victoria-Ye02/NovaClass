import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

vi.mock("@elevenlabs/client", () => ({ Conversation: {} }));
vi.mock("../../components/Sidebar", () => ({ default: () => null }));
vi.mock("./CodeHomeworkCoach", () => ({ default: () => null }));
vi.mock("../../LanguageContext", () => ({ useLang: () => ({ lang: "en", t: key => key }) }));
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
  { question: "한국에 온 지 일 년이 ( ).", options: ["A) 됐다", "B) 된다", "C) 되고", "D) 되면"], answer: "A", weakness: "-(으)ㄴ 지 + 시간", explanation: "시간이 지났음을 나타냅니다." },
  { question: "비가 와서 길이 ( ).", options: ["A) 막았다", "B) 막혔다", "C) 막고", "D) 막으면"], answer: "B", weakness: "피동 표현", explanation: "길이 막힘을 당했으므로 피동입니다." },
];

const STRATEGY = { typeKey: "sentence_order", label: "Sentence order", ko: "문장 순서", language: "en", overview: "This type tests how a passage flows.", steps: ["Find the sentence that can open the passage", "Follow the pronouns"], tips: ["Look at 그래서 and 그러나"], mistakes: ["Ignoring connectives"] };
const GRAMMAR = { kind: "grammar", point: "피동 표현", language: "en", rule: "The subject receives the action.", form: "verb stem + -이/히/리/기-", notes: ["Not the same as -아/어 지다"], examples: [
  { ko: "문이 바람에 닫혔어요.", translation: "The door was shut by the wind." },
  { ko: "길이 눈 때문에 막혔어요.", translation: "The road was blocked by snow." },
  { ko: "책이 많이 읽혀요.", translation: "The book is widely read." },
] };

const OPTIONS = {
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
afterEach(cleanup);

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
