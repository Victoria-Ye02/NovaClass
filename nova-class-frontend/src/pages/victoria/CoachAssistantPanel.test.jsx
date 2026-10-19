import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoachAssistantPanel from "./CoachAssistantPanel";

// Keys come back as their own text, so the tests read the same in every language.
vi.mock("../../LanguageContext", () => ({
  useLang: () => ({ lang: "en", t: key => key }),
}));

function renderPanel(props = {}) {
  return render(
    <CoachAssistantPanel
      lesson={null} coach={null} history={[]} trace={null} onCloseTrace={() => {}} onVisualize={() => {}}
      vizLoading={false} review={null} onReview={() => {}} reviewLoading={false}
      chat={[]} asking={false} askError="" onAsk={async () => true} homeworkSet={false}
      attachment={null} onAttach={() => {}} onRemoveAttachment={() => {}}
      sessions={[]} activeId="a" onOpenSession={() => {}}
      {...props}
    />,
  );
}

const menuButton = () => screen.getByRole("button", { name: "coachMenuTitle" });

// jsdom has no Element.scrollTo, which the Chat section uses to follow new messages.
beforeEach(() => { Element.prototype.scrollTo = vi.fn(); });
afterEach(cleanup);

describe("CoachAssistantPanel service menu", () => {
  it("shows one menu button and the open section's name, not a row of tabs", () => {
    renderPanel();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(menuButton().getAttribute("aria-haspopup")).toBe("menu");
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("coachTabChat")).toBeTruthy();      // no homework yet → starts in Chat
  });

  it("drops a vertical list of every helper when the button is pressed, with the current one checked", () => {
    renderPanel();
    fireEvent.click(menuButton());
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map(item => item.textContent.replace("✓", ""))).toEqual(["coachTabHint", "coachTabConcepts", "coachTabViz", "coachTabReview", "coachTabChat"]);
    expect(items.map(item => item.getAttribute("aria-checked"))).toEqual(["false", "false", "false", "false", "true"]);
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
  });

  it("starts on the hints section once a homework is set", () => {
    renderPanel({ homeworkSet: true });
    expect(screen.getByText("coachTabHint")).toBeTruthy();
  });

  it("opens the chosen helper, closes the menu and updates the heading", () => {
    renderPanel({ homeworkSet: true });
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("menuitemradio", { name: /coachTabReview/ }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("coachTabReview")).toBeTruthy();
    expect(screen.getByText("coachReviewBtn")).toBeTruthy();    // the Code Review section's own button
  });

  it("closes on Escape and when the student clicks elsewhere", () => {
    renderPanel();
    fireEvent.click(menuButton());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(menuButton());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves between the options with the arrow keys", () => {
    renderPanel();
    fireEvent.click(menuButton());
    const items = screen.getAllByRole("menuitemradio");
    expect(document.activeElement).toBe(items[4]);              // opens on the current one
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);              // wraps round
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[4]);
  });
});


const lesson = {
  steps: ["Make a list.", "Loop over it."],
  concepts: [{ name: "for loop", what: "Repeats a block.", how: "for x in items:", example: "for i in range(3): print(i)" }],
};
const hint = (n, extra = {}) => ({ hint: `hint text ${n}`, scaffold: `code ${n} ___`, nextStep: `try ${n}`, ...extra });

describe("Hints and Core Concepts are separate sections", () => {
  const open = name => {
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("menuitemradio", { name: new RegExp(name) }));
  };

  it("Hints holds the how-to-start guide and the hints; the concepts are not mixed in", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(1) });
    expect(screen.getByText("Make a list.")).toBeTruthy();
    expect(screen.getByText("hint text 1")).toBeTruthy();
    expect(screen.queryByText("for loop")).toBeNull();
    expect(screen.queryByText("coachConceptsTitle")).toBeNull();
  });

  it("Core Concepts holds only the concepts", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(1) });
    open("coachTabConcepts");
    expect(screen.getByText("for loop")).toBeTruthy();
    expect(screen.getByText("Repeats a block.")).toBeTruthy();
    expect(screen.queryByText("hint text 1")).toBeNull();
    expect(screen.queryByText("Make a list.")).toBeNull();
  });

  it("every hint stays on screen, oldest first, with the newest at the bottom", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(3), history: [hint(1), hint(2)] });
    const texts = screen.getAllByText(/^hint text \d$/).map(el => el.textContent);
    expect(texts).toEqual(["hint text 1", "hint text 2", "hint text 3"]);
    expect(screen.getAllByText("coachHintNum")).toHaveLength(3);          // one numbered card each (mocked t returns the key)
  });

  it("only the newest hint shows its 'try next' prompt", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(2), history: [hint(1)] });
    expect(screen.getAllByText(/coachTryNext/)).toHaveLength(1);
    expect(screen.getByText(/coachTryNext: try 2/)).toBeTruthy();
  });

  it("asks for the next hint from a button right under the hints", () => {
    const onNextHint = vi.fn();
    renderPanel({ homeworkSet: true, lesson, coach: hint(1), onNextHint });
    fireEvent.click(screen.getByRole("button", { name: "coachGiveHint" }));
    expect(onNextHint).toHaveBeenCalledTimes(1);
  });

  it("disables that button and says so while the next hint is being prepared", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(1), onNextHint: vi.fn(), hintLoading: true });
    expect(screen.getByRole("button", { name: "coachGiveHint" }).disabled).toBe(true);
    expect(screen.getByText("coachPreparing")).toBeTruthy();
  });

  it("jumps to Hints when a new hint arrives while another section is open", () => {
    const props = { homeworkSet: true, lesson, coach: hint(1), history: [] };
    const { rerender } = renderPanel(props);
    open("coachTabConcepts");
    expect(screen.queryByText("hint text 2")).toBeNull();

    rerender(
      <CoachAssistantPanel
        {...props} coach={hint(2)} history={[hint(1)]}
        trace={null} onCloseTrace={() => {}} onVisualize={() => {}} vizLoading={false} review={null} onReview={() => {}} reviewLoading={false}
        chat={[]} asking={false} askError="" onAsk={async () => true} attachment={null} onAttach={() => {}} onRemoveAttachment={() => {}}
        sessions={[]} activeId="a" onOpenSession={() => {}}
      />,
    );
    expect(screen.getByText("hint text 1")).toBeTruthy();
    expect(screen.getByText("hint text 2")).toBeTruthy();
    expect(screen.queryByText("for loop")).toBeNull();
  });

  it("without a lesson, Hints and Concepts both point to the chat to start", () => {
    renderPanel({ homeworkSet: false });
    open("coachTabHint");
    fireEvent.click(screen.getByRole("button", { name: /coachGoChat/ }));
    expect(screen.getByText("coachTabChat")).toBeTruthy();
  });
});

describe("The homework question stays visible above the hints", () => {
  const long = "Write a Python program that prints a 5x5 square made of stars using nested for loops. ".repeat(3);

  it("shows the question at the top of the Hints section, above the guide and the hints", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(1), homework: "Print 1 to 5 with a for loop." });
    expect(screen.getByText("coachQuestionTitle")).toBeTruthy();
    const question = screen.getByText("Print 1 to 5 with a for loop.");
    const guide = screen.getByText("Make a list.");
    // document order: question first
    expect(question.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /coachShowMore/ })).toBeNull();   // short: nothing to expand
  });

  it("keeps showing it as more hints are added", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(3), history: [hint(1), hint(2)], homework: "Print 1 to 5 with a for loop." });
    expect(screen.getByText("Print 1 to 5 with a for loop.")).toBeTruthy();
    expect(screen.getAllByText(/^hint text \d$/)).toHaveLength(3);
  });

  it("collapses a long question and lets the student expand and collapse it", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(1), homework: long });
    const toggle = screen.getByRole("button", { name: "coachShowMore" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "coachShowLess" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "coachShowLess" }));
    expect(screen.getByRole("button", { name: "coachShowMore" })).toBeTruthy();
  });

  it("is not repeated in the other sections", () => {
    renderPanel({ homeworkSet: true, lesson, coach: hint(1), homework: "Print 1 to 5 with a for loop." });
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("menuitemradio", { name: /coachTabConcepts/ }));
    expect(screen.queryByText("Print 1 to 5 with a for loop.")).toBeNull();
  });

  it("shows no question card when there is no homework yet", () => {
    renderPanel({ homeworkSet: false, homework: "" });
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("menuitemradio", { name: /coachTabHint/ }));
    expect(screen.queryByText("coachQuestionTitle")).toBeNull();
  });
});


describe("A saved lesson in another language than Settings", () => {
  const englishLesson = { steps: ["Start by defining a variable to store the score.", "Use the input() function to get the score."] };
  const englishHint = { hint: "Start by getting the score from the user using input().", scaffold: "score = input()", nextStep: "Write the code to get the user's score." };
  const burmeseLesson = { steps: ["ပထမဆုံး အမှတ်ကို သိမ်းဖို့ variable တစ်ခု ဖန်တီးပါ။", "input() သုံးပြီး အမှတ်ကို လက်ခံပါ။"] };
  const burmeseHint = { hint: "အသုံးပြုသူဆီက အမှတ်ကို input() နဲ့ ယူပါ။", scaffold: "score = input()", nextStep: "အမှတ်ကို ယူတဲ့ကုဒ်ကို ရေးကြည့်ပါ။" };

  // Settings is English in the shared mock, so a Burmese lesson is the mismatch here.
  it("offers to rewrite it, naming the current language", () => {
    renderPanel({ homeworkSet: true, lesson: burmeseLesson, coach: burmeseHint, homework: "x", onRegenerate: vi.fn() });
    expect(screen.getByRole("status").textContent).toContain("coachLangMismatch");
    expect(screen.getByRole("button", { name: "coachRegenerate" })).toBeTruthy();
  });

  it("asks nothing when the lesson already matches", () => {
    renderPanel({ homeworkSet: true, lesson: englishLesson, coach: englishHint, homework: "x", onRegenerate: vi.fn() });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("rewrites on the student's request, and shows it in the concepts section too", () => {
    const onRegenerate = vi.fn();
    renderPanel({ homeworkSet: true, lesson: burmeseLesson, coach: burmeseHint, homework: "x", onRegenerate });
    fireEvent.click(screen.getByRole("button", { name: "coachRegenerate" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("menuitemradio", { name: /coachTabConcepts/ }));
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("disables the button while it is being rewritten", () => {
    renderPanel({ homeworkSet: true, lesson: burmeseLesson, coach: burmeseHint, homework: "x", onRegenerate: vi.fn(), regenerating: true });
    expect(screen.getByRole("button", { name: "coachPreparing" }).disabled).toBe(true);
  });

  it("does not nag when there is no way to rewrite", () => {
    renderPanel({ homeworkSet: true, lesson: burmeseLesson, coach: burmeseHint, homework: "x" });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Several problems in one chat", () => {
  const first = { id: "p1", homework: "Print 1 to 5.", lesson: { steps: ["Loop five times."] }, coach: hint(2), history: [hint(1)] };
  const props = { homeworkSet: true, lesson, coach: hint(1), history: [], homework: "Sum the numbers 1 to 10.", problems: [first] };

  it("shows one problem at a time, the newest first, with up / count / down arrows", () => {
    renderPanel(props);
    expect(screen.getByText("Sum the numbers 1 to 10.")).toBeTruthy();
    expect(screen.queryByText("Print 1 to 5.")).toBeNull();
    expect(screen.queryByText("Loop five times.")).toBeNull();
    expect(screen.getAllByText(/^hint text \d$/)).toHaveLength(1);
    expect(screen.getByText("2/2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "coachNextProblem" }).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "coachPrevProblem" }));
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("Print 1 to 5.")).toBeTruthy();
    expect(screen.getByText("Loop five times.")).toBeTruthy();
    expect(screen.queryByText("Sum the numbers 1 to 10.")).toBeNull();
    expect(screen.getAllByText(/^hint text \d$/)).toHaveLength(2);       // only that problem's hints
    expect(screen.getByRole("button", { name: "coachPrevProblem" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "coachNextProblem" }));
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("the same arrows turn the page in Concepts, Visualizer and Review, but not in Chat", () => {
    const problems = [{ ...first, lesson: { topic: "Loops old", steps: [], concepts: [{ name: "OLD CONCEPT", what: "w" }] }, trace: null, review: null }];
    const onVisualize = vi.fn();
    renderPanel({ ...props, problems, onVisualize, lesson: { ...lesson, concepts: [{ name: "NEW CONCEPT", what: "w" }] } });
    const open = name => { fireEvent.click(menuButton()); fireEvent.click(screen.getByRole("menuitemradio", { name })); };

    open(/coachTabConcepts/);
    expect(screen.getByText("NEW CONCEPT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "coachPrevProblem" }));
    expect(screen.getByText("OLD CONCEPT")).toBeTruthy();
    expect(screen.queryByText("NEW CONCEPT")).toBeNull();

    open(/coachTabViz/);                                                  // the page stays on problem 1
    expect(screen.getByText("1/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "coachVisualize" }));
    expect(onVisualize).toHaveBeenLastCalledWith(0);                      // visualizes the problem being shown, not the newest
    open(/coachTabReview/);
    expect(screen.getByText("1/2")).toBeTruthy();
    open(/coachTabChat/);
    expect(screen.queryByRole("button", { name: "coachPrevProblem" })).toBeNull();
  });

  it("each problem's guide and hints fold away with the arrow beside its heading, and open again", () => {
    renderPanel(props);
    const toggle = screen.getByRole("button", { name: /coachFoldHints/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("hint text 1")).toBeNull();
    expect(screen.getByText("Sum the numbers 1 to 10.")).toBeTruthy();    // the question itself stays
    fireEvent.click(toggle);
    expect(screen.getByText("hint text 1")).toBeTruthy();
  });

  it("only the newest problem can ask for another hint or start a new problem", () => {
    renderPanel(props);
    expect(screen.getAllByRole("button", { name: "coachGiveHint" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /coachModeNew/ }).length).toBeGreaterThan(0);
  });

  it("does not number a single problem", () => {
    renderPanel({ ...props, problems: [] });
    expect(screen.queryByText("coachProblemNum")).toBeNull();
    expect(screen.getByText("coachQuestionTitle")).toBeTruthy();
  });
});

describe("Asking about this problem vs starting a new one", () => {
  const base = { homeworkSet: true, lesson, coach: hint(1), homework: "Print 1 to 5." };
  const typeAndSend = text => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "coachSend" }));
  };
  const goToChat = () => { fireEvent.click(menuButton()); fireEvent.click(screen.getByRole("menuitemradio", { name: /coachTabChat/ })); };

  it("offers two optional choices once a problem exists; with neither chosen, the coach decides", () => {
    renderPanel(base);
    goToChat();
    expect(screen.getByRole("button", { name: "coachModeAsk" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /coachModeNew/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("coachAutoHint")).toBeTruthy();
  });

  it("a chosen mode can be switched off again, back to automatic", () => {
    renderPanel(base);
    goToChat();
    const ask = () => screen.getByRole("button", { name: "coachModeAsk" });
    fireEvent.click(ask());
    expect(ask().getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("coachAutoHint")).toBeNull();
    fireEvent.click(ask());
    expect(ask().getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("coachAutoHint")).toBeTruthy();
  });

  it("'Ask about this problem' makes the coach skip its own guessing", async () => {
    const onAsk = vi.fn().mockResolvedValue(true);
    renderPanel({ ...base, onAsk });
    goToChat();
    fireEvent.click(screen.getByRole("button", { name: "coachModeAsk" }));
    typeAndSend("print hello 3 times");
    await Promise.resolve();
    expect(onAsk).toHaveBeenCalledWith("print hello 3 times", { forceAsk: true });
  });

  it("the quick-question pills are always questions about the current problem", async () => {
    const onAsk = vi.fn().mockResolvedValue(true);
    renderPanel({ ...base, onAsk });
    goToChat();
    fireEvent.click(screen.getByText("coachSuggestStart"));
    await Promise.resolve();
    expect(onAsk).toHaveBeenCalledWith("coachSuggestStart", { forceAsk: true });
  });

  it("when the coach decides a message was a new problem, Hints opens by itself", async () => {
    const onAsk = vi.fn().mockResolvedValue("new");
    renderPanel({ ...base, onAsk });
    goToChat();
    typeAndSend("print hello 3 times use for loop");
    await screen.findByText("coachTabHint");
    expect(onAsk).toHaveBeenCalledWith("print hello 3 times use for loop");
  });

  it("when the coach decides it was only a question, the student stays in the chat", async () => {
    const onAsk = vi.fn().mockResolvedValue(true);
    renderPanel({ ...base, onAsk });
    goToChat();
    typeAndSend("I am stuck");
    await Promise.resolve(); await Promise.resolve();
    expect(screen.getByText("coachTabChat")).toBeTruthy();
  });

  it("sends an ordinary message as a question about the current problem", async () => {
    const onAsk = vi.fn().mockResolvedValue(true);
    renderPanel({ ...base, onAsk });
    goToChat();
    typeAndSend("I am stuck");
    await Promise.resolve();
    expect(onAsk).toHaveBeenCalledWith("I am stuck");
    expect(onAsk.mock.calls[0]).toHaveLength(1);
  });

  it("in New problem mode, the message starts a new problem, then Hints opens and the mode resets", async () => {
    const onAsk = vi.fn().mockResolvedValue(true);
    renderPanel({ ...base, onAsk });
    goToChat();
    fireEvent.click(screen.getByRole("button", { name: /coachModeNew/ }));
    typeAndSend("Sum 1 to 10");
    await screen.findByText("coachTabHint");
    expect(onAsk).toHaveBeenCalledWith("Sum 1 to 10", { newProblem: true });

    goToChat();
    expect(screen.getByRole("button", { name: /coachModeNew/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "coachModeAsk" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("hides the quick-question pills while writing a new problem", () => {
    renderPanel(base);
    goToChat();
    expect(screen.getByText("coachSuggestStart")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /coachModeNew/ }));
    expect(screen.queryByText("coachSuggestStart")).toBeNull();
  });

  it("the Hints section's '+ New problem' button opens the chat already in New problem mode", () => {
    renderPanel(base);
    fireEvent.click(screen.getByRole("button", { name: /coachModeNew/ }));
    expect(screen.getByText("coachTabChat")).toBeTruthy();
    expect(screen.getByRole("button", { name: /coachModeNew/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the text when starting the new problem fails", async () => {
    const onAsk = vi.fn().mockResolvedValue(false);
    renderPanel({ ...base, onAsk });
    goToChat();
    fireEvent.click(screen.getByRole("button", { name: /coachModeNew/ }));
    typeAndSend("Sum 1 to 10");
    await waitFor(() => expect(screen.getByRole("textbox").value).toBe("Sum 1 to 10"));
  });
});

describe("Core Concepts teach the problem first", () => {
  const rich = {
    steps: ["Make a loop."],
    concepts: [{
      name: "for loop",
      why: "Would you write print() five times? What about 1000?",
      before: "print('Hello')\nprint('Hello')",
      what: "A for loop repeats a block.",
      how: "for NAME in range(COUNT):",
      example: "for i in range(3):\n    print('Hello')",
      mistake: "Forgetting the colon.",
    }],
  };
  const openConcepts = () => { fireEvent.click(menuButton()); fireEvent.click(screen.getByRole("menuitemradio", { name: /coachTabConcepts/ })); };

  it("shows why, the painful way, what, how, the same task with it, and the common mistake — in that order", () => {
    renderPanel({ homeworkSet: true, lesson: rich, coach: hint(1) });
    openConcepts();
    const order = [
      "coachConceptWhy", "Would you write print() five times? What about 1000?", "coachConceptBefore",
      "coachWhat", "coachHow", "coachConceptAfter", "coachConceptMistake", "Forgetting the colon.",
    ].map(text => screen.getByText(text));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy();
    }
  });

  it("labels the code with 'with it' only when there is a 'without it' to compare against", () => {
    renderPanel({ homeworkSet: true, lesson: rich, coach: hint(1) });
    openConcepts();
    expect(screen.getByText("coachConceptAfter")).toBeTruthy();
    expect(screen.queryByText("coachExampleNote")).toBeNull();
  });

  it("still shows a lesson saved before these fields existed, exactly as before", () => {
    const old = { steps: ["Make a loop."], concepts: [{ name: "for loop", what: "Repeats a block.", how: "for x in xs:", example: "for i in range(3): pass" }] };
    renderPanel({ homeworkSet: true, lesson: old, coach: hint(1) });
    openConcepts();
    expect(screen.getByText("Repeats a block.")).toBeTruthy();
    expect(screen.getByText("coachExampleNote")).toBeTruthy();
    expect(screen.queryByText("coachConceptWhy")).toBeNull();
    expect(screen.queryByText("coachConceptBefore")).toBeNull();
    expect(screen.queryByText("coachConceptMistake")).toBeNull();
  });

  it("each concept card has its own set of parts", () => {
    const two = { steps: [], concepts: [rich.concepts[0], { ...rich.concepts[0], name: "list", why: "Five scores in five variables?", mistake: "Index starts at 0." }] };
    renderPanel({ homeworkSet: true, lesson: two, coach: hint(1) });
    openConcepts();
    expect(screen.getAllByText("coachConceptWhy")).toHaveLength(2);
    expect(screen.getByText("Five scores in five variables?")).toBeTruthy();
    expect(screen.getByText("Index starts at 0.")).toBeTruthy();
  });
});
