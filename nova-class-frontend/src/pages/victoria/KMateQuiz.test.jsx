import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("@elevenlabs/client", () => ({ Conversation: {} }));
vi.mock("../../components/Sidebar", () => ({ default: () => null }));
vi.mock("./CodeHomeworkCoach", () => ({ default: () => null }));
vi.mock("../../LanguageContext", () => ({ useLang: () => ({ lang: "en", t: key => key }) }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import API from "../../services/api";
import { QuizMode } from "./KMate";

const QUESTIONS = [
  { question: "한국에 온 지 일 년이 ( ).", options: ["A) 됐다", "B) 된다", "C) 되고", "D) 되면"], answer: "A", weakness: "-(으)ㄴ 지 + 시간", explanation: "시간이 지났음을 나타냅니다." },
  { question: "비가 와서 길이 ( ).", options: ["A) 막았다", "B) 막혔다", "C) 막고", "D) 막으면"], answer: "B", weakness: "피동 표현", explanation: "길이 막힘을 당했으므로 피동입니다." },
];

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
  render(<QuizMode />);
  fireEvent.click(screen.getByRole("button", { name: /3 Questions/ }));
  fireEvent.click(screen.getByRole("button", { name: /Start Quiz/ }));
  await screen.findByText(/Question 1 \/ 2/);
};

describe("K-Mate practice quiz: weak points", () => {
  it("lists the student's weak points and practises one of them", async () => {
    render(<QuizMode />);
    const panel = await screen.findByTestId("weak-points");
    expect(panel.textContent).toContain("피동 표현");
    expect(panel.textContent).toContain("3 wrong / 4");
    fireEvent.click(screen.getAllByRole("button", { name: "Practice" })[0]);
    await screen.findByText(/Weak-point practice/);
    const call = API.post.mock.calls.find(([url]) => url === "/kmate/quiz/followup");
    expect(call[1].weaknesses).toEqual(["피동 표현"]);
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
    render(<QuizMode />);
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
    render(<QuizMode />);
    await screen.findByRole("button", { name: /Start Quiz/ });
    expect(screen.queryByTestId("type-picker")).toBeNull();
  });
});
