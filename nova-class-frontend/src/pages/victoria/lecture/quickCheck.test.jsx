import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import API from "../../../services/api";
import QuizCard from "./QuizCard";
import useQuickCheck from "./useQuickCheck";

vi.mock("../../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const QUESTION = { available: true, quizId: 7, kind: "mcq", question: "What does a primary key do?", options: ["Identifies a row", "Sorts", "Encrypts", "Deletes"] };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("useQuickCheck", () => {
  it("loads a question without receiving the answer, then grades the pick on the server", async () => {
    API.get.mockResolvedValue({ data: QUESTION });
    API.post.mockResolvedValue({ data: { correct: true, correctIndex: 0, explanation: "Because.", practicePrompt: "Your turn." } });
    const { result } = renderHook(() => useQuickCheck({ materialId: 9, lang: "ko" }));

    await act(async () => { await result.current.open(3); });
    expect(API.get).toHaveBeenCalledWith("/classroom/materials/9/lecture/3/quiz", { params: { lang: "ko" } });
    expect(result.current.quiz.status).toBe("ready");
    expect(result.current.quiz.data).not.toHaveProperty("answer");
    expect(result.current.quiz.result).toBeNull();

    await act(async () => { await result.current.pick(0); });
    expect(API.post).toHaveBeenCalledWith("/classroom/materials/9/lecture/quiz/7/answer", { choice: 0 });
    expect(result.current.quiz.status).toBe("answered");
    expect(result.current.quiz.result.correct).toBe(true);
  });

  it("stays out of the way when the slide has no quiz", async () => {
    API.get.mockResolvedValue({ data: { available: false } });
    const { result } = renderHook(() => useQuickCheck({ materialId: 9, lang: "en" }));
    await act(async () => { await result.current.open(1); });
    expect(result.current.quiz.status).toBe("idle");
  });

  it("surfaces a failed load instead of hanging", async () => {
    API.get.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useQuickCheck({ materialId: 9, lang: "en" }));
    await act(async () => { await result.current.open(1); });
    expect(result.current.quiz.status).toBe("error");
  });

  it("ignores a slow answer that arrives after the student dismissed the check", async () => {
    let resolveGet;
    API.get.mockReturnValue(new Promise(resolve => { resolveGet = resolve; }));
    const { result } = renderHook(() => useQuickCheck({ materialId: 9, lang: "en" }));
    act(() => { result.current.open(1); });
    act(() => { result.current.dismiss(); });
    await act(async () => { resolveGet({ data: QUESTION }); });
    expect(result.current.quiz.status).toBe("idle");
  });
});

describe("QuizCard", () => {
  const base = { status: "ready", page: 1, data: QUESTION, picked: null, result: null };

  it("renders nothing when idle", () => {
    const { container } = render(<QuizCard quiz={{ status: "idle" }} />);
    expect(container.firstChild).toBeNull();
  });

  it("lets the student pick an option or skip", () => {
    const onPick = vi.fn();
    const onSkip = vi.fn();
    render(<QuizCard quiz={base} onPick={onPick} onSkip={onSkip} />);
    fireEvent.click(screen.getByLabelText("B. Sorts"));
    expect(onPick).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText("Skip"));
    expect(onSkip).toHaveBeenCalled();
  });

  it("shows instant feedback with the reason, then offers practice or the next slide", () => {
    const onNext = vi.fn();
    const onYourTurn = vi.fn();
    render(
      <QuizCard
        quiz={{ ...base, status: "answered", picked: 1, result: { correct: false, correctIndex: 0, explanation: "It identifies each row.", practicePrompt: "Write a key." } }}
        onNext={onNext}
        onYourTurn={onYourTurn}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Not quite.");
    expect(screen.getByRole("status").textContent).toContain("It identifies each row.");
    expect(screen.queryByText("Skip")).toBeNull();

    fireEvent.click(screen.getByText(/Your turn/));
    expect(onYourTurn).toHaveBeenCalledWith("Write a key.");
    fireEvent.click(screen.getByText(/Next slide/));
    expect(onNext).toHaveBeenCalled();
  });

  it("disables the options while the answer is being graded", () => {
    render(<QuizCard quiz={{ ...base, status: "grading", picked: 0 }} onPick={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByLabelText("A. Identifies a row").disabled).toBe(true);
  });

  it("renders true/false as two labelled buttons", () => {
    const tf = { ...base, data: { ...QUESTION, kind: "tf", question: "Keys repeat.", options: ["True", "False"] } };
    render(<QuizCard quiz={tf} onPick={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByLabelText("True")).toBeTruthy();
    expect(screen.getByLabelText("False")).toBeTruthy();
  });
});
