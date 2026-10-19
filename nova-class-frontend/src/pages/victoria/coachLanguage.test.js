import { describe, expect, it } from "vitest";
import { lessonMatchesLanguage } from "./coachLanguage";

const english = { steps: ["Start by defining a variable to store the score.", "Use the input() function to get the score."] };
const englishCoach = { hint: "Start by getting the score from the user using input().", nextStep: "Write the code to get the user's score." };
const burmese = { steps: ["ပထမဆုံး အမှတ်ကို သိမ်းဖို့ variable တစ်ခု ဖန်တီးပါ။", "input() သုံးပြီး အမှတ်ကို လက်ခံပါ။"] };
const burmeseCoach = { hint: "အသုံးပြုသူဆီက အမှတ်ကို input() နဲ့ ယူပါ။", nextStep: "အမှတ်ကို ယူတဲ့ကုဒ်ကို ရေးကြည့်ပါ။" };
const korean = { steps: ["점수를 저장할 변수를 먼저 만드세요.", "input() 함수로 점수를 입력받으세요."] };
const koreanCoach = { hint: "input()으로 사용자에게서 점수를 받아 보세요.", nextStep: "점수를 받는 코드를 써 보세요." };

describe("lessonMatchesLanguage", () => {
  it("accepts a lesson written in the chosen language", () => {
    expect(lessonMatchesLanguage(burmese, burmeseCoach, "my")).toBe(true);
    expect(lessonMatchesLanguage(korean, koreanCoach, "ko")).toBe(true);
    expect(lessonMatchesLanguage(english, englishCoach, "en")).toBe(true);
    expect(lessonMatchesLanguage(english, englishCoach, "vi")).toBe(true);   // Latin script is fine for Vietnamese
  });

  it("flags an English lesson when Settings is Burmese or Korean (the reported case)", () => {
    expect(lessonMatchesLanguage(english, englishCoach, "my")).toBe(false);
    expect(lessonMatchesLanguage(english, englishCoach, "ko")).toBe(false);
  });

  it("flags a Burmese or Korean lesson when Settings is English", () => {
    expect(lessonMatchesLanguage(burmese, burmeseCoach, "en")).toBe(false);
    expect(lessonMatchesLanguage(korean, koreanCoach, "en")).toBe(false);
    expect(lessonMatchesLanguage(burmese, burmeseCoach, "ko")).toBe(false);
  });

  it("is not fooled by a Burmese lesson that mentions an English keyword or two", () => {
    expect(lessonMatchesLanguage(burmese, burmeseCoach, "my")).toBe(true);
  });

  it("does not guess when there is hardly any text, and tolerates missing pieces", () => {
    expect(lessonMatchesLanguage({ steps: ["ok"] }, null, "my")).toBe(true);
    expect(lessonMatchesLanguage(null, null, "my")).toBe(true);
    expect(lessonMatchesLanguage({}, {}, "en")).toBe(true);
  });
});
