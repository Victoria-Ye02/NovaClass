import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@elevenlabs/client", () => ({ Conversation: {} }));
vi.mock("../../components/Sidebar", () => ({ default: () => <nav>sidebar</nav> }));
vi.mock("./CodeHomeworkCoach", () => ({ default: () => null }));
vi.mock("../../LanguageContext", () => ({ useLang: () => ({ lang: "en", t: key => key }) }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import API from "../../services/api";
import SmartDrill from "./SmartDrill";
import { toAsciiDigits, clampQuestion } from "./questionNumber";

afterEach(cleanup);

describe("Smart Drill page", () => {
  it("shows only skill, question span, and a single start-practice action", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options"
      ? { data: { types: [{ key: "sentence_order", label: "Sentence order", ko: "문장 순서", description: "" }], difficulties: [{ key: "easy", label: "Easy" }] } }
      : { data: { attempts: 1, averageScore: 50, weaknesses: [{ weakness: "피동 표현", asked: 2, wrong: 1, accuracy: 50 }] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Smart Drill" })).toBeTruthy();
    const skills = await screen.findByTestId("domain-picker");
    expect(skills.textContent).toContain("Reading");
    expect(screen.queryByTestId("type-picker")).toBeNull();
    expect(screen.queryByText("Number of Questions")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Reading/ }));
    expect(screen.getByTestId("range-start")).toBeTruthy();
    expect(screen.getByTestId("range-end")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start Smart Practice/ })).toBeTruthy();
  });

  it("makes one question for every selected number and lets the student submit all answers together", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options"
      ? { data: { types: [], difficulties: [] } }
      : { data: { attempts: 0, averageScore: 0, weaknesses: [] } });
    API.post.mockResolvedValue({ data: { questions: [
      { question: "첫 번째 문제", options: ["A) 하나", "B) 둘", "C) 셋", "D) 넷"], answer: "A", explanation: "설명" },
      { question: "두 번째 문제", options: ["A) 하나", "B) 둘", "C) 셋", "D) 넷"], answer: "B", explanation: "설명" },
    ] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Reading/ }));
    fireEvent.change(screen.getByTestId("range-start"), { target: { value: "6" } });
    fireEvent.change(screen.getByTestId("range-end"), { target: { value: "23" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Smart Practice/ }));
    await screen.findByText(/첫 번째 문제/);
    expect(API.post).toHaveBeenCalledWith("/kmate/quiz/generate", expect.objectContaining({ count: 18, startQuestion: 6, endQuestion: 23 }));
    expect(screen.getAllByTestId("drill-question")).toHaveLength(2);
    expect(screen.getAllByTestId("drill-number").map(n => n.textContent)).toEqual(["Question 1", "Question 2"]);          // no numbers from the server: counted from 1
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    const check = screen.getByRole("button", { name: /Check my answers/ });
    expect(check.disabled).toBe(true);
    fireEvent.click(within(screen.getAllByTestId("drill-question")[0]).getByRole("button", { name: /하나/ }));
    fireEvent.click(within(screen.getAllByTestId("drill-question")[1]).getByRole("button", { name: /둘/ }));
    expect(check.disabled).toBe(false);
  });

  describe("the question number boxes", () => {
    const openReading = async () => {
      API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: { types: [], difficulties: [] } } : { data: { attempts: 0, averageScore: 0, weaknesses: [] } });
      render(<MemoryRouter><SmartDrill /></MemoryRouter>);
      fireEvent.click(await screen.findByRole("button", { name: /Reading/ }));
    };

    it("are text boxes that start with the whole section, so any keyboard layout can type in them", async () => {
      await openReading();
      for (const id of ["range-start", "range-end"]) {
        expect(screen.getByTestId(id).type).toBe("text");
        expect(screen.getByTestId(id).getAttribute("inputmode")).toBe("numeric");
      }
      expect(screen.getByTestId("range-start").value).toBe("1");
      expect(screen.getByTestId("range-end").value).toBe("50");
    });

    it("turn Burmese and full-width digits into 0-9 and drop letters", async () => {
      await openReading();
      fireEvent.change(screen.getByTestId("range-start"), { target: { value: "၅" } });
      expect(screen.getByTestId("range-start").value).toBe("5");
      fireEvent.change(screen.getByTestId("range-end"), { target: { value: "１２abc" } });
      expect(screen.getByTestId("range-end").value).toBe("12");
      fireEvent.change(screen.getByTestId("range-end"), { target: { value: "၂၀" } });
      expect(screen.getByTestId("range-end").value).toBe("20");
    });

    it("can be emptied and retyped, and are put right when the student leaves them", async () => {
      await openReading();
      const start = screen.getByTestId("range-start");
      fireEvent.change(start, { target: { value: "" } });
      expect(start.value).toBe("");                                           // the box really can be cleared
      fireEvent.change(start, { target: { value: "7" } });
      expect(start.value).toBe("7");
      fireEvent.change(start, { target: { value: "" } });
      fireEvent.blur(start);
      expect(start.value).toBe("1");                                          // empty -> the first question
      fireEvent.change(screen.getByTestId("range-end"), { target: { value: "99" } });
      fireEvent.blur(screen.getByTestId("range-end"));
      expect(screen.getByTestId("range-end").value).toBe("50");               // too big -> the last question
    });

    it("selects the whole number when the student clicks into a box, so typing replaces it", async () => {
      await openReading();
      for (const id of ["range-start", "range-end"]) {
        const box = screen.getByTestId(id);
        fireEvent.focus(box);
        expect([box.selectionStart, box.selectionEnd]).toEqual([0, box.value.length]);
        expect(box.value.length).toBeGreaterThan(0);
      }
    });

    it("sends the Burmese-typed span as numbers, one question per number", async () => {
      await openReading();
      API.post.mockResolvedValue({ data: { questions: [{ question: "문제", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", explanation: "…" }] } });
      fireEvent.change(screen.getByTestId("range-start"), { target: { value: "၆" } });
      fireEvent.change(screen.getByTestId("range-end"), { target: { value: "၈" } });
      fireEvent.click(screen.getByRole("button", { name: /Start Smart Practice/ }));
      await waitFor(() => expect(API.post).toHaveBeenCalledWith("/kmate/quiz/generate", expect.objectContaining({ count: 3, startQuestion: 6, endQuestion: 8 })));
    });
  });

  it("converts digits and clamps question numbers", () => {
    expect(toAsciiDigits("၁၂၃")).toBe("12");                                  // at most 2 digits
    expect(toAsciiDigits("４７")).toBe("47");
    expect(toAsciiDigits("a1b2")).toBe("12");
    expect(toAsciiDigits(undefined)).toBe("");
    expect(clampQuestion("", 1, 50, 1)).toBe("1");
    expect(clampQuestion("0", 1, 50, 1)).toBe("1");
    expect(clampQuestion("60", 1, 50, 1)).toBe("50");
    expect(clampQuestion("52", 51, 54, 51)).toBe("52");
  });

  it("shows one ※ in front of the instruction even when the model wrote its own", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: { types: [], difficulties: [] } } : { data: { attempts: 0, averageScore: 0, weaknesses: [] } });
    API.post.mockResolvedValue({ data: { questions: [{ question: "※ ※ [1~2] 다음을 듣고 알맞은 그림을 고르십시오.", passage: "남자: 안녕하세요.", domain: "listening", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", explanation: "…" }] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Listening/ }));
    fireEvent.change(screen.getByTestId("range-start"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("range-end"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Smart Practice/ }));
    expect((await screen.findByTestId("drill-instruction")).textContent).toBe("※ [1~2] 다음을 듣고 알맞은 그림을 고르십시오.");
  });

  it("numbers the questions as the exam does (the number the server sent) and shows the instruction as a small ※ line above the text", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: { types: [], difficulties: [] } } : { data: { attempts: 0, averageScore: 0, weaknesses: [] } });
    API.post.mockResolvedValue({ data: { questions: [
      { number: 6, domain: "reading", question: "무엇에 대한 글입니까?", passage: "신선한 우유, 오늘 아침에 짠 우유입니다.", options: ["A) 우유", "B) 빵", "C) 물", "D) 차"], answer: "A", explanation: "…" },
      { number: 7, domain: "reading", question: "다음 글의 내용과 같은 것을 고르십시오.", passage: "도서관은 오후 6시까지 엽니다.", options: ["A) 1", "B) 2", "C) 3", "D) 4"], answer: "B", explanation: "…" },
    ] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Reading/ }));
    fireEvent.change(screen.getByTestId("range-start"), { target: { value: "6" } });
    fireEvent.change(screen.getByTestId("range-end"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Smart Practice/ }));
    await screen.findByText("신선한 우유, 오늘 아침에 짠 우유입니다.");
    expect(screen.getAllByTestId("drill-number").map(n => n.textContent)).toEqual(["Question 6", "Question 7"]);
    const first = screen.getAllByTestId("drill-question")[0];
    expect(within(first).getByTestId("drill-instruction").textContent).toBe("※ 무엇에 대한 글입니까?");
    const order = [...first.children].map(c => c.dataset.testid);
    expect(order.indexOf("drill-instruction")).toBeLessThan(order.indexOf("quiz-passage"));       // the instruction comes first, then the text
    expect(API.post).toHaveBeenCalledWith("/kmate/quiz/generate", expect.objectContaining({ count: 2, startQuestion: 6, endQuestion: 7 }));
  });
});

describe("the Master Tip follows the chosen level", () => {
  it("gives a short goal for each skill, for Level 3~4 and for Level 5~6", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: { types: [], difficulties: [] } } : { data: { attempts: 0, averageScore: 0, weaknesses: [] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    expect(await screen.findByText(/TOPIK Level 5~6 Master Tip/)).toBeTruthy();              // Level 5~6 is chosen at the start
    fireEvent.click(screen.getByRole("button", { name: /Level 3~4/ }));
    expect(screen.getByText(/TOPIK Level 3~4 Master Tip/)).toBeTruthy();
    expect(screen.getByText(/Q1~25 all correct/)).toBeTruthy();
    expect(screen.getByText(/Q1~20 all correct/)).toBeTruthy();
    expect(screen.getByText(/Finish Q51~52/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Level 5~6/ }));
    expect(screen.getByText(/TOPIK Level 5~6 Master Tip/)).toBeTruthy();
  });
});

describe("practising a missed point again", () => {
  it("asks for the chosen number of new questions of that one point", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: { types: [], difficulties: [] } } : { data: { attempts: 2, averageScore: 40, weaknesses: [{ source: "quiz", weakness: "피동 표현", asked: 4, wrong: 3, accuracy: 25 }, { source: "exam", skillArea: "reading", weakness: "short article fill in", asked: 6, wrong: 4, accuracy: 33 }] } });
    API.post.mockResolvedValue({ data: { questions: [{ question: "연습 문제", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", explanation: "…" }] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    const choose = await screen.findByLabelText("Questions to practise: short article fill in");
    fireEvent.change(choose, { target: { value: "8" } });
    fireEvent.click(within(choose.closest("li")).getByRole("button", { name: "Practice" }));
    await screen.findByText(/연습 문제/);
    expect(API.post).toHaveBeenCalledWith("/kmate/quiz/followup", expect.objectContaining({
      weaknesses: ["TOPIK II reading question type: short article fill in"], count: 8,
    }));
  });
});

describe("missed question numbers", () => {
  const withNumbers = () => API.get.mockImplementation(async url => url === "/kmate/quiz/options" ? { data: { types: [], difficulties: [] } } : { data: { attempts: 2, averageScore: 40, weaknesses: [{ source: "quiz", weakness: "피동 표현", asked: 4, wrong: 3, accuracy: 25 }], missedNumbers: [{ domain: "reading", number: 13, asked: 4, wrong: 3, accuracy: 25 }, { domain: "listening", number: 7, asked: 2, wrong: 2, accuracy: 0 }] } });

  it("lists the exam numbers the student got wrong instead of the point names", async () => {
    withNumbers();
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    const list = await screen.findByTestId("missed-numbers");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("📖 Reading Q13")).toBeTruthy();
    expect(within(list).getByText("🎧 Listening Q7")).toBeTruthy();
    expect(screen.queryByText("피동 표현")).toBeNull();
    expect(screen.getByText("2 to review", { selector: "span" })).toBeTruthy();
  });

  it("practises one number again: new questions for that number, shown under that number", async () => {
    withNumbers();
    API.post.mockResolvedValue({ data: { questions: [{ question: "연습 A", options: ["A) a", "B) b", "C) c", "D) d"], answer: "A", explanation: "…" }, { question: "연습 B", options: ["A) a", "B) b", "C) c", "D) d"], answer: "B", explanation: "…" }] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    const choose = await screen.findByLabelText("Questions to practise: reading Q13");
    fireEvent.change(choose, { target: { value: "8" } });
    fireEvent.click(within(choose.closest("li")).getByRole("button", { name: "Practice" }));
    await screen.findByText(/연습 A/);
    expect(API.post).toHaveBeenCalledWith("/kmate/quiz/generate", expect.objectContaining({ domain: "reading", startQuestion: 13, endQuestion: 13, count: 8 }));
    expect(screen.getAllByTestId("drill-number").map(n => n.textContent)).toEqual(["Question 13", "Question 13"]);
  });
});
