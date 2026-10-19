import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

vi.mock("./PlayButton", () => ({ default: () => null }));
vi.mock("./vocabExtra.json", () => ({ default: { "3:1": { syn: [], ant: [], example: { ko: "저는 동호회에 가입했어요.", my: "ကျွန်တော် အသင်းမှာ ဝင်ခဲ့တယ်။" } } } }));
vi.mock("./vocabI18n.json", () => ({ default: { "3:1": { en: "to join / to sign up", vi: "tham gia / đăng ký", ko: "단체에 들어가다", ex: { en: "I joined a club.", vi: "Tôi đã tham gia câu lạc bộ." } } } }));

import { LanguageProvider, useLang } from "../../LanguageContext";
import VocabList from "./VocabList";

function memoryStorage() {
  const data = new Map();
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: k => { data.delete(k); } };
}
beforeEach(() => { vi.stubGlobal("localStorage", memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// the real LanguageProvider, with a button that does what Settings does
function Harness() {
  const { changeLang } = useLang();
  return (
    <div>
      {["my", "en", "vi", "ko"].map(code => <button key={code} onClick={() => changeLang(code)}>lang-{code}</button>)}
      <VocabList speed="normal" />
    </div>
  );
}

const meaning = () => within(screen.getAllByTestId("vocab-row")[0]).getByTestId("vocab-meaning").textContent;

describe("Vocabulary follows the Settings language live", () => {
  it("re-renders the meaning column at once when the language changes, without a reload", () => {
    render(<LanguageProvider><Harness /></LanguageProvider>);
    expect(meaning()).toBe("to join / to sign up");                              // English is the default
    act(() => { fireEvent.click(screen.getByText("lang-vi")); });
    expect(meaning()).toBe("tham gia / đăng ký");
    act(() => { fireEvent.click(screen.getByText("lang-my")); });
    expect(meaning()).toBe("စာရင်းသွင်းသည် / အသင်းဝင်သည်");
    act(() => { fireEvent.click(screen.getByText("lang-ko")); });
    expect(meaning()).toBe("단체에 들어가다");
    act(() => { fireEvent.click(screen.getByText("lang-en")); });
    expect(meaning()).toBe("to join / to sign up");
  });

  it("an opened example changes language too, and the choice is the one saved in Settings", () => {
    render(<LanguageProvider><Harness /></LanguageProvider>);
    fireEvent.click(within(screen.getAllByTestId("vocab-row")[0]).getByRole("button", { name: /가입하다 —/ }));
    expect(screen.getByTestId("example-translation").textContent).toBe("I joined a club.");
    act(() => { fireEvent.click(screen.getByText("lang-vi")); });
    expect(screen.getByTestId("example-translation").textContent).toBe("Tôi đã tham gia câu lạc bộ.");
    expect(localStorage.getItem("nova_lang")).toBe("vi");
  });
});
