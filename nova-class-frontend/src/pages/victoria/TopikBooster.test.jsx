import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

vi.mock("../../components/Sidebar", () => ({ default: () => <nav>sidebar</nav> }));
const language = { lang: "en" };
vi.mock("../../LanguageContext", () => ({ useLang: () => language }));
vi.mock("./boosterI18n.json", () => ({ default: {
  vi: { units: {
    "r-1-2": { sub: "Chọn ngữ pháp phù hợp với chỗ trống trong câu", tips: ["Nhìn các từ ngay trước và sau chỗ trống.", "Kiểm tra từ chỉ thời gian (어제, 내일, -았/었을 때).", "Ví dụ: -는 바람에 (kết quả xấu), -도록 (mục đích), -더니.", "Không quá 30 giây cho một câu."] },
    "guide:reading-time": { title: "Mẹo phân bổ thời gian", tableHead: ["Phần", "Thời gian"], rowLabels: ["1 ~ 12", "13 ~ 27", "28 ~ 41", "42 ~ 50", "Xem lại / phiếu trả lời"], listTitle: "3 mẹo quan trọng", list: ["Không quá 2 phút cho câu khó.", "Tô phiếu OMR sau mỗi phần.", "Đừng bỏ trống, hãy đoán."] },
    general: { text: "Hãy đọc câu hỏi trước khi đọc đoạn văn." },
  } },
  ko: { units: {
    "r-1-2": { sub: "문장의 빈칸에 알맞은 문법을 고르십시오", tips: ["빈칸 앞뒤의 말을 먼저 보세요.", "시간 표현(어제, 내일, -았/었을 때)을 확인하세요.", "예: -는 바람에(나쁜 결과), -도록(목적), -더니.", "한 문제에 30초를 넘기지 마세요."] },
    "guide:listening-habits": { title: "가장 중요한 습관 5가지 (듣기)", list: ["미리 읽기", "소거법", "접속 표현", "숫자와 시간", "듣지 못한 내용은 제외"], leads: ["미리 읽기", "소거법", "접속 표현", "숫자와 시간", "듣지 못한 내용 제외"] },
    general: { text: "지문을 읽기 전에 문제를 먼저 읽으세요." },
  } },
} }));

import TopikBooster from "./TopikBooster";
import { BOOSTER, SKILLS, TIP_KINDS, GUIDES } from "./boosterData";

afterEach(() => { cleanup(); language.lang = "en"; });
const boxes = () => screen.getAllByTestId("booster-box");
const open = i => { fireEvent.click(within(boxes()[i]).getAllByRole("button")[0]); return boxes()[i]; };

describe("TOPIK Booster", () => {
  it("has well-formed data: every type has a description and tips in English and Burmese", () => {
    expect(BOOSTER.filter(x => x.skill === "reading")).toHaveLength(16);
    for (const item of BOOSTER) {
      expect(SKILLS[item.skill]).toBeTruthy();
      expect(item.range && item.ko).toBeTruthy();
      expect(item.sub.en && /[က-႟]/.test(item.sub.my)).toBeTruthy();
      expect(item.tips.length).toBeGreaterThanOrEqual(2);
      for (const tip of item.tips) {
        expect(TIP_KINDS[tip.kind]).toBeTruthy();
        expect(tip.en).toBeTruthy();
        expect(/[က-႟가-힣]/.test(tip.my)).toBe(true);          // Burmese, or a pure Korean list of examples
      }
      expect(item.tips.some(tip => /[က-႟]/.test(tip.my))).toBe(true);
      if (item.steps) {
        expect(item.steps.my).toHaveLength(item.steps.en.length);
        expect(item.steps.my.every(s => /[က-႟]/.test(s))).toBe(true);
      }
    }
  });

  it("lists the Reading question groups of the exam in order, each with its Korean title", () => {
    const reading = BOOSTER.filter(x => x.skill === "reading");
    expect(reading.map(x => x.range)).toEqual(["1 ~ 2", "3 ~ 4", "5 ~ 8", "9 ~ 10", "11 ~ 12", "13 ~ 15", "16 ~ 18", "19 ~ 20", "21 ~ 22", "23 ~ 24", "25 ~ 27", "28 ~ 31", "32 ~ 34", "35 ~ 38", "39 ~ 41", "42 ~ 50"]);
    expect(reading[0].ko).toBe("문법 - 빈칸 채우기");
    expect(reading[5].ko).toBe("문장 순서 배열");
    expect(reading[10].ko).toBe("신문 기사 제목");
  });

  it("starts with every question type collapsed: range, Korean title, description, badge", () => {
    render(<TopikBooster />);
    expect(boxes()).toHaveLength(BOOSTER.length);
    expect(boxes()[0].textContent).toContain("Q 1 ~ 2");
    expect(boxes()[0].textContent).toContain("문법 - 빈칸 채우기");
    expect(boxes()[0].textContent).toContain("Choose the grammar that fits the blank in the sentence");
    expect(within(boxes()[0]).getByTestId("skill-badge").textContent).toBe("읽기");
    expect(within(boxes()[0]).getByTestId("target-time").textContent).toContain("30 sec");
    expect(within(boxes()[1]).queryByTestId("target-time")).toBeNull();           // no time given for 3~4
    expect(screen.queryByTestId("booster-body")).toBeNull();
  });

  it("shows the general tip about reading the question first", () => {
    render(<TopikBooster />);
    expect(screen.getByTestId("general-tip").textContent).toContain("Read the question before you read the passage");
    cleanup();
    language.lang = "my";
    render(<TopikBooster />);
    expect(screen.getByTestId("general-tip").textContent).toContain("မေးခွန်းကို စာမဖတ်ခင် အရင်ဖတ် ပါ");
  });

  it("1 ~ 2 opens to the four tips: Context First, Tense Check, Grammar Nuance, Time Limit", () => {
    render(<TopikBooster />);
    const box = open(0);
    expect(within(box).queryByRole("list")).toBeNull();                              // no numbered steps for this group
    const tips = within(box).getAllByTestId("booster-tip");
    expect(tips.map(t => t.dataset.kind)).toEqual(["context", "tense", "nuance", "time"]);
    expect(tips[0].textContent).toContain("🔍");
    expect(tips[0].textContent).toContain("Context First");
    expect(tips[1].textContent).toContain("⏰");
    expect(tips[1].textContent).toContain("어제, 내일, -았/었을 때");
    expect(tips[2].textContent).toContain("💡");
    expect(tips[2].textContent).toContain("-는 바람에");
    expect(tips[2].textContent).toContain("-도록");
    expect(tips[2].textContent).toContain("-더니");
    expect(tips[3].textContent).toContain("⏱️");
    expect(tips[3].textContent).toContain("30 seconds");
  });

  it("each Reading group shows the points of its own question type", () => {
    render(<TopikBooster />);
    expect(open(1).textContent).toContain("-는 김에 ≈ -는 길에");
    expect(open(2).textContent).toContain("촉촉, 피부 → 화장품");
        expect(open(5).textContent).toContain("only 2 different first sentences");
    expect(open(10).textContent).toContain("껑충 (a sudden rise)");
    expect(open(15).textContent).toContain("46-47");
  });

  it("the Burmese text is the one given for each group", () => {
    language.lang = "my";
    render(<TopikBooster />);
    expect(open(5).textContent).toContain("ရွေးချယ်စရာ ၄ ခုမှာ ပထမစာကြောင်း ၂ မျိုးပဲ ရှိလေ့ရှိတယ်");
    expect(open(10).textContent).toContain("껑충 (ရုတ်တရက်တက်)");
    expect(boxes()[5].textContent).toContain("စာကြောင်း (က၊ ခ၊ ဂ၊ ဃ) များကို အစဉ်လိုက် ပြန်စီခြင်း");
  });

  it("lists the Listening question groups of the exam in order, each with its Korean title", () => {
    const listening = BOOSTER.filter(x => x.skill === "listening");
    expect(listening.map(x => x.range)).toEqual(["1 ~ 2", "3", "4 ~ 8", "9 ~ 12", "13 ~ 16", "17 ~ 20", "21 ~ 22", "23 ~ 24", "25 ~ 26", "27 ~ 28", "29 ~ 30", "31 ~ 32", "33 ~ 34", "35 ~ 36", "37 ~ 38", "39 ~ 40", "41 ~ 42", "43 ~ 44", "45 ~ 46", "47 ~ 48", "49 ~ 50"]);
    expect(listening[0].ko).toBe("그림 고르기");
    expect(listening[2].ko).toBe("이어질 수 있는 말");
    expect(listening[13].ko).toBe("연설 - 무엇을 하고 있는지 + 내용 일치");
  });

  it("a Listening group opens with the key idea first, then the points and the examples", () => {
    render(<TopikBooster />);
    fireEvent.click(screen.getByRole("button", { name: SKILLS.listening.label }));
    const box = open(2);                                                      // 4 ~ 8
    const tips = within(box).getAllByTestId("booster-tip");
    expect(tips[0].dataset.kind).toBe("key");
    expect(tips[0].textContent).toContain("🔑");
    expect(tips[0].textContent).toContain("The last line is a question or a problem");
    expect(tips.map(t => t.dataset.kind)).toEqual(["key", "point", "point", "example", "example", "trap"]);
    expect(box.textContent).toContain("약을 먹었는데 잘 안 나아요 → ③ 병원에 한번 가 보지 그래요?");
    expect(tips[5].textContent).toContain("⚠️");
  });

  it("the Listening text is the Burmese given for each group", () => {
    language.lang = "my";
    render(<TopikBooster />);
    fireEvent.click(screen.getByRole("button", { name: SKILLS.listening.label }));
    expect(boxes()[0].textContent).toContain("စကားပြောကို နားထောင်ပြီး အခြေအနေနဲ့ ကိုက်ညီတဲ့ ရုပ်ပုံ ရွေးခြင်း");
    expect(open(0).textContent).toContain("\"အခု ဘာလုပ်နေလဲ\" + \"ဘယ်နေရာလဲ\" ကိုသာ ဖမ်းပါ။");
    expect(open(1).textContent).toContain("꾸준히 증가 → ② (①က ကျပြီးမှ တက်လို့ မှား)");
    expect(open(14).textContent).toContain("ပညာပေး အစီအစဉ်");
  });

  it("multi-line points keep their line breaks", () => {
    render(<TopikBooster />);
    fireEvent.click(screen.getByRole("button", { name: SKILLS.listening.label }));
    fireEvent.click(screen.getByRole("button", { name: /Q 45 ~ 46/ }));
    const text = within(screen.getByTestId("booster-body")).getAllByTestId("booster-tip")[1].lastElementChild.lastElementChild;
    expect(text.textContent.split("\n")).toHaveLength(4);
    expect(text.style.whiteSpace).toBe("pre-line");
  });

  it("shows the Reading time plan table and its 3 key tips above the Reading questions", () => {
    render(<TopikBooster />);
    const guide = screen.getAllByTestId("booster-guide").find(g => g.dataset.guide === "reading-time");
    expect(guide.textContent).toContain("Time management tips");
    const rows = within(within(guide).getByTestId("guide-table")).getAllByRole("row").map(r => r.textContent);
    expect(rows).toEqual(["PartTime", "1 ~ 12~ 10 min", "13 ~ 27~ 20 min", "28 ~ 41~ 20 min", "42 ~ 50~ 17 min", "Review / answer sheet~ 3 min"]);
    expect(GUIDES[0].table.rows.reduce((sum, [, m]) => sum + m, 0)).toBe(70);        // the 70 minutes of the Reading section
    expect(within(guide).getAllByRole("listitem")).toHaveLength(3);
    expect(guide.textContent).toContain("3 key tips");
    expect(guide.textContent).toContain("Do not spend more than 2 minutes on a hard question");
    expect(boxes()[0].previousElementSibling).toBe(guide);                          // right above the first Reading box
  });

  it("shows the 5 Listening habits above the Listening questions", () => {
    render(<TopikBooster />);
    const guide = screen.getAllByTestId("booster-guide").find(g => g.dataset.guide === "listening-habits");
    expect(guide.textContent).toContain("The 5 most important habits (for Listening)");
    const items = within(guide).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toBe("Read ahead – While the audio instructions are playing, read the choices of the next question.");
    expect(items[4].textContent).toContain("치료법, 외국 자본");
    expect(guide.nextElementSibling.textContent).toContain("Q 1 ~ 2");
    expect(guide.nextElementSibling.textContent).toContain("그림 고르기");
  });

  it("both guides are in Burmese when Burmese is chosen", () => {
    language.lang = "my";
    render(<TopikBooster />);
    const time = screen.getAllByTestId("booster-guide")[0];
    expect(time.textContent).toContain("အချိန်ခွဲဝေမှု အကြံပြုချက်");
    expect(time.textContent).toContain("~ 10 မိနစ်");
    expect(time.textContent).toContain("ပြန်စစ် / အဖြေလွှာ");
    expect(time.textContent).toContain("အရေးကြီး အကြံ ၃ ချက်");
    expect(time.textContent).toContain("ခက်တဲ့ မေးခွန်းမှာ ၂ မိနစ်ထက် မကြာပါစေနဲ့။ ကျော်ပြီး နောက်မှ ပြန်လာပါ။");
    const listening = screen.getAllByTestId("booster-guide")[1];
    expect(listening.textContent).toContain("အရေးကြီးဆုံး ကျင့်စဉ် ၅ ချက် (listening အတွက်)");
    expect(listening.textContent).toContain("ကြိုဖတ်ခြင်း – အသံ ညွှန်ကြားချက် ဖွင့်နေချိန်မှာ နောက်မေးခွန်း ရွေးချယ်စရာကို ဖတ်ထားပါ။");
    expect(listening.textContent).toContain("မကြားခဲ့တာ ပါရင် ဖယ် – စကားပြောထဲ မပါတဲ့ အချက် (치료법, 외국 자본) ပါတဲ့ ရွေးချယ်စရာက အမြဲမှားပါတယ်။");
  });

  it("a guide follows the section filter: Reading shows the time plan only, Listening the habits only", () => {
    render(<TopikBooster />);
    fireEvent.click(screen.getByRole("button", { name: SKILLS.reading.label }));
    expect(screen.getAllByTestId("booster-guide").map(g => g.dataset.guide)).toEqual(["reading-time"]);
    fireEvent.click(screen.getByRole("button", { name: SKILLS.writing.label }));
    expect(screen.queryByTestId("booster-guide")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: SKILLS.listening.label }));
    expect(screen.getAllByTestId("booster-guide").map(g => g.dataset.guide)).toEqual(["listening-habits"]);
  });

  it("only one box is open at a time, and clicking the open box closes it", () => {
    render(<TopikBooster />);
    open(0);
    open(1);
    expect(screen.getAllByTestId("booster-body")).toHaveLength(1);
    expect(boxes()[1].querySelector("[data-testid=booster-body]")).toBeTruthy();
    fireEvent.click(within(boxes()[1]).getAllByRole("button")[0]);
    expect(screen.queryByTestId("booster-body")).toBeNull();
  });

  it("the section chips filter the question types", () => {
    render(<TopikBooster />);
    fireEvent.click(screen.getByRole("button", { name: SKILLS.writing.label }));
    expect(boxes()).toHaveLength(BOOSTER.filter(x => x.skill === "writing").length);
    expect(boxes().every(b => within(b).getByTestId("skill-badge").textContent === "쓰기")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: SKILLS.listening.label }));
    expect(boxes()).toHaveLength(21);
    expect(boxes().every(b => within(b).getByTestId("skill-badge").textContent === "듣기")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(boxes()).toHaveLength(BOOSTER.length);
  });

  it("shows the guide in Vietnamese when Vietnamese is chosen, with the Korean phrases kept", () => {
    language.lang = "vi";
    render(<TopikBooster />);
    expect(screen.getByTestId("general-tip").textContent).toContain("Hãy đọc câu hỏi trước khi đọc đoạn văn.");
    expect(boxes()[0].textContent).toContain("Câu 1 ~ 2");
    expect(boxes()[0].textContent).toContain("Chọn ngữ pháp phù hợp với chỗ trống trong câu");
    expect(within(boxes()[0]).getByTestId("target-time").textContent).toContain("30 giây");
    const box = open(0);
    const tips = within(box).getAllByTestId("booster-tip");
    expect(tips[0].textContent).toContain("Xem ngữ cảnh trước");                       // the label of the tip kind
    expect(tips[1].textContent).toContain("Kiểm tra thì");
    expect(tips[1].textContent).toContain("어제, 내일, -았/었을 때");
    expect(tips[2].textContent).toContain("Sắc thái ngữ pháp");
    expect(tips[2].textContent).toContain("-는 바람에 (kết quả xấu)");
    expect(tips[3].textContent).toContain("Giới hạn thời gian");
    expect(box.textContent).not.toContain("Context First");
    const guide = screen.getAllByTestId("booster-guide")[0];
    expect(guide.textContent).toContain("Mẹo phân bổ thời gian");
    expect(guide.textContent).toContain("~ 20 phút");
    expect(guide.textContent).toContain("Xem lại / phiếu trả lời");
    expect(guide.textContent).toContain("3 mẹo quan trọng");
    expect(within(guide).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows the guide in Korean when Korean is chosen", () => {
    language.lang = "ko";
    render(<TopikBooster />);
    expect(screen.getByTestId("general-tip").textContent).toContain("지문을 읽기 전에 문제를 먼저 읽으세요.");
    expect(boxes()[0].textContent).toContain("문 1 ~ 2");
    expect(boxes()[0].textContent).toContain("문장의 빈칸에 알맞은 문법을 고르십시오");
    expect(within(boxes()[0]).getByTestId("target-time").textContent).toContain("30초");
    expect(open(0).textContent).toContain("문맥 먼저");
    const habits = screen.getAllByTestId("booster-guide").find(g => g.dataset.guide === "listening-habits");
    expect(habits.textContent).toContain("가장 중요한 습관 5가지 (듣기)");
    expect(within(habits).getAllByRole("listitem")[0].textContent).toBe("미리 읽기 – 미리 읽기");
  });

  it("a part without a translation falls back to the English text", () => {
    language.lang = "vi";
    render(<TopikBooster />);
    expect(boxes()[1].textContent).toContain("Choose the grammar with the same meaning as the underlined grammar");      // 3 ~ 4 is not in the mock
    const box = open(1);
    expect(box.textContent).toContain("First think of the meaning of the underlined grammar");     // the text falls back to English
    expect(box.textContent).toContain("Điểm quan trọng");                                          // the label is still Vietnamese
  });

  it("other languages (here French) show the English text", () => {
    language.lang = "fr";
    render(<TopikBooster />);
    expect(open(0).textContent).toContain("Context First");
    expect(screen.getByTestId("general-tip").textContent).toContain("Read the question before you read the passage");
  });
});
