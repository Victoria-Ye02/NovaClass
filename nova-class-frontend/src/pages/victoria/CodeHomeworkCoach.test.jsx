import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import API from "../../services/api";
import CodeHomeworkCoach from "./CodeHomeworkCoach";
import { runCode } from "./codeRunner";

vi.mock("../../LanguageContext", () => ({ useLang: () => ({ lang: "en", t: key => key }) }));
vi.mock("../../ThemeContext", () => ({ useTheme: () => ({ theme: "dark", toggleTheme: () => {} }) }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("./codeRunner", () => ({
  runCode: vi.fn(), restartRuntimes: vi.fn(), detectLanguage: () => "", canRun: () => true, LANGUAGE_NAMES: {},
}));

const lessonFor = name => ({
  lesson: { topic: name, explanation: "e", whereUsed: "w", example: "x", language: "python", steps: [`How to start ${name}`], concepts: [] },
  coach: { hint: `First hint for ${name}`, scaffold: "x = ___", nextStep: "go" },
});

// jsdom's localStorage is incomplete here, and the chat history lives in it.
function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); },
    clear: () => data.clear(),
  };
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  vi.stubGlobal("localStorage", memoryStorage());
  API.post.mockReset();
  API.post.mockImplementation(async (url, body) => {
    if (url !== "/kmate/code-coach") throw new Error(`unexpected ${url}`);
    if (body.action === "start") return { data: lessonFor(body.homework.includes("sum") ? "SUM" : "COUNT") };
    if (body.action === "classify") return { data: { newProblem: /new task|sum of 1 to n/i.test(body.question) } };
    if (body.action === "ask") return { data: { ask: { answer: `Answer to: ${body.question}` } } };
    if (body.action === "hint") return { data: { coach: { hint: `Next hint (#${body.hints.length + 1})`, scaffold: "y = ___", nextStep: "go on" } } };
    throw new Error(`unexpected action ${body.action}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const aiPanel = () => [...document.querySelectorAll("section")].find(el => el.querySelector('[aria-label="coachMenuTitle"]'));
const sendToPanel = text => {
  const panel = aiPanel();
  fireEvent.change(within(panel).getByRole("textbox"), { target: { value: text } });
  fireEvent.click(within(panel).getByRole("button", { name: "coachSend" }));
};
const goToChat = () => {
  const panel = aiPanel();
  fireEvent.click(within(panel).getByRole("button", { name: "coachMenuTitle" }));
  fireEvent.click(within(panel).getByRole("menuitemradio", { name: /coachTabChat/ }));
};

describe("CodeHomeworkCoach: several problems in one chat", () => {
  it("a second problem is archived above, not replacing the first, and its hints stay separate", async () => {
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");

    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");

    // the new problem shows alone; the earlier one is a page back (arrows, "1/2")
    expect(within(aiPanel()).getByText("Write the sum of 1 to n")).toBeTruthy();
    expect(screen.queryByText("First hint for COUNT")).toBeNull();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachPrevProblem" }));
    expect(within(aiPanel()).getByText("Count from 1 to 5")).toBeTruthy();
    expect(screen.getByText("First hint for COUNT")).toBeTruthy();
    expect(screen.queryByText("First hint for SUM")).toBeNull();

    // the new problem started clean: the first request carried no code from the old one
    const starts = API.post.mock.calls.filter(([, body]) => body.action === "start");
    expect(starts).toHaveLength(2);
    expect(starts[1][1].code).toBe("");
  });

  it("asking for the next hint only sends the NEW problem's hints, not the old problem's", async () => {
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");

    fireEvent.click(within(aiPanel()).getAllByRole("button", { name: "coachGiveHint" })[0]);
    await screen.findByText("Next hint (#2)");
    const hintCall = API.post.mock.calls.find(([, body]) => body.action === "hint")[1];
    expect(hintCall.hints).toEqual(["First hint for SUM"]);
    expect(hintCall.steps).toEqual(["How to start SUM"]);                 // the steps of THIS problem, to tie the hint to one
    fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachPrevProblem" }));
    expect(screen.getByText("First hint for COUNT")).toBeTruthy();       // the old problem is untouched, a page back
  });

  it("code written for the old problem is not sent to the coach for the new one", async () => {
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    fireEvent.change(document.querySelector("textarea.coach-answer"), { target: { value: "print('OLD')" } });
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");

    expect(screen.getByText("coachOldCellNo")).toBeTruthy();               // the old cell says which problem it belongs to
    const boxes = [...document.querySelectorAll("textarea.coach-answer")];
    expect(boxes.map(b => b.value)).toEqual(["print('OLD')", ""]);        // the old code is still there, a fresh cell follows
    expect(boxes[0].disabled).toBe(false);                                 // and it can still be edited
    fireEvent.click(within(aiPanel()).getAllByRole("button", { name: "coachGiveHint" })[0]);
    await screen.findByText("Next hint (#2)");
    const hintCall = API.post.mock.calls.find(([, body]) => body.action === "hint")[1];
    expect(hintCall.code).toBe("");
  });

  it("running a cell of an earlier problem checks it against THAT problem, with only its own code", async () => {
    runCode.mockReset();
    runCode.mockResolvedValue({ ok: true, output: "1\n", error: "" });
    const base = API.post.getMockImplementation();
    API.post.mockImplementation(async (url, body) => (body.action === "check" ? { data: { check: { isCorrect: true, feedback: "ok" } } } : base(url, body)));
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    fireEvent.change(document.querySelector("textarea.coach-answer"), { target: { value: "print('OLD')" } });
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");
    fireEvent.change(document.querySelectorAll("textarea.coach-answer")[1], { target: { value: "print('NEW')" } });

    fireEvent.click(screen.getByRole("button", { name: "coachRun [1]" }));        // the old problem's cell
    await waitFor(() => expect(API.post.mock.calls.some(([, b]) => b.action === "check")).toBe(true));
    const check = API.post.mock.calls.find(([, b]) => b.action === "check")[1];
    expect(check.homework).toBe("Count from 1 to 5");
    expect(check.code).toBe("print('OLD')");
  });

  it("visualizing while looking at problem 1 sends only problem 1's code and question", async () => {
    runCode.mockReset();
    runCode.mockResolvedValue({ ok: true, output: "", error: "" });
    const base = API.post.getMockImplementation();
    API.post.mockImplementation(async (url, body) => (body.action === "trace" ? { data: { trace: { total: 1, steps: [{ line: 1, memory: {}, printed: "", explanation: "x" }] } } } : body.action === "check" ? { data: { check: { isCorrect: true } } } : base(url, body)));
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    fireEvent.change(document.querySelector("textarea.coach-answer"), { target: { value: "print('ONE')" } });
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");
    fireEvent.change(document.querySelectorAll("textarea.coach-answer")[1], { target: { value: "print('TWO')" } });

    fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachMenuTitle" }));
    fireEvent.click(within(aiPanel()).getByRole("menuitemradio", { name: /coachTabViz/ }));
    fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachPrevProblem" }));   // page 1
    fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachVisualize" }));
    await waitFor(() => expect(API.post.mock.calls.some(([, b]) => b.action === "trace")).toBe(true));
    const trace = API.post.mock.calls.find(([, b]) => b.action === "trace")[1];
    expect(trace.homework).toBe("Count from 1 to 5");
    expect(trace.code).toBe("print('ONE')");
  });

  it("running a cell runs and checks only that cell's code, not the cells above it", async () => {
    runCode.mockReset();
    runCode.mockResolvedValue({ ok: true, output: "", error: "" });
    const base = API.post.getMockImplementation();
    API.post.mockImplementation(async (url, body) => (body.action === "check" ? { data: { check: { isCorrect: true } } } : base(url, body)));
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    fireEvent.change(document.querySelector("textarea.coach-answer"), { target: { value: "print('TOP')" } });
    fireEvent.click(screen.getByRole("button", { name: /coachAddCode/ }));
    fireEvent.change(document.querySelectorAll("textarea.coach-answer")[1], { target: { value: "print('LOWER')" } });

    fireEvent.click(screen.getByRole("button", { name: "coachRun [2]" }));
    await waitFor(() => expect(API.post.mock.calls.some(([, b]) => b.action === "check")).toBe(true));
    expect(runCode).toHaveBeenLastCalledWith(expect.anything(), "print('LOWER')", expect.anything());
    expect(API.post.mock.calls.find(([, b]) => b.action === "check")[1].code).toBe("print('LOWER')");
  });

  it("the ⋮ menu of an earlier problem's cell visualizes that cell and shows it on that problem's page", async () => {
    const base = API.post.getMockImplementation();
    API.post.mockImplementation(async (url, body) => (body.action === "trace"
      ? { data: { trace: { total: 1, steps: [{ line: 1, memory: {}, printed: "", explanation: "step text" }] } } }
      : base(url, body)));
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    fireEvent.change(document.querySelector("textarea.coach-answer"), { target: { value: "print('ONE')" } });
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");

    fireEvent.click(screen.getByRole("button", { name: "coachCellMenu [1]" }));
    const viz = screen.getByRole("menuitem", { name: "coachVisualize" });
    expect(viz.disabled).toBe(false);
    fireEvent.click(viz);
    await waitFor(() => expect(API.post.mock.calls.some(([, b]) => b.action === "trace")).toBe(true));
    const sent = API.post.mock.calls.find(([, b]) => b.action === "trace")[1];
    expect(sent.homework).toBe("Count from 1 to 5");
    expect(sent.code).toBe("print('ONE')");
    await screen.findByText("1/2");                                       // the panel moved to problem 1's visualizer
  });

  it("a cell can be assigned to a problem from its menu, and is then checked against that problem", async () => {
    runCode.mockReset();
    runCode.mockResolvedValue({ ok: true, output: "x\n", error: "" });
    const base = API.post.getMockImplementation();
    API.post.mockImplementation(async (url, body) => (body.action === "check" ? { data: { check: { isCorrect: true } } } : base(url, body)));
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");
    // a new cell is for the newest problem (2); the student says it belongs to problem 1
    fireEvent.change(document.querySelector("textarea.coach-answer:not([disabled])") || document.querySelectorAll("textarea.coach-answer")[0], { target: { value: "print('hello')" } });
    fireEvent.click(screen.getByRole("button", { name: "coachCellMenu [1]" }));
    expect(screen.getByRole("menuitemradio", { name: /coachCellProblem/ , checked: false })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("menuitemradio").find(el => el.getAttribute("aria-checked") === "false"));

    fireEvent.click(screen.getByRole("button", { name: "coachRun [1]" }));
    await waitFor(() => expect(API.post.mock.calls.some(([, b]) => b.action === "check")).toBe(true));
    expect(API.post.mock.calls.find(([, b]) => b.action === "check")[1].homework).toBe("Count from 1 to 5");
  });

  it("keeps the earlier problem if setting up the new one fails", async () => {
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    API.post.mockRejectedValueOnce(new Error("AI is down"));
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await waitFor(() => expect(within(aiPanel()).getByRole("textbox").value).toBe("Write the sum of 1 to n"));

    fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachMenuTitle" }));
    fireEvent.click(within(aiPanel()).getByRole("menuitemradio", { name: /coachTabHint/ }));
    expect(screen.getByText("First hint for COUNT")).toBeTruthy();
    expect(screen.queryByText("coachProblemNum")).toBeNull();            // still a single problem
  });

  it("saves both problems so they are still there when the chat is reopened", async () => {
    render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
    sendToPanel("Count from 1 to 5");
    await screen.findByText("First hint for COUNT");
    goToChat();
    fireEvent.click(within(aiPanel()).getByRole("button", { name: /coachModeNew/ }));
    sendToPanel("Write the sum of 1 to n");
    await screen.findByText("First hint for SUM");

    // the chat is saved right after each coach response
    const saved = () => JSON.parse(localStorage.getItem("kmate_coach_sessions_v2") || "[]");
    await waitFor(() => expect(saved()[0]?.problems).toHaveLength(1));
    expect(saved()[0].problems[0].homework).toBe("Count from 1 to 5");
    expect(saved()[0].problems[0].coach.hint).toBe("First hint for COUNT");
    expect(saved()[0].homework).toBe("Write the sum of 1 to n");
  });

  describe("without choosing New problem, the coach works out what a message is", () => {
    const startFirstProblem = async () => {
      render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
      sendToPanel("Count from 1 to 5");
      await screen.findByText("First hint for COUNT");
      goToChat();
    };
    const classifyCalls = () => API.post.mock.calls.filter(([, body]) => body.action === "classify");

    it("a message that is a new problem gets its own block and hints (reported case)", async () => {
      await startFirstProblem();
      sendToPanel("Write a new task: sum of 1 to n");
      await screen.findByText("First hint for SUM");

      expect(classifyCalls()).toHaveLength(1);
      expect(classifyCalls()[0][1].question).toBe("Write a new task: sum of 1 to n");
      const starts = API.post.mock.calls.filter(([, body]) => body.action === "start");
      expect(starts).toHaveLength(2);
      expect(starts[1][1].code).toBe("");
      fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachPrevProblem" }));
      expect(screen.getByText("First hint for COUNT")).toBeTruthy();         // the old one is kept, a page back
      expect(screen.getByText("1/2")).toBeTruthy();
    });

    it("an ordinary question stays in the chat and does not add a problem", async () => {
      await startFirstProblem();
      sendToPanel("I am stuck, what first?");
      await screen.findByText("Answer to: I am stuck, what first?");
      expect(classifyCalls()).toHaveLength(1);
      expect(API.post.mock.calls.filter(([, body]) => body.action === "start")).toHaveLength(1);
      expect(screen.queryByText("coachProblemNum")).toBeNull();
    });

    it("if the check itself fails it falls back to treating the message as a question", async () => {
      await startFirstProblem();
      const original = API.post.getMockImplementation();
      API.post.mockImplementation(async (url, body) => {
        if (body.action === "classify") throw new Error("classifier down");
        return original(url, body);
      });
      sendToPanel("print hello 3 times");
      await screen.findByText("Answer to: print hello 3 times");
      expect(API.post.mock.calls.filter(([, body]) => body.action === "start")).toHaveLength(1);
    });

    it("choosing 'Ask about this problem' skips the check entirely", async () => {
      await startFirstProblem();
      fireEvent.click(within(aiPanel()).getByRole("button", { name: "coachModeAsk" }));
      sendToPanel("Write a new task: sum of 1 to n");
      await screen.findByText("Answer to: Write a new task: sum of 1 to n");
      expect(classifyCalls()).toHaveLength(0);
    });

    it("the quick-question pills never trigger a new problem", async () => {
      await startFirstProblem();
      fireEvent.click(within(aiPanel()).getByText("coachSuggestStart"));
      await screen.findByText("Answer to: coachSuggestStart");
      expect(classifyCalls()).toHaveLength(0);
    });
  });
});

describe("CodeHomeworkCoach notebook: running a cell opens the next one", () => {
  const renderCoach = () => render(<MemoryRouter><CodeHomeworkCoach header={null} /></MemoryRouter>);
  const cellBoxes = () => [...document.querySelectorAll("textarea.coach-answer")];
  const typeInto = (index, code) => fireEvent.change(cellBoxes()[index], { target: { value: code } });
  const run = index => fireEvent.click(screen.getByRole("button", { name: `coachRun [${index}]` }));

  beforeEach(() => { runCode.mockReset(); runCode.mockResolvedValue({ ok: true, output: "hi\n", error: "" }); });

  it("starts with one cell, and running it adds an empty one below that takes the cursor", async () => {
    renderCoach();
    expect(cellBoxes()).toHaveLength(1);
    typeInto(0, "print('hi')");
    run(1);
    await waitFor(() => expect(cellBoxes()).toHaveLength(2));
    expect(cellBoxes()[1].value).toBe("");
    expect(document.activeElement).toBe(cellBoxes()[1]);
    expect(cellBoxes()[0].value).toBe("print('hi')");
  });

  it("re-running the same cell does not pile up empty cells", async () => {
    renderCoach();
    typeInto(0, "print('hi')");
    run(1);
    await waitFor(() => expect(cellBoxes()).toHaveLength(2));
    run(1);
    await waitFor(() => expect(runCode).toHaveBeenCalledTimes(2));
    run(1);
    await waitFor(() => expect(runCode).toHaveBeenCalledTimes(3));
    expect(cellBoxes()).toHaveLength(2);
  });

  it("running a cell that already has one after it adds nothing", async () => {
    renderCoach();
    typeInto(0, "a = 1");
    run(1);
    await waitFor(() => expect(cellBoxes()).toHaveLength(2));
    typeInto(1, "print(a)");
    run(2);
    await waitFor(() => expect(cellBoxes()).toHaveLength(3));        // the second cell was last: a third appears

    run(1);                                                           // the first cell is not last
    await waitFor(() => expect(runCode).toHaveBeenCalledTimes(3));
    expect(cellBoxes()).toHaveLength(3);
  });

  it("Shift+Enter in a cell runs it and opens the next, like Colab", async () => {
    renderCoach();
    typeInto(0, "print('hi')");
    fireEvent.keyDown(cellBoxes()[0], { key: "Enter", shiftKey: true });
    await waitFor(() => expect(cellBoxes()).toHaveLength(2));
    expect(runCode).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty cell", () => {
    renderCoach();
    run(1);
    expect(runCode).not.toHaveBeenCalled();
    expect(cellBoxes()).toHaveLength(1);
  });

  it("'Run all' also leaves a fresh cell at the end", async () => {
    renderCoach();
    typeInto(0, "a = 1");
    fireEvent.click(screen.getByRole("button", { name: /coachAddCode/ }));
    await waitFor(() => expect(cellBoxes()).toHaveLength(2));
    typeInto(1, "print(a)");
    fireEvent.click(screen.getByRole("button", { name: /coachRunAll/ }));
    await waitFor(() => expect(cellBoxes()).toHaveLength(3));
    expect(cellBoxes()[2].value).toBe("");
  });

  it("a run that fails still opens the next cell, once", async () => {
    runCode.mockResolvedValue({ ok: false, output: "", error: "NameError" });
    renderCoach();
    typeInto(0, "print(x)");
    run(1);
    await waitFor(() => expect(cellBoxes()).toHaveLength(2));
    run(1);
    await waitFor(() => expect(runCode).toHaveBeenCalledTimes(2));
    expect(cellBoxes()).toHaveLength(2);
  });

  describe("reopening a saved chat", () => {
    const savedSession = cells => ({
      id: "saved-1", title: "Old chat", updatedAt: 1, homework: "", cells, wrongStreak: 0,
      lesson: null, coach: null, history: [], problems: [], trace: null, chat: [],
    });
    const openSaved = async cells => {
      localStorage.setItem("kmate_coach_sessions_v2", JSON.stringify([savedSession(cells)]));
      renderCoach();
      fireEvent.click((await screen.findAllByText("Old chat"))[0]);
    };

    it("puts an empty cell after a last cell that was already run (the reported case)", async () => {
      await openSaved([{ id: "c1", code: "print('Hello, Nova!')", result: { ok: true, output: "Hello, Nova!\n", error: "" } }]);
      await waitFor(() => expect(cellBoxes()).toHaveLength(2));
      expect(cellBoxes()[0].value).toBe("print('Hello, Nova!')");
      expect(cellBoxes()[1].value).toBe("");
    });

    it("also does it for a last cell that has code but was never run", async () => {
      await openSaved([{ id: "c1", code: "x = 1", result: null }]);
      await waitFor(() => expect(cellBoxes()).toHaveLength(2));
    });

    it("adds nothing when the saved chat already ends with an empty cell", async () => {
      await openSaved([{ id: "c1", code: "x = 1", result: null }, { id: "c2", code: "", result: null }]);
      await waitFor(() => expect(cellBoxes()[0].value).toBe("x = 1"));
      expect(cellBoxes()).toHaveLength(2);
    });

    it("leaves a chat that only has one empty cell alone", async () => {
      await openSaved([{ id: "c1", code: "", result: null }]);
      await waitFor(() => expect(cellBoxes()).toHaveLength(1));
    });
  });
});
