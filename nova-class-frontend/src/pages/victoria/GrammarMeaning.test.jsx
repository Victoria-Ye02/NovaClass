import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import API from "../../services/api";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

vi.mock("../../components/Sidebar", () => ({ default: () => <nav>sidebar</nav> }));
const language = { lang: "en" };
vi.mock("../../LanguageContext", () => ({ useLang: () => language }));
vi.mock("./vocabExtra.json", () => ({ default: {
  "3:1": { syn: ["등록하다"], ant: ["탈퇴하다"], example: { ko: "저는 동호회에 가입했어요.", my: "ကျွန်တော် အသင်းမှာ ဝင်ခဲ့တယ်။" } },
  "3:2": { syn: [], ant: [], example: { ko: "오늘은 만나는 것이 가능해요.", my: "ဒီနေ့ တွေ့လို့ ရတယ်။" } },
} }));
vi.mock("./grammarI18n.json", () => ({ default: { vi: { units: {
  "core:1": { short: "nếu · nếu trời mưa", examples: ["Nếu trời mưa thì tôi sẽ ở nhà."] },
  "similar:1": { diff: "Cả bốn đều có nghĩa là \"hình như\". -듯하다 là văn viết trang trọng.", notes: ["Cách đoán phổ biến nhất.", "Văn viết trang trọng.", "Đoán từ điều đã thấy.", "Phán đoán từ tình huống bên ngoài."], why: "Báo cáo trang trọng dùng -(으)ㄴ/는 듯하다.", sentences: ["Tôi nghĩ anh ấy đã biết tin này.", "Có vẻ anh ấy đã biết tin này.", "Chắc anh ấy đã biết tin này.", "Hình như anh ấy đã biết tin này."] },
} } } }));
vi.mock("./vocabI18n.json", () => ({ default: {
  "3:1": { en: "to join / to sign up", vi: "tham gia / đăng ký", ko: "단체에 들어가다", ex: { en: "I joined a club.", vi: "Tôi đã tham gia câu lạc bộ." } },
  "3:2": { en: "possible", vi: "có thể", ko: "할 수 있다", ex: { en: "It is possible to meet today.", vi: "Hôm nay có thể gặp." } },
} }));
vi.mock("../../services/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import GrammarMeaning from "./GrammarMeaning";
import { SIMILAR_GRAMMAR, sentenceOf, NUANCE } from "./similarGrammar";
import { VOCAB, LEVELS, FIXED_ENTRIES, SKIPPED_ENTRIES } from "./vocabData";
import { meaningOf, exampleTranslation } from "./vocabText";
import { romanize } from "./romanize";
import { SIMILAR_MY, NUANCE_MY } from "./similarGrammarMy";
import { CORE_GRAMMAR, shortMeaning } from "./coreGrammar";

function memoryStorage() {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: k => { data.delete(k); } };
}
beforeEach(() => { language.lang = "en"; vi.stubGlobal("localStorage", memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Grammar & Meaning", () => {
  it("opens on Grammar with the core grammar cards", () => {
    render(<GrammarMeaning />);
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("grammar-view-select").value).toBe("core");
    expect(screen.getByTestId("core-grammar-list").children).toHaveLength(CORE_GRAMMAR.length);
    expect(screen.queryByTestId("similar-grammar-list")).toBeNull();
  });

  it("the dropdown offers the two options and switches to similar grammar pairs", () => {
    render(<GrammarMeaning />);
    const select = screen.getByTestId("grammar-view-select");
    expect([...select.options].map(o => o.textContent)).toEqual(["Core Grammar (일반 문법)", "유사 문법 (Similar Grammar)"]);
    fireEvent.change(select, { target: { value: "similar" } });
    const list = screen.getByTestId("similar-grammar-list");
    expect(list.children).toHaveLength(40);
    expect(list.textContent).toContain("-(으)ㄴ/는 것 같다 ≈ -(으)ㄴ/는 듯하다 ≈ -나 보다 ≈ -(으)ㄴ/는 모양이다");
    expect(screen.queryByTestId("core-grammar-list")).toBeNull();
    fireEvent.change(select, { target: { value: "core" } });
    expect(screen.getByTestId("core-grammar-list")).toBeTruthy();
  });

  it("Meaning shows the vocabulary list and hides the grammar dropdown", () => {
    render(<GrammarMeaning />);
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(screen.getByTestId("vocab-list")).toBeTruthy();
    expect(screen.queryByTestId("grammar-view-select")).toBeNull();
    fireEvent.click(screen.getAllByRole("tab")[0]);
    expect(screen.getByTestId("grammar-view-select")).toBeTruthy();
  });
});

describe("Core grammar cards", () => {
  it("has the 30 items in order, each with a badge, a level chip, the Burmese meaning, a rule box and an example", () => {
    expect(CORE_GRAMMAR).toHaveLength(30);
    expect(CORE_GRAMMAR.map(g => g.no)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(CORE_GRAMMAR.every(g => g.pattern && g.category.length && g.my && g.rule && g.examples.length && g.level)).toBe(true);
    render(<GrammarMeaning />);
    const cards = screen.getAllByTestId("core-row");
    expect(cards).toHaveLength(30);
    expect(cards[16].textContent).toContain("-(으)려고");
    expect(cards[16].textContent).toContain("목적");
    expect(cards[16].textContent).toContain("in order to");
    expect(cards[16].textContent).toContain("받침 O → -으려고 / 받침 X → -려고");
    expect(cards[16].textContent).toContain("TOPIK II");
  });

  it("items with two senses show both examples", () => {
    render(<GrammarMeaning />);
    const card = screen.getAllByTestId("core-row")[9];            // -도록: ① 목적, ② 정도
    expect(card.textContent).toContain("① 목적");
    expect(card.textContent).toContain("② 정도");
    expect(within(card).getAllByRole("button", { name: /^Play:/ })).toHaveLength(2);
  });

  it("the speaker button plays the ElevenLabs audio of the sentence", async () => {
    const played = [];
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function (src) { this.src = src; this.play = async () => { played.push(src); }; this.pause = () => {}; });
    render(<GrammarMeaning />);
    fireEvent.click(screen.getByRole("button", { name: "Play: 한국에서 일하려고 한국어를 배워요." }));
    await waitFor(() => expect(played).toEqual(["blob:fake"]));
    expect(API.post).toHaveBeenCalledWith("/kmate/tts", { text: "한국에서 일하려고 한국어를 배워요.", speed: "normal" }, { responseType: "blob" });
  });

  it("falls back to the browser voice when the server cannot make the audio", async () => {
    const speak = vi.fn();
    API.post.mockReset();
    API.post.mockRejectedValue(new Error("503"));
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn(), getVoices: () => [{ lang: "ko-KR", name: "Yuna" }] });
    vi.stubGlobal("SpeechSynthesisUtterance", function (text) { this.text = text; });
    render(<GrammarMeaning />);
    fireEvent.click(screen.getByRole("button", { name: "Play: 숙제하느라고 잠을 못 잤어요." }));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "숙제하느라고 잠을 못 잤어요.", lang: "ko-KR", voice: { name: "Yuna" } });
  });

  it("has a Normal / Slow toggle that sends the chosen speed with every sentence's audio", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    render(<GrammarMeaning />);
    const speed = screen.getByRole("group", { name: "Audio speed" });
    expect(within(speed).getByRole("button", { name: "Normal" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Play: 비가 오면 집에 있을 거예요." }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "비가 오면 집에 있을 거예요.", speed: "normal" });

    fireEvent.click(within(speed).getByRole("button", { name: "Slow" }));
    expect(within(speed).getByRole("button", { name: "Slow" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Play: 비가 오면 집에 있을 거예요." }).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Play: 비가 오면 집에 있을 거예요." }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(2));
    expect(API.post.mock.calls[1][1]).toEqual({ text: "비가 오면 집에 있을 거예요.", speed: "slow" });
  });

  it("the speed chosen stays when switching to the similar-grammar view and to Meaning", () => {
    render(<GrammarMeaning />);
    fireEvent.click(within(screen.getByRole("group", { name: "Audio speed" })).getByRole("button", { name: "Slow" }));
    fireEvent.change(screen.getByTestId("grammar-view-select"), { target: { value: "similar" } });
    expect(within(screen.getByRole("group", { name: "Audio speed" })).getByRole("button", { name: "Slow" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(within(screen.getByRole("group", { name: "Audio speed" })).getByRole("button", { name: "Slow" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("lists the grammars as full-width rows, one per line (not a grid of cards)", () => {
    render(<GrammarMeaning />);
    const list = screen.getByTestId("core-grammar-list");
    expect(list.style.display).toBe("flex");
    expect(list.style.flexDirection).toBe("column");
    expect(list.style.gridTemplateColumns).toBe("");
    expect(list.children).toHaveLength(30);
    const row = list.children[0];
    expect(row.children).toHaveLength(3);                                   // left | middle | right
    expect(row.children[0].textContent).toContain("-(으)면");                  // number, grammar, badges
    expect(row.children[0].textContent).toContain("가정");
    expect(row.children[1].textContent).toContain("if · if it rains");       // meaning
    expect(row.children[1].textContent).toContain("Conjugation");            // rule
    expect(row.children[2].textContent).toContain("비가 오면 집에 있을 거예요.");  // example
    expect(within(row.children[2]).getByRole("button", { name: /^Play:/ })).toBeTruthy();
  });

  it("shows the example translations in Burmese when Burmese is chosen, and no English under them", () => {
    language.lang = "my";
    render(<GrammarMeaning />);
    const row = screen.getAllByTestId("core-row")[0];
    expect(within(row).getByTestId("example-translation").textContent).toBe("မိုးရွာရင် အိမ်မှာ ရှိနေမယ်။");
    expect(row.textContent).not.toContain("If it rains, I will stay home.");
    expect(row.children[1].textContent).toContain("ရင် · မိုးရွာရင်");
  });

  it("keeps English translations for the other languages, and every example has a Burmese one", () => {
    render(<GrammarMeaning />);
    expect(within(screen.getAllByTestId("core-row")[0]).getByTestId("example-translation").textContent).toBe("If it rains, I will stay home.");
    for (const item of CORE_GRAMMAR) for (const ex of item.examples) expect(/[က-၏]/.test(ex.my || "")).toBe(true);
  });
});


describe("Similar grammar accordion", () => {
  const openSimilar = () => {
    render(<GrammarMeaning />);
    fireEvent.change(screen.getByTestId("grammar-view-select"), { target: { value: "similar" } });
  };
  const open = i => {
    const card = screen.getAllByTestId("similar-card")[i];
    fireEvent.click(within(card).getAllByRole("button", { expanded: false })[0]);
    return card;
  };

  it("has 40 well-formed groups: one frame, a slot, English and Burmese for every item, and a valid quiz", () => {
    expect(SIMILAR_GRAMMAR).toHaveLength(40);
    for (const g of SIMILAR_GRAMMAR) {
      expect(g.items.length).toBeGreaterThanOrEqual(2);
      for (const i of g.items) {
        expect(i.p && i.tag && i.note && i.slot && i.en && i.my).toBeTruthy();
        expect(sentenceOf(g, i)).toContain(i.slot);
        expect(sentenceOf(g, i)).toMatch(/[가-힣]/);
      }
      expect(new Set(g.items.map(i => sentenceOf(g, i))).size).toBe(g.items.length);   // a swap really changes the sentence
      expect(g.quiz.options).toHaveLength(3);
      expect(g.quiz.answer).toBeLessThan(3);
      expect(g.quiz.q).toContain("(   )");
    }
  });

  it("starts collapsed: one row per group with the title, the one-line difference and a chevron", () => {
    openSimilar();
    const cards = screen.getAllByTestId("similar-card");
    expect(cards).toHaveLength(40);
    expect(cards[0].textContent).toContain("-(으)ㄴ/는 것 같다 ≈ -(으)ㄴ/는 듯하다 ≈ -나 보다 ≈ -(으)ㄴ/는 모양이다");
    expect(cards[0].textContent).toContain("-듯하다 is formal writing");
    expect(within(cards[0]).queryByTestId("swap-builder")).toBeNull();
    expect(cards[0].querySelector("[aria-hidden]").textContent).toBe("⌄");
  });

  it("expanding shows one sentence with the grammar as a pill, and a chip for each grammar", () => {
    openSimilar();
    const card = open(5);                                      // -는 바람에 / -는 통에 / -아/어서 / -느라고 / -(으)ㄴ 탓에
    expect(within(card).getByTestId("swap-sentence").textContent).toBe("어젯밤에 아이가 갑자기 우는 바람에 잠을 못 잤어요.");
    expect(within(card).getByTestId("swap-pill").textContent).toBe("우는 바람에");
    const chips = within(within(card).getByRole("group", { name: "Swap the grammar" })).getAllByRole("button");
    expect(chips.map(c => c.textContent)).toEqual(["-는 바람에", "-는 통에", "-아/어서", "-느라고", "-(으)ㄴ 탓에"]);
  });

  it("clicking a chip swaps the grammar in the sentence, with its conjugation, translation, nuance and audio", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openSimilar();
    const card = open(5);
    fireEvent.click(within(card).getByRole("button", { name: "-아/어서" }));
    expect(within(card).getByTestId("swap-sentence").textContent).toBe("어젯밤에 아이가 갑자기 울어서 잠을 못 잤어요.");   // 울다 + 어서, not 우는
    expect(within(card).getByTestId("swap-translation").textContent).toBe("The child suddenly cried, so I couldn't sleep.");
    expect(within(card).getByTestId("nuance-badge").textContent).toBe("일반");
    fireEvent.click(within(card).getByRole("button", { name: "-느라고" }));          // this one changes its own subject part
    expect(within(card).getByTestId("swap-sentence").textContent).toBe("저는 어젯밤에 시험 공부하느라고 잠을 못 잤어요.");
    fireEvent.click(within(card).getByRole("button", { name: /^Play:/ }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "저는 어젯밤에 시험 공부하느라고 잠을 못 잤어요.", speed: "normal" });   // audio of the swapped sentence
  });

  it("the translation follows the app language, and tapping the pill tries the next grammar", () => {
    language.lang = "my";
    openSimilar();
    const card = open(0);
    expect(within(card).getByTestId("swap-translation").textContent).toBe(SIMILAR_GRAMMAR[0].items[0].my);
    fireEvent.click(within(card).getByTestId("swap-pill"));
    expect(within(card).getByTestId("swap-pill").textContent).toBe("알고 있는 듯해요");
    for (let i = 0; i < 3; i++) fireEvent.click(within(card).getByTestId("swap-pill"));      // wraps back to the first
    expect(within(card).getByTestId("swap-pill").textContent).toBe("알고 있는 것 같아요");
  });

  it("a row folds again when its header is clicked", () => {
    openSimilar();
    const card = open(1);
    fireEvent.click(within(card).getAllByRole("button", { expanded: true })[0]);
    expect(within(card).queryByTestId("swap-builder")).toBeNull();
  });

  it("the trap quiz inside an open row gives instant feedback with the explanation", () => {
    openSimilar();
    const card = open(0);
    fireEvent.click(within(card).getByRole("button", { name: /Spot the trap/ }));
    fireEvent.click(within(card).getByRole("button", { name: "있나 봐요" }));            // wrong
    let fb = within(card).getByTestId("trap-feedback");
    expect(fb.textContent).toContain("Not quite");
    expect(fb.textContent).toContain("있는 듯하다");
    expect(within(card).getByRole("button", { name: "있는 듯하다" }).disabled).toBe(true);
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    fireEvent.click(within(card).getByRole("button", { name: "있는 듯하다" }));
    expect(within(card).getByTestId("trap-feedback").textContent).toContain("Correct");
  });

  it("Slow asks the server for the slow audio of the sentence", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openSimilar();
    fireEvent.click(screen.getByRole("button", { name: "Slow" }));
    const card = open(2);
    fireEvent.click(within(card).getByRole("button", { name: /^Play:/ }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "사람은 누구나 실수를 하기 마련이에요.", speed: "slow" });
  });

  it("stars save a pair into My Confusing Grammars, and it is remembered", () => {
    openSimilar();
    expect(screen.getByRole("button", { name: /My Confusing Grammars \(0\)/ })).toBeTruthy();
    fireEvent.click(within(screen.getAllByTestId("similar-card")[2]).getByRole("button", { name: "Save to My Confusing Grammars" }));
    fireEvent.click(within(screen.getAllByTestId("similar-card")[4]).getByRole("button", { name: "Save to My Confusing Grammars" }));
    fireEvent.click(screen.getByRole("button", { name: /My Confusing Grammars \(2\)/ }));
    const list = screen.getByTestId("similar-grammar-list");
    expect(list.children).toHaveLength(2);
    expect(list.textContent).toContain("-기 마련이다");
    expect(JSON.parse(localStorage.getItem("grammar_confusion_list"))).toEqual([3, 5]);
    fireEvent.click(within(list.children[0]).getByRole("button", { name: "Remove from My Confusing Grammars" }));
    fireEvent.click(within(screen.getByTestId("similar-grammar-list").children[0]).getByRole("button", { name: "Remove from My Confusing Grammars" }));
    expect(screen.getByTestId("confusion-empty")).toBeTruthy();
  });
});

describe("Similar grammar in Burmese", () => {
  const openFirst = () => {
    render(<GrammarMeaning />);
    fireEvent.change(screen.getByTestId("grammar-view-select"), { target: { value: "similar" } });
    const card = screen.getAllByTestId("similar-card")[0];
    fireEvent.click(within(card).getAllByRole("button", { expanded: false })[0]);
    return card;
  };

  it("has Burmese for every difference, note, explanation and nuance label", () => {
    expect(Object.keys(NUANCE_MY).sort()).toEqual(Object.keys(NUANCE).sort());
    for (const g of SIMILAR_GRAMMAR) {
      const m = SIMILAR_MY[g.id];
      expect(m.diff && m.why).toBeTruthy();
      expect(m.notes).toHaveLength(g.items.length);
      expect([m.diff, m.why, ...m.notes].every(s => /[က-၏]/.test(s))).toBe(true);        // each text really is Burmese
    }
  });

  it("shows the difference under every title in Burmese when Burmese is chosen", () => {
    language.lang = "my";
    render(<GrammarMeaning />);
    fireEvent.change(screen.getByTestId("grammar-view-select"), { target: { value: "similar" } });
    const cards = screen.getAllByTestId("similar-card");
    expect(cards[0].textContent).toContain("လေးခုလုံးမှာ 'ထင်တယ်/ပုံရတယ်' ဟု အဓိပ္ပာယ်ရသော်လည်း အခြေအနေပေါ်မူတည်၍ အသုံးကွာခြားပါသည်။");
    expect(cards[0].textContent).not.toContain("All four mean");
    expect(cards[1].textContent).toContain("အတိုင်းအတာ ပမာဏတစ်ခုအထိ ဖြစ်ပျက်ကြောင်း ဖော်ပြသည့် သဒ္ဒါများ ဖြစ်ပါသည်။");
  });

  it("the nuance badge and its description follow the swapped grammar, in Burmese", () => {
    language.lang = "my";
    const card = openFirst();
    expect(within(card).getByTestId("nuance-badge").textContent).toBe("စကားပြော");
    expect(card.textContent).toContain("အသုံးအများဆုံး ခန့်မှန်းချက်");
    fireEvent.click(within(card).getByRole("button", { name: "-(으)ㄴ/는 듯하다" }));
    expect(within(card).getByTestId("nuance-badge").textContent).toBe("တရားဝင်·စာရေး");
    expect(card.textContent).toContain("စာရေးသား/တရားဝင်ပုံစံ");
    expect(card.textContent).not.toContain("Written and formal");
  });

  it("the quiz feedback and buttons are Burmese too", () => {
    language.lang = "my";
    const card = openFirst();
    fireEvent.click(within(card).getByRole("button", { name: /ထောင်ချောက်ရှာပါ/ }));
    fireEvent.click(within(card).getByRole("button", { name: "있나 봐요" }));
    const fb = within(card).getByTestId("trap-feedback").textContent;
    expect(fb).toContain("မှားပါတယ်");
    expect(fb).toContain("တရားဝင်အစီရင်ခံစာမှာ");
    expect(within(card).getByRole("button", { name: "ပြန်စမ်းမယ်" })).toBeTruthy();
  });

  it("other languages keep the English texts", () => {
    language.lang = "ko";
    const card = openFirst();
    expect(card.textContent).toContain("All four mean");
    expect(within(card).getByTestId("nuance-badge").textContent).toBe("구어");
  });
});

describe("Short meaning in the chosen language", () => {
  const meaningOf = no => screen.getAllByTestId("short-meaning")[no - 1].textContent;

  it("follows the language chosen in Settings", () => {
    language.lang = "my";
    const { unmount } = render(<GrammarMeaning />);
    expect(meaningOf(1)).toBe("ရင် · မိုးရွာရင်");
    unmount();
    language.lang = "ko";
    const ko = render(<GrammarMeaning />);
    expect(meaningOf(1)).toBe("~하면 · 비가 오면");
    ko.unmount();
    language.lang = "en";
    render(<GrammarMeaning />);
    expect(meaningOf(1)).toBe("if · if it rains");
  });

  it("falls back to English for a language without its own text, and every item has all three short meanings", () => {
    language.lang = "vi";
    render(<GrammarMeaning />);
    expect(meaningOf(17)).toBe("in order to · to work");
    for (const item of CORE_GRAMMAR) for (const l of ["en", "my", "ko"]) expect(shortMeaning(item, l).length).toBeGreaterThan(0);
  });

  it("the long description is no longer on the card (only as a hover title)", () => {
    render(<GrammarMeaning />);
    expect(screen.getAllByTestId("core-row")[0].textContent).not.toContain("အခြေအနေ တစ်ရပ် သတ်မှတ်ခြင်း");
    expect(screen.getAllByTestId("short-meaning")[0].getAttribute("title")).toContain("အခြေအနေ တစ်ရပ်");
  });

  it("the speaker is an icon-only button with no text label", () => {
    render(<GrammarMeaning />);
    const play = screen.getAllByRole("button", { name: /^Play:/ })[0];
    expect(play.textContent).toBe("");
    expect(play.querySelector("svg")).toBeTruthy();
  });
});

describe("Meaning: TOPIK vocabulary", () => {
  const openMeaning = () => { render(<GrammarMeaning />); fireEvent.click(screen.getAllByRole("tab")[1]); };

  it("has the vocabulary of levels 3 to 6, every word with Korean and Burmese text only", () => {
    expect(LEVELS).toEqual([3, 4, 5, 6]);
    expect(VOCAB[3]).toHaveLength(100);
    expect(VOCAB[5]).toHaveLength(100);
    expect(VOCAB[4].length + VOCAB[6].length).toBe(200 - 4);               // 4 damaged entries could not be recovered
    expect(SKIPPED_ENTRIES).toHaveLength(4);
    expect(FIXED_ENTRIES.length).toBeGreaterThan(0);
    for (const level of LEVELS) for (const w of VOCAB[level]) {
      expect(w.ko).toMatch(/^[가-힣 ]+$/);
      expect(w.my).toMatch(/^[က-႟\s/(),၊။-]+$/);
    }
  });

  it("opens on Level 3 with one row per word: number, the Korean word, the Burmese meaning and a speaker", () => {
    language.lang = "my";
    openMeaning();
    const rows = screen.getAllByTestId("vocab-row");
    expect(rows).toHaveLength(100);
    expect(rows[0].textContent).toContain("1");
    expect(rows[0].textContent).toContain("가입하다");
    expect(rows[0].textContent).toContain("စာရင်းသွင်းသည် / အသင်းဝင်သည်");
    expect(within(rows[0]).getByRole("button", { name: "Play: 가입하다" })).toBeTruthy();
  });

  it("the level buttons switch the list", () => {
    openMeaning();
    fireEvent.click(screen.getByRole("button", { name: /Level 4/ }));
    expect(screen.getAllByTestId("vocab-row")[0].textContent).toContain("강조하다");
    fireEvent.click(screen.getByRole("button", { name: /Level 6/ }));
    expect(screen.getAllByTestId("vocab-row")[0].textContent).toContain("가늠하다");
    expect(screen.getAllByTestId("vocab-row")).toHaveLength(VOCAB[6].length);
  });

  it("search filters by the Korean word or the Burmese meaning, with an empty state", () => {
    language.lang = "my";
    openMeaning();
    const search = screen.getByRole("searchbox", { name: "Search vocabulary" });
    fireEvent.change(search, { target: { value: "건강" } });
    expect(screen.getAllByTestId("vocab-row").map(r => r.textContent).join()).toContain("ကျန်းမာရေး");
    fireEvent.change(search, { target: { value: "ကြော်ငြာ" } });
    expect(screen.getAllByTestId("vocab-row")).toHaveLength(1);
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(screen.getByTestId("vocab-empty")).toBeTruthy();
  });

  it("a word's speaker asks the server for that word at the chosen speed", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openMeaning();
    fireEvent.click(screen.getByRole("button", { name: "Slow" }));
    fireEvent.click(screen.getByRole("button", { name: "Play: 건강" }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "건강", speed: "slow" });
  });
});

describe("Vocabulary: rows, flashcards and saved words", () => {
  const openMeaning = () => { render(<GrammarMeaning />); fireEvent.click(screen.getAllByRole("tab")[1]); };
  const mode = name => fireEvent.click(screen.getByRole("button", { name }));

  it("shows the three view modes and the level tabs", () => {
    openMeaning();
    expect(within(screen.getByRole("group", { name: "View mode" })).getAllByRole("button").map(b => b.textContent)).toEqual(["📋 List View", "🗂️ Flashcard Mode", "⭐ Saved Words (0)"]);
    expect(within(screen.getByRole("group", { name: "TOPIK level" })).getAllByRole("button")).toHaveLength(4);
  });

  it("a row shows synonym and antonym chips when the word has them, and none when it has not", () => {
    openMeaning();
    const rows = screen.getAllByTestId("vocab-row");
    expect(within(rows[0]).getByTestId("synonym-chip").textContent).toBe("유의어 등록하다");
    expect(within(rows[0]).getByTestId("antonym-chip").textContent).toBe("반의어 탈퇴하다");
    expect(within(rows[1]).queryByTestId("synonym-chip")).toBeNull();
    expect(within(rows[1]).queryByTestId("antonym-chip")).toBeNull();
  });

  it("clicking a row opens the example with its Burmese translation and a speaker, and clicking again closes it", async () => {
    language.lang = "my";
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openMeaning();
    const row = screen.getAllByTestId("vocab-row")[0];
    expect(within(row).queryByTestId("vocab-example")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: /가입하다 —/ }));
    const example = within(row).getByTestId("vocab-example");
    expect(example.textContent).toContain("저는 동호회에 가입했어요.");
    expect(example.textContent).toContain("ကျွန်တော် အသင်းမှာ ဝင်ခဲ့တယ်။");
    fireEvent.click(within(example).getByRole("button", { name: "Play: 저는 동호회에 가입했어요." }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "저는 동호회에 가입했어요.", speed: "normal" });
    fireEvent.click(within(row).getByRole("button", { name: /가입하다 —/ }));
    expect(within(row).queryByTestId("vocab-example")).toBeNull();
  });

  it("a word without an example says so", () => {
    openMeaning();
    const row = screen.getAllByTestId("vocab-row")[4];            // 3:5 has no extra data
    fireEvent.click(within(row).getAllByRole("button")[1]);
    expect(row.textContent).toContain("No example sentence yet.");
  });

  it("the star saves a word into Saved Words (all levels), remembered across visits", () => {
    openMeaning();
    fireEvent.click(within(screen.getAllByTestId("vocab-row")[0]).getByRole("button", { name: "Save 가입하다 to My Saved Words" }));
    fireEvent.click(screen.getByRole("button", { name: /Level 4/ }));
    fireEvent.click(within(screen.getAllByTestId("vocab-row")[0]).getByRole("button", { name: "Save 강조하다 to My Saved Words" }));
    mode(/Saved Words \(2\)/);
    const rows = screen.getAllByTestId("vocab-row");
    expect(rows.map(r => r.textContent).join("|")).toContain("가입하다");
    expect(rows.map(r => r.textContent).join("|")).toContain("강조하다");
    expect(rows[0].textContent).toContain("L3·1");                       // saved rows show their level
    expect(JSON.parse(localStorage.getItem("topik_saved_words"))).toEqual(["3:1", "4:1"]);
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Remove 가입하다 from My Saved Words" }));
    expect(screen.getAllByTestId("vocab-row")).toHaveLength(1);
    fireEvent.click(within(screen.getAllByTestId("vocab-row")[0]).getByRole("button", { name: /^Remove/ }));
    expect(screen.getByTestId("saved-empty").textContent).toContain("No saved words yet");
  });

  it("Saved Words can be searched", () => {
    localStorage.setItem("topik_saved_words", JSON.stringify(["3:1", "3:8"]));
    openMeaning();
    mode(/Saved Words \(2\)/);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search vocabulary" }), { target: { value: "건강" } });
    expect(screen.getAllByTestId("vocab-row")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search vocabulary" }), { target: { value: "zzz" } });
    expect(screen.getByTestId("saved-empty").textContent).toContain("match your search");
  });

  it("Flashcard Mode shows one 3D flip card of the chosen level; a click flips it to the meaning", () => {
    language.lang = "my";
    openMeaning();
    mode(/Flashcard/);
    expect(screen.getByTestId("card-counter").textContent).toBe("1 / 100");
    const card = screen.getByTestId("flashcard");
    expect(card.dataset.flipped).toBe("false");
    expect(card.style.transformStyle).toBe("preserve-3d");
    expect(card.textContent).toContain("가입하다");
    fireEvent.click(within(card).getByLabelText("Show the meaning"));
    expect(card.dataset.flipped).toBe("true");
    expect(card.style.transform).toBe("rotateY(180deg)");
    expect(card.textContent).toContain("စာရင်းသွင်းသည် / အသင်းဝင်သည်");
    expect(card.textContent).toContain("저는 동호회에 가입했어요.");
    expect(card.textContent).toContain("유의어 등록하다");
    fireEvent.click(within(card).getByLabelText("Show the word"));
    expect(card.dataset.flipped).toBe("false");
  });

  it("the cards move with Next / Previous (wrapping) and always show the front first", () => {
    openMeaning();
    mode(/Flashcard Mode/);
    fireEvent.click(within(screen.getByTestId("flashcard")).getByLabelText("Show the meaning"));
    fireEvent.click(screen.getByRole("button", { name: /Next ›/ }));
    expect(screen.getByTestId("card-counter").textContent).toBe("2 / 100");
    expect(screen.getByTestId("flashcard").dataset.flipped).toBe("false");
    expect(screen.getByTestId("flashcard").textContent).toContain("가능하다");
    fireEvent.click(screen.getByRole("button", { name: /‹ Previous/ }));
    fireEvent.click(screen.getByRole("button", { name: /‹ Previous/ }));
    expect(screen.getByTestId("card-counter").textContent).toBe("100 / 100");
  });

  it("the flashcards follow the level, and their star and speaker work", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openMeaning();
    mode(/Flashcard Mode/);
    fireEvent.click(screen.getByRole("button", { name: /Level 5/ }));
    expect(screen.getByTestId("flashcard").textContent).toContain("가속화하다");
    fireEvent.click(screen.getByRole("button", { name: "Save 가속화하다 to My Saved Words" }));
    expect(screen.getByRole("button", { name: /Saved Words \(1\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Slow" }));
    fireEvent.click(screen.getByRole("button", { name: "Play: 가속화하다" }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "가속화하다", speed: "slow" });
  });
});

describe("Vocabulary meanings follow the language setting", () => {
  const openMeaning = () => { render(<GrammarMeaning />); fireEvent.click(screen.getAllByRole("tab")[1]); };
  const firstMeaning = () => within(screen.getAllByTestId("vocab-row")[0]).getByTestId("vocab-meaning").textContent;

  it("shows the meaning in Burmese, English, Vietnamese or Korean as chosen", () => {
    const word = { level: 3, no: 1, ko: "가입하다", my: "စာရင်းသွင်းသည် / အသင်းဝင်သည်" };
    expect(meaningOf(word, "my")).toBe("စာရင်းသွင်းသည် / အသင်းဝင်သည်");
    expect(meaningOf(word, "en")).toBe("to join / to sign up");
    expect(meaningOf(word, "vi")).toBe("tham gia / đăng ký");
    expect(meaningOf(word, "ko")).toBe("단체에 들어가다");
  });

  it("falls back to English, then Burmese, for a word or language without text", () => {
    expect(meaningOf({ level: 3, no: 5, ko: "감동", my: "စိတ်လှုပ်ရှားမှု" }, "vi")).toBe("စိတ်လှုပ်ရှားမှု");     // no entry at all
    expect(meaningOf({ level: 3, no: 1, ko: "가입하다", my: "x" }, "fr")).toBe("to join / to sign up");        // unknown language -> English
  });

  it("translates the example sentence too (none for Korean)", () => {
    const word = { level: 3, no: 1, ko: "가입하다", my: "x" };
    expect(exampleTranslation(word, "my")).toBe("ကျွန်တော် အသင်းမှာ ဝင်ခဲ့တယ်။");
    expect(exampleTranslation(word, "en")).toBe("I joined a club.");
    expect(exampleTranslation(word, "vi")).toBe("Tôi đã tham gia câu lạc bộ.");
    expect(exampleTranslation(word, "ko")).toBe("");
    expect(exampleTranslation({ level: 3, no: 99, ko: "x", my: "y" }, "en")).toBe("");
  });

  it("the rows show the chosen language, not Burmese", () => {
    language.lang = "vi";
    openMeaning();
    expect(firstMeaning()).toBe("tham gia / đăng ký");
    expect(screen.getAllByTestId("vocab-row")[0].textContent).not.toContain("စာရင်းသွင်းသည်");
  });

  it("the opened example and the flashcard use the chosen language", () => {
    language.lang = "en";
    openMeaning();
    fireEvent.click(within(screen.getAllByTestId("vocab-row")[0]).getByRole("button", { name: /가입하다 —/ }));
    expect(screen.getByTestId("example-translation").textContent).toBe("I joined a club.");
    fireEvent.click(screen.getByRole("button", { name: /Flashcard Mode/ }));
    const card = screen.getByTestId("flashcard");
    expect(within(card).getByTestId("vocab-meaning").textContent).toBe("to join / to sign up");
    expect(card.textContent).toContain("I joined a club.");
  });

  it("search works on the meaning in the chosen language", () => {
    language.lang = "en";
    openMeaning();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search vocabulary" }), { target: { value: "sign up" } });
    expect(screen.getAllByTestId("vocab-row")).toHaveLength(1);
    expect(screen.getAllByTestId("vocab-row")[0].textContent).toContain("가입하다");
  });

  it("the Korean setting gives a Korean explanation and no translation line under the example", () => {
    language.lang = "ko";
    openMeaning();
    expect(firstMeaning()).toBe("단체에 들어가다");
    fireEvent.click(within(screen.getAllByTestId("vocab-row")[0]).getByRole("button", { name: /가입하다 —/ }));
    expect(screen.queryByTestId("example-translation")).toBeNull();
  });
});

describe("Flashcard design and self-assessment", () => {
  const openCards = () => { render(<GrammarMeaning />); fireEvent.click(screen.getAllByRole("tab")[1]); fireEvent.click(screen.getByRole("button", { name: /Flashcard Mode/ })); };
  const flip = () => fireEvent.click(screen.getByLabelText("Show the meaning"));

  it("romanizes Hangul syllable by syllable", () => {
    expect(romanize("가입하다")).toBe("ga-ip-ha-da");
    expect(romanize("한국어")).toBe("han-guk-eo");
    expect(romanize("원인이 되다")).toBe("won-in-i doe-da");
    expect(romanize("")).toBe("");
  });

  it("the front shows the level badge, the word, a reading hint and the flip indicator", () => {
    openCards();
    const front = screen.getByLabelText("Show the meaning");
    expect(within(front).getByTestId("card-level").textContent).toBe("Level 3");
    expect(front.textContent).toContain("가입하다");
    expect(within(front).getByTestId("card-reading").textContent).toBe("ga-ip-ha-da");
    expect(front.textContent).toContain("Tap / Click to flip");
    expect(front.querySelector("svg")).toBeTruthy();
  });

  it("the back shows the meaning in the chosen language, the example with its translation, and synonyms / antonyms", () => {
    language.lang = "en";
    openCards();
    flip();
    const back = screen.getByLabelText("Show the word");
    expect(within(back).getByTestId("vocab-meaning").textContent).toBe("to join / to sign up");
    expect(back.textContent).toContain("저는 동호회에 가입했어요.");
    expect(back.textContent).toContain("I joined a club.");
    expect(back.textContent).toContain("유의어 등록하다");
    expect(back.textContent).toContain("반의어 탈퇴하다");
  });

  it("a progress bar above the card shows the position among the words", () => {
    openCards();
    expect(screen.getByTestId("card-counter").parentElement.textContent).toBe("1 / 100 words");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.getByTestId("card-progress").style.width).toBe("1%");
    fireEvent.click(screen.getByRole("button", { name: /Next ›/ }));
    expect(screen.getByTestId("card-progress").style.width).toBe("2%");
  });

  it("has spacious labelled controls: Previous, Play Audio, Bookmark, Next", () => {
    openCards();
    expect(screen.getByRole("button", { name: /‹ Previous/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Next ›/ })).toBeTruthy();
    const play = screen.getByRole("button", { name: "Play: 가입하다" });
    expect(play.textContent).toBe("Play Audio");
    const bookmark = screen.getByRole("button", { name: "Save 가입하다 to My Saved Words" });
    expect(bookmark.textContent).toBe("☆ Bookmark");
    fireEvent.click(bookmark);
    expect(screen.getByRole("button", { name: "Remove 가입하다 from My Saved Words" }).textContent).toBe("★ Saved");
  });

  it("the self-assessment buttons appear only when the card is flipped", () => {
    openCards();
    expect(screen.queryByTestId("self-assessment")).toBeNull();
    flip();
    const box = screen.getByTestId("self-assessment");
    expect(within(box).getByRole("button", { name: "🔴 Review Later" })).toBeTruthy();
    expect(within(box).getByRole("button", { name: "🟢 Got It!" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Show the word"));
    expect(screen.queryByTestId("self-assessment")).toBeNull();
  });

  it("Got It! and Review Later are remembered, move to the next card and keep a tally", () => {
    openCards();
    flip();
    fireEvent.click(screen.getByRole("button", { name: "🟢 Got It!" }));
    expect(screen.getByTestId("card-counter").textContent).toBe("2 / 100");           // moved on, front side first
    expect(screen.getByTestId("flashcard").dataset.flipped).toBe("false");
    expect(screen.getByTestId("card-tally").textContent).toBe("🟢 1 got it");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "🔴 Review Later" }));
    expect(JSON.parse(localStorage.getItem("topik_card_progress"))).toEqual({ "3:1": "got", "3:2": "later" });
    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    expect(screen.getByLabelText("Show the meaning").textContent).toContain("🟢 Got it");   // the card shows its mark
  });

  it("the Review later deck holds only those cards, and a card marked Got It leaves it", () => {
    localStorage.setItem("topik_card_progress", JSON.stringify({ "3:2": "later", "3:5": "later" }));
    openCards();
    fireEvent.click(screen.getByRole("button", { name: /Review later \(2\)/ }));
    expect(screen.getByTestId("card-counter").textContent).toBe("1 / 2");
    expect(screen.getByTestId("flashcard").textContent).toContain("가능하다");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "🟢 Got It!" }));
    expect(screen.getByTestId("card-counter").textContent).toBe("1 / 1");
    expect(screen.getByTestId("flashcard").textContent).toContain("감동");
    flip();
    fireEvent.click(screen.getByRole("button", { name: "🟢 Got It!" }));
    expect(screen.getByTestId("later-empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /All cards/ }));
    expect(screen.getByTestId("card-counter").textContent).toBe("1 / 100");
  });
});

describe("Core grammar: Explain in the chosen language", () => {
  const SUMMARY = {
    en: { grammarPattern: "-(으)면", meaningSummary: "If / when", explanation: "Sets a condition.", usageNotes: "Not for facts in the past.", example: { korean: "비가 오면 집에 있어요.", translation: "If it rains, I stay home." } },
    vi: { grammarPattern: "-(으)면", meaningSummary: "Nếu / khi", explanation: "Đặt ra một điều kiện.", usageNotes: "Không dùng cho sự thật trong quá khứ.", example: { korean: "비가 오면 집에 있어요.", translation: "Nếu trời mưa thì tôi ở nhà." } },
  };
  const openExplain = () => { render(<GrammarMeaning />); fireEvent.click(within(screen.getAllByTestId("core-row")[0]).getByRole("button", { name: /Explain|ရှင်းပြ|Giải thích|설명/ })); return screen.getAllByTestId("core-row")[0]; };

  it("asks the server for the grammar in the chosen language and shows the structured answer", async () => {
    language.lang = "vi";
    API.get.mockReset();
    API.get.mockResolvedValue({ data: SUMMARY.vi });
    const row = openExplain();
    expect(row.textContent).toContain("Đang viết phần giải thích");
    const panel = await within(row).findByTestId("explain-meaning");
    expect(panel.textContent).toBe("Nếu / khi");
    expect(API.get).toHaveBeenCalledWith("/kmate/grammar/explain", { params: { content: "-(으)면", language: "vi" } });
    expect(row.textContent).toContain("Ý nghĩa");
    expect(row.textContent).toContain("Giải thích");
    expect(row.textContent).toContain("Lưu ý khi dùng");
    expect(row.textContent).toContain("Nếu trời mưa thì tôi ở nhà.");
    expect(within(row).getByRole("button", { name: "Play: 비가 오면 집에 있어요." })).toBeTruthy();
  });

  it("the button hides the panel again, and a failed request says so", async () => {
    language.lang = "en";
    API.get.mockReset();
    API.get.mockRejectedValue(new Error("500"));
    const row = openExplain();
    await within(row).findByText("The explanation could not be loaded.");
    fireEvent.click(within(row).getByRole("button", { name: /Hide/ }));
    expect(within(row).queryByTestId("grammar-explain")).toBeNull();
  });

  it("the labels follow the language too (Burmese and Korean)", async () => {
    API.get.mockReset();
    API.get.mockResolvedValue({ data: SUMMARY.en });
    language.lang = "my";
    let row = openExplain();
    await within(row).findByTestId("explain-meaning");
    expect(row.textContent).toContain("အဓိပ္ပာယ်");
    expect(row.textContent).toContain("အသုံးပြုပုံ မှတ်ချက်");
    cleanup();
    language.lang = "ko";
    row = openExplain();
    await within(row).findByTestId("explain-meaning");
    expect(row.textContent).toContain("사용 팁");
    expect(API.get.mock.calls.map(c => c[1].params.language)).toEqual(["my", "ko"]);
  });
});

describe("Grammar & Meaning in Vietnamese", () => {
  beforeEach(() => { language.lang = "vi"; });

  it("the page chrome, the tabs and the dropdown are Vietnamese", () => {
    render(<GrammarMeaning />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Ngữ pháp & Nghĩa");
    expect(screen.getAllByRole("tab").map(b => b.textContent)).toEqual(["Ngữ pháp", "Nghĩa", "Thành ngữ & Tục ngữ"]);
    expect([...screen.getByTestId("grammar-view-select").options].map(o => o.textContent)).toEqual(["Ngữ pháp cơ bản (일반 문법)", "Ngữ pháp tương tự (유사 문법)"]);
    const speed = screen.getByRole("group", { name: "Audio speed" });
    expect(speed.textContent).toContain("Tốc độ");
    expect(within(speed).getAllByRole("button").map(b => b.textContent)).toEqual(["Bình thường", "Chậm"]);
  });

  it("a Core Grammar row shows the meaning, the conjugation label and the example translation in Vietnamese", () => {
    render(<GrammarMeaning />);
    const row = screen.getAllByTestId("core-row")[0];
    expect(within(row).getByTestId("short-meaning").textContent).toBe("nếu · nếu trời mưa");
    expect(row.textContent).toContain("Cách chia");
    expect(row.textContent).not.toContain("Conjugation");
    expect(within(row).getByTestId("example-translation").textContent).toBe("Nếu trời mưa thì tôi sẽ ở nhà.");
    expect(row.textContent).toContain("Giải thích");                        // the Explain button
  });

  it("a Core Grammar row without a Vietnamese text falls back to English", () => {
    render(<GrammarMeaning />);
    const row = screen.getAllByTestId("core-row")[1];                       // core:2 is not in the mock
    expect(within(row).getByTestId("short-meaning").textContent).toBe("whichever · eat it or not");
    expect(within(row).getByTestId("example-translation").textContent).toBe("Eat it or not, do as you like.");
  });

  it("Similar Grammar: the difference, notes, nuance badge, translation and quiz feedback are Vietnamese", () => {
    render(<GrammarMeaning />);
    fireEvent.change(screen.getByTestId("grammar-view-select"), { target: { value: "similar" } });
    expect(screen.getByRole("button", { name: /Tất cả cặp \(40\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ngữ pháp dễ nhầm của tôi \(0\)/ })).toBeTruthy();
    const card = screen.getAllByTestId("similar-card")[0];
    expect(card.textContent).toContain("Cả bốn đều có nghĩa là");
    expect(card.textContent).not.toContain("All four mean");
    fireEvent.click(within(card).getAllByRole("button", { expanded: false })[0]);
    expect(within(card).getByTestId("swap-translation").textContent).toBe("Tôi nghĩ anh ấy đã biết tin này.");
    expect(card.textContent).toContain("Cách đoán phổ biến nhất.");
    expect(within(card).getByTestId("nuance-badge").textContent).toBe("Văn nói");
    fireEvent.click(within(card).getByRole("button", { name: "-(으)ㄴ/는 듯하다" }));
    expect(within(card).getByTestId("swap-translation").textContent).toBe("Có vẻ anh ấy đã biết tin này.");
    expect(within(card).getByTestId("nuance-badge").textContent).toBe("Trang trọng·Văn viết");
    fireEvent.click(within(card).getByRole("button", { name: /Tìm cái bẫy/ }));
    fireEvent.click(within(card).getByRole("button", { name: "있나 봐요" }));
    const feedback = within(card).getByTestId("trap-feedback").textContent;
    expect(feedback).toContain("Chưa đúng");
    expect(feedback).toContain("Báo cáo trang trọng dùng");
    expect(within(card).getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });

  it("the vocabulary list and flashcards are Vietnamese", () => {
    render(<GrammarMeaning />);
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(within(screen.getByRole("group", { name: "View mode" })).getAllByRole("button").map(b => b.textContent)).toEqual(["📋 Danh sách", "🗂️ Thẻ ghi nhớ", "⭐ Từ đã lưu (0)"]);
    expect(screen.getByRole("button", { name: /Cấp 4/ })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search vocabulary" }).placeholder).toBe("Tìm một từ hoặc nghĩa của nó");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search vocabulary" }), { target: { value: "zzzz" } });
    expect(screen.getByTestId("vocab-empty").textContent).toBe("Không tìm thấy từ nào.");
    fireEvent.click(screen.getByRole("button", { name: /Thẻ ghi nhớ/ }));
    expect(screen.getByTestId("card-counter").parentElement.textContent).toBe("1 / 100 từ");
    expect(screen.getByTestId("card-level").textContent).toBe("Cấp 3");
    expect(screen.getByLabelText("Show the meaning").textContent).toContain("Nhấn để lật thẻ");
    expect(screen.getByRole("button", { name: /Trước/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save 가입하다 to My Saved Words" }).textContent).toBe("☆ Lưu");
    expect(screen.getByRole("button", { name: "Play: 가입하다" }).textContent).toBe("Phát âm thanh");
    fireEvent.click(screen.getByLabelText("Show the meaning"));
    expect(screen.getByTestId("self-assessment").textContent).toContain("Đã nhớ!");
    expect(screen.getByTestId("self-assessment").textContent).toContain("Ôn lại sau");
  });

  it("the Vietnamese file is complete: every Core Grammar and Similar Grammar unit, with the same list lengths", async () => {
    const { default: real } = await vi.importActual("./grammarI18n.json");
    const units = real.vi.units;
    for (const item of CORE_GRAMMAR) {
      expect(units[`core:${item.no}`].short).toBeTruthy();
      expect(units[`core:${item.no}`].examples).toHaveLength(item.examples.length);
    }
    for (const group of SIMILAR_GRAMMAR) {
      const u = units[`similar:${group.id}`];
      expect(u.diff && u.why).toBeTruthy();
      expect(u.notes).toHaveLength(group.items.length);
      expect(u.sentences).toHaveLength(group.items.length);
    }
  });
});
