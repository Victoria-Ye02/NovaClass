import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

vi.mock("../../components/Sidebar", () => ({ default: () => <nav>sidebar</nav> }));
const language = { lang: "en" };
vi.mock("../../LanguageContext", () => ({ useLang: () => language }));
vi.mock("../../services/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock("./vocabExtra.json", () => ({ default: {} }));
vi.mock("./vocabI18n.json", () => ({ default: {} }));
vi.mock("./idiomI18n.json", () => ({ default: {
  "idiom:1": { en: "To find a way to solve a problem.", vi: "Tìm ra hướng giải quyết vấn đề." },
  "proverb:1": { en: "Bad luck strikes when you least expect it.", vi: "Đi đúng ngày chợ phiên." },
} }));

import API from "../../services/api";
import GrammarMeaning from "./GrammarMeaning";
import { IDIOM_DATA, IDIOM_CATEGORIES } from "./idiomData";
import { idiomMeaning, speakable } from "./idiomText";

function memoryStorage() {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: k => { data.delete(k); } };
}
beforeEach(() => { language.lang = "en"; vi.stubGlobal("localStorage", memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openNotebook = () => { render(<GrammarMeaning />); fireEvent.click(screen.getAllByRole("tab")[2]); };
const rows = () => screen.getAllByTestId("idiom-row");
const mode = name => fireEvent.click(screen.getByRole("button", { name }));

describe("Idioms · Proverbs notebook: data", () => {
  it("has the three categories of the notebook with their sizes", () => {
    expect(IDIOM_CATEGORIES.map(c => [c.name, IDIOM_DATA[c.key].length])).toEqual([["관용 표현", 187], ["속담", 121], ["신문 비유 표현", 52]]);
    for (const c of IDIOM_CATEGORIES) {
      IDIOM_DATA[c.key].forEach((r, i) => {
        expect(r.n).toBe(i + 1);
        expect(r.kr).toMatch(/[가-힣]/);
        expect(r.ko).toMatch(/[가-힣]/);
        expect(r.my).toMatch(/[က-႟]/);
      });
    }
    expect(IDIOM_DATA.idiom[0]).toMatchObject({ kr: "가닥을 잡다", ko: "문제 해결 방법을 찾아내다.", my: "ပြဿနာဖြေရှင်းနည်း လမ်းစ ရှာတွေ့သည်" });
  });

  it("the meaning follows the language with fallbacks, and the audio text drops the notebook marks", () => {
    const e = { cat: "idiom", n: 1, kr: "가닥을 잡다", ko: "문제 해결 방법을 찾아내다.", my: "ပြဿနာ" };
    expect(idiomMeaning(e, "my")).toBe("ပြဿနာ");
    expect(idiomMeaning(e, "ko")).toBe("문제 해결 방법을 찾아내다.");
    expect(idiomMeaning(e, "en")).toBe("To find a way to solve a problem.");
    expect(idiomMeaning(e, "vi")).toBe("Tìm ra hướng giải quyết vấn đề.");
    expect(idiomMeaning({ ...e, n: 2 }, "vi")).toBe("ပြဿနာ");                 // not translated -> Burmese
    expect(speakable("(꼬리에) 꼬리를 물다")).toBe("꼬리에 꼬리를 물다");
    expect(speakable("실마리를 찾다/잡다")).toBe("실마리를 찾다 잡다");
    expect(speakable("고개를 숙이다 ① 잘못")).toBe("고개를 숙이다 잘못");
  });
});

describe("Idioms · Proverbs notebook: the page", () => {
  it("is a third tab of Grammar & Meaning, opening on the idioms list with the category tabs and counts", () => {
    openNotebook();
    expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
    const cats = within(screen.getByRole("group", { name: "Category" })).getAllByRole("button");
    expect(cats.map(b => b.textContent)).toEqual(["관용 표현 (187)", "속담 (121)", "신문 비유 표현 (52)"]);
    expect(rows()).toHaveLength(187);
    expect(screen.getByRole("group", { name: "Audio speed" })).toBeTruthy();
    expect(screen.getByTestId("idiom-notebook").textContent).toContain("idioms (Reading 21~22) · proverbs (Writing 54 / Reading 21~22) · news metaphors (Reading 25~27)");
  });

  it("a row shows the number, the expression, the meaning in the chosen language and a speaker", () => {
    openNotebook();
    expect(rows()[0].textContent).toContain("1");
    expect(rows()[0].textContent).toContain("가닥을 잡다");
    expect(within(rows()[0]).getByTestId("idiom-meaning").textContent).toBe("To find a way to solve a problem.");
    expect(within(rows()[0]).getByRole("button", { name: "Play: 가닥을 잡다" })).toBeTruthy();
  });

  it("the category tabs switch the list", () => {
    openNotebook();
    fireEvent.click(screen.getByRole("button", { name: /속담/ }));
    expect(rows()).toHaveLength(121);
    expect(rows()[0].textContent).toContain("가는 날이 장날");
    fireEvent.click(screen.getByRole("button", { name: /신문 비유 표현/ }));
    expect(rows()).toHaveLength(52);
    expect(rows()[0].textContent).toContain("(사람)의 입김");
  });

  it("clicking a row opens the Korean explanation with its own speaker, and clicking again closes it", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openNotebook();
    const row = rows()[0];
    expect(within(row).queryByTestId("idiom-explanation")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: /가닥을 잡다 —/ }));
    const box = within(row).getByTestId("idiom-explanation");
    expect(box.textContent).toContain("Meaning in Korean");
    expect(box.textContent).toContain("문제 해결 방법을 찾아내다.");
    fireEvent.click(within(box).getByRole("button", { name: "Play: 문제 해결 방법을 찾아내다." }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "문제 해결 방법을 찾아내다.", speed: "normal" });
    fireEvent.click(within(row).getByRole("button", { name: /가닥을 잡다 —/ }));
    expect(within(row).queryByTestId("idiom-explanation")).toBeNull();
  });

  it("a row's speaker reads the expression without the marks, at the chosen speed", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openNotebook();
    fireEvent.click(screen.getByRole("button", { name: "Slow" }));
    fireEvent.click(within(rows()[1]).getByRole("button", { name: "Play: 실마리를 찾다 잡다" }));      // 실마리를 찾다/잡다
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    expect(API.post.mock.calls[0][1]).toEqual({ text: "실마리를 찾다 잡다", speed: "slow" });
  });

  it("search matches the expression, the meaning or the explanation", () => {
    openNotebook();
    const search = screen.getByRole("searchbox", { name: "Search expressions" });
    fireEvent.change(search, { target: { value: "가슴을 쓸어" } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(search, { target: { value: "solve a problem" } });
    expect(rows()[0].textContent).toContain("가닥을 잡다");
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(screen.getByTestId("idiom-empty").textContent).toBe("No results.");
  });

  it("the star saves expressions of any category into Saved, remembered across visits", () => {
    openNotebook();
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Save 가닥을 잡다 to Saved Expressions" }));
    fireEvent.click(screen.getByRole("button", { name: /속담/ }));
    fireEvent.click(within(rows()[0]).getByRole("button", { name: "Save 가는 날이 장날 to Saved Expressions" }));
    mode(/Saved Expressions \(2\)/);
    expect(rows()).toHaveLength(2);
    expect(rows().map(r => within(r).getByTestId("idiom-chip").textContent)).toEqual(["관용", "속담"]);
    expect(screen.queryByRole("group", { name: "Category" })).toBeNull();
    expect(JSON.parse(localStorage.getItem("topik_saved_idioms"))).toEqual(["idiom:1", "proverb:1"]);
    fireEvent.click(within(rows()[0]).getByRole("button", { name: /^Remove/ }));
    fireEvent.click(within(rows()[0]).getByRole("button", { name: /^Remove/ }));
    expect(screen.getByTestId("idiom-empty").textContent).toContain("No saved expressions yet");
  });

  it("Flashcard Mode: front shows the expression, a click flips to the meaning and the explanation", () => {
    openNotebook();
    mode(/Flashcard Mode/);
    expect(screen.getByTestId("idiom-counter").textContent).toBe("1 / 187");
    const card = screen.getByTestId("idiom-card");
    expect(card.style.transformStyle).toBe("preserve-3d");
    expect(card.textContent).toContain("가닥을 잡다");
    expect(card.dataset.flipped).toBe("false");
    fireEvent.click(within(card).getByLabelText("Show the meaning"));
    expect(card.dataset.flipped).toBe("true");
    expect(card.style.transform).toBe("rotateY(180deg)");
    expect(card.textContent).toContain("To find a way to solve a problem.");
    expect(card.textContent).toContain("문제 해결 방법을 찾아내다.");
  });

  it("the cards move with Previous / Next, shuffle, and the bookmark and audio buttons work", async () => {
    API.post.mockReset();
    API.post.mockResolvedValue({ data: new Blob(["mp3"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fake" });
    vi.stubGlobal("Audio", function () { this.play = async () => {}; this.pause = () => {}; });
    openNotebook();
    mode(/Flashcard Mode/);
    fireEvent.click(screen.getByRole("button", { name: /Next ›/ }));
    expect(screen.getByTestId("idiom-counter").textContent).toBe("2 / 187");
    expect(screen.getByTestId("idiom-card").textContent).toContain("실마리를 찾다");
    fireEvent.click(screen.getByRole("button", { name: /‹ Previous/ }));
    fireEvent.click(screen.getByRole("button", { name: /‹ Previous/ }));
    expect(screen.getByTestId("idiom-counter").textContent).toBe("187 / 187");
    fireEvent.click(screen.getByRole("button", { name: /Shuffle/ }));
    expect(screen.getByTestId("idiom-counter").textContent).toBe("1 / 187");
    const kr = IDIOM_DATA.idiom.map(r => r.kr);
    const shown = screen.getByTestId("idiom-card").textContent;
    expect(kr.some(k => shown.includes(k))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Save .* to Saved Expressions$/ }));
    expect(screen.getByRole("button", { name: /Saved Expressions \(1\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Play:/ }));
    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
  });

  it("Vietnamese shows the Vietnamese meaning and labels; Burmese the Burmese one; Korean the Korean explanation", () => {
    language.lang = "vi";
    openNotebook();
    expect(within(rows()[0]).getByTestId("idiom-meaning").textContent).toBe("Tìm ra hướng giải quyết vấn đề.");
    expect(screen.getByRole("searchbox", { name: "Search expressions" }).placeholder).toBe("Tìm theo tiếng Hàn, nghĩa hoặc giải thích");
    expect(screen.getByRole("button", { name: /Đã lưu \(0\)/ }).textContent).toContain("Đã lưu");
    cleanup();
    language.lang = "my";
    openNotebook();
    expect(within(rows()[0]).getByTestId("idiom-meaning").textContent).toBe("ပြဿနာဖြေရှင်းနည်း လမ်းစ ရှာတွေ့သည်");
    cleanup();
    language.lang = "ko";
    openNotebook();
    expect(within(rows()[0]).getByTestId("idiom-meaning").textContent).toBe("문제 해결 방법을 찾아내다.");
  });
});
