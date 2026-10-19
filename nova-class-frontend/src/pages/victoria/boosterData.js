// TOPIK Booster: a solving guide for the main TOPIK II question types. Each type has its question numbers, a skill badge,
// an optional target time, optional numbered steps and tips. A tip has a kind (see TIP_KINDS) and its text in English and Burmese;
// other languages show the English text. Question numbers follow the usual TOPIK II layout; check them against the
// latest exam paper, because the layout of a section can change between exam versions.
export const SKILLS = {
  reading: { label: "Reading · 읽기", short: "읽기", color: "#2563EB" },
  writing: { label: "Writing · 쓰기", short: "쓰기", color: "#16A34A" },
  listening: { label: "Listening · 듣기", short: "듣기", color: "#EA580C" },
};

export const TIP_KINDS = {
  context: { icon: "🔍", en: "Context First", my: "ရှေ့နောက်စာသား အရင်ကြည့်", vi: "Xem ngữ cảnh trước", ko: "문맥 먼저" },
  tense: { icon: "⏰", en: "Tense Check", my: "ကာလ စစ်ဆေး", vi: "Kiểm tra thì", ko: "시제 확인" },
  nuance: { icon: "💡", en: "Grammar Nuance", my: "သဒ္ဒါ အရိပ်အမြွက်", vi: "Sắc thái ngữ pháp", ko: "문법의 뉘앙스" },
  time: { icon: "⏱️", en: "Time Limit", my: "အချိန်ကန့်သတ်", vi: "Giới hạn thời gian", ko: "시간 제한" },
  trap: { icon: "⚠️", en: "Watch Out", my: "သတိထားရန်", vi: "Cần lưu ý", ko: "주의" },
  key: { icon: "🔑", en: "Key Idea", my: "အဓိက သော့ချက်", vi: "Ý chính", ko: "핵심 아이디어" },
  point: { icon: "📌", en: "Key Point", my: "အဓိကအချက်", vi: "Điểm quan trọng", ko: "핵심 포인트" },
  example: { icon: "📝", en: "Example", my: "ဥပမာ", vi: "Ví dụ", ko: "예시" },
  check: { icon: "✅", en: "Check", my: "စစ်ဆေးရန်", vi: "Kiểm tra", ko: "확인" },
  note: { icon: "ℹ️", en: "Note", my: "မှတ်ချက်", vi: "Ghi chú", ko: "참고" },
};

// shown above the list: a tip that works for every question
export const GENERAL_TIP = {
  icon: "💡",
  en: "Read the question before you read the passage. If you know what to look for, you save a lot of time.",
  my: "မေးခွန်းကို စာမဖတ်ခင် အရင်ဖတ် ပါ။ ဘာရှာရမလဲ သိရင် အချိန်အများကြီး သက်သာပါတယ်။",
};

// Cards that sit above the question types of one skill: a time plan table and the key habits. `table.rows` are
// [label, minutes]; `list` is an ordered list whose items may have a bold lead-in (`lead`).
export const GUIDES = [
  {
    id: "reading-time", skill: "reading", icon: "⏱️",
    title: { en: "Time management tips", my: "အချိန်ခွဲဝေမှု အကြံပြုချက်" },
    table: {
      head: { en: ["Part", "Time"], my: ["အပိုင်း", "အချိန်"] },
      rows: [
        [{ en: "1 ~ 12", my: "1 ~ 12" }, 10],
        [{ en: "13 ~ 27", my: "13 ~ 27" }, 20],
        [{ en: "28 ~ 41", my: "28 ~ 41" }, 20],
        [{ en: "42 ~ 50", my: "42 ~ 50" }, 17],
        [{ en: "Review / answer sheet", my: "ပြန်စစ် / အဖြေလွှာ" }, 3],
      ],
    },
    listTitle: { en: "3 key tips", my: "အရေးကြီး အကြံ ၃ ချက်" },
    list: [
      { en: "Do not spend more than 2 minutes on a hard question. Skip it and come back later.", my: "ခက်တဲ့ မေးခွန်းမှာ ၂ မိနစ်ထက် မကြာပါစေနဲ့။ ကျော်ပြီး နောက်မှ ပြန်လာပါ။" },
      { en: "Do not mark the answer sheet (OMR) all at once at the end. Mark it after finishing each part.", my: "အဖြေလွှာ (OMR) ကို အဆုံးမှ တစ်ခါတည်း မခြစ်ပါနဲ့။ အပိုင်းတစ်ခု ပြီးတိုင်း ခြစ်ပါ။" },
      { en: "Even if you do not know, do not leave a blank. There is no penalty, so guess and mark it.", my: "မသိတာ ရှိရင်တောင် ကွက်လပ် မထားပါနဲ့။ အမှတ်နုတ်တာ မရှိလို့ ခန့်မှန်းပြီး ခြစ်ပါ။" },
    ],
  },
  {
    id: "listening-habits", skill: "listening", icon: "🏆",
    title: { en: "The 5 most important habits (for Listening)", my: "အရေးကြီးဆုံး ကျင့်စဉ် ၅ ချက် (listening အတွက်)" },
    listTitle: null,
    list: [
      { lead: { en: "Read ahead", my: "ကြိုဖတ်ခြင်း" }, en: "While the audio instructions are playing, read the choices of the next question.", my: "အသံ ညွှန်ကြားချက် ဖွင့်နေချိန်မှာ နောက်မေးခွန်း ရွေးချယ်စရာကို ဖတ်ထားပါ။" },
      { lead: { en: "Eliminate", my: "ဖယ်ထုတ်နည်း" }, en: "While listening, cross out what is wrong with an X. Then you only choose between the remaining 1-2.", my: "နားထောင်ရင်း မှားတာကို X ခြစ်သွားပါ။ ကျန်တာ ၁~၂ ခုထဲက ရွေးရုံပါပဲ။" },
      { lead: { en: "Connectors", my: "ဆက်စပ်စကား" }, en: "What comes after 하지만, 그런데, 무엇보다, 결국, 이렇게 = the answer.", my: "하지만, 그런데, 무엇보다, 결국, 이렇게 နောက်က စကား = အဖြေ။" },
      { lead: { en: "Numbers and time", my: "ကိန်းဂဏန်း/အချိန်" }, en: "처음, 이미, 아직, 작년부터, ~ 이상 are the most common tricks.", my: "처음, 이미, 아직, 작년부터, ~ 이상 က လှည့်ကွက် အများဆုံး။" },
      { lead: { en: "Drop what you did not hear", my: "မကြားခဲ့တာ ပါရင် ဖယ်" }, en: "A choice with a point that was not in the dialogue (치료법, 외국 자본) is always wrong.", my: "စကားပြောထဲ မပါတဲ့ အချက် (치료법, 외국 자본) ပါတဲ့ ရွေးချယ်စရာက အမြဲမှားပါတယ်။" },
    ],
  },
];

export const BOOSTER = [
  // ── Reading (읽기): the question format of each group and how to answer it ──
  {
    id: "r-1-2", skill: "reading", range: "1 ~ 2", ko: "문법 - 빈칸 채우기", targetSeconds: 30,
    sub: { en: "Choose the grammar that fits the blank in the sentence", my: "စာကြောင်းထဲက ကွက်လပ်မှာ ကိုက်ညီတဲ့ သဒ္ဒါ ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "context", en: "Look at the words right before and after the blank before reading the whole sentence.", my: "စာကြောင်းတစ်ခုလုံးကို မဖတ်ခင် ကွက်လပ်ရှေ့နောက် စကားလုံး ကို အရင်ကြည့်ပါ။" },
      { kind: "tense", en: "Check that the time words (어제, 내일, -았/었을 때) and the verb form (tense) agree.", my: "အချိန်ပြ စကားလုံး (어제, 내일, -았/었을 때) နဲ့ ကြိယာ ပုံစံ (tense) ကိုက်ညီမှုကို စစ်ပါ။" },
      { kind: "nuance", en: "Example: if you know the feel and use of grammar such as -는 바람에 (a bad result), -도록 (purpose) and -더니 (something seen before), you can answer at once.", my: "ဥပမာ – -는 바람에 (မကောင်းတဲ့ ရလဒ်), -도록 (ရည်ရွယ်ချက်), -더니 (အရင်က တွေ့ခဲ့တာ) စတဲ့ သဒ္ဒါတွေရဲ့ ခံစားချက်/သုံးပုံ ကို သိထားရင် ချက်ချင်း ဖြေနိုင်ပါတယ်။" },
      { kind: "time", en: "Do not spend more than 30 seconds on one question.", my: "တစ်ပုဒ်ကို စက္ကန့် ၃၀ ထက် မပိုစေပါနဲ့။" },
    ],
  },
  {
    id: "r-3-4", skill: "reading", range: "3 ~ 4", ko: "유사 문법",
    sub: { en: "Choose the grammar with the same meaning as the underlined grammar", my: "မျဉ်းသားထားတဲ့ သဒ္ဒါနဲ့ အဓိပ္ပာယ်တူ သဒ္ဒါ ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "First think of the meaning of the underlined grammar in your own language.", my: "မျဉ်းသားထားတဲ့ သဒ္ဒါရဲ့ အဓိပ္ပာယ် ကို မြန်မာလို အရင်ပြန်ပြီး စဉ်းစားပါ။" },
      { kind: "example", en: "Memorise the common pairs:\n• -는 김에 ≈ -는 길에\n• -기 마련이다 ≈ -는 법이다\n• -ㄹ 뿐만 아니라 ≈ -ㄹ 뿐더러\n• -다시피 하다 ≈ -는 것과 마찬가지다", my: "အဖြစ်များတဲ့ အတွဲတွေကို အလွတ်ကျက်ထားပါ –\n• -는 김에 ≈ -는 길에\n• -기 마련이다 ≈ -는 법이다\n• -ㄹ 뿐만 아니라 ≈ -ㄹ 뿐더러\n• -다시피 하다 ≈ -는 것과 마찬가지다" },
      { kind: "check", en: "Put each choice into the blank and read it. If the meaning does not change, it is the right answer.", my: "ရွေးချယ်စရာတွေကို ကွက်လပ်ထဲ ထည့်ပြီး ဖတ်ကြည့်ပါ။ အဓိပ္ပာယ် မပြောင်းရင် အဖြေမှန်ပါ။" },
    ],
  },
  {
    id: "r-5-8", skill: "reading", range: "5 ~ 8", ko: "안내문 / 광고 / 안내판",
    sub: { en: "Choose the title or meaning of an advertisement, notice or sign", my: "ကြော်ငြာ၊ အသိပေးစာ၊ ဆိုင်းဘုတ်ရဲ့ ခေါင်းစဉ်/အဓိပ္ပာယ် ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "Look for only 2-3 keywords. You do not need to understand the whole text.", my: "Keyword ၂ ~ ၃ လုံး ကိုသာ ရှာပါ။ စာအကုန် နားလည်စရာ မလိုပါ။" },
      { kind: "example", en: "Example:\n• 촉촉, 피부 → 화장품\n• 한 방울, 아껴요 → 물 절약\n• 클릭 한 번 → 인터넷 쇼핑", my: "ဥပမာ –\n• 촉촉, 피부 → 화장품\n• 한 방울, 아껴요 → 물 절약\n• 클릭 한 번 → 인터넷 쇼핑" },
      { kind: "note", en: "Questions 5-6 are usually advertisements for a product or place; 7-8 are usually campaigns, warnings or notices.", my: "5~6 က ပစ္စည်း/နေရာ ကြော်ငြာ၊ 7~8 က ကမ်ပိန်း/သတိပေးချက်/အသိပေးစာ ဖြစ်တတ်ပါတယ်။" },
    ],
  },
  {
    id: "r-9-10", skill: "reading", range: "9 ~ 10", ko: "표 / 그래프 / 안내문 내용 확인",
    sub: { en: "Choose what matches or is correct about the table, graph or notice", my: "ဇယား၊ ဂရပ်၊ အသိပေးစာပါ အကြောင်းအရာနဲ့ တူညီတာ/မှန်တာ ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "Read the choices first, then check them one by one against the table or graph.", my: "ရွေးချယ်စရာကို အရင်ဖတ် ပြီးမှ ဇယား/ဂရပ်နဲ့ တစ်ခုချင်း တိုက်စစ်ပါ။" },
      { kind: "check", en: "In a graph, watch for words like 증가 (increase), 감소 (decrease), 가장 높다/낮다 (highest/lowest) and 두 배 (twice).", my: "ဂရပ်မှာ – 증가 (တိုး), 감소 (ကျ), 가장 높다/낮다, 두 배 စတဲ့ စကားလုံးတွေကို သတိထားပါ။" },
      { kind: "check", en: "In a notice, check the date, time, price, 무료/유료 (free/paid), how to apply (신청 방법) and who may take part.", my: "အသိပေးစာမှာ – ရက်စွဲ၊ အချိန်၊ ဈေးနှုန်း၊ 무료/유료၊ 신청 방법၊ ပါဝင်ခွင့်ရှိသူ တွေကို စစ်ပါ။" },
    ],
  },
  {
    id: "r-11-12", skill: "reading", range: "11 ~ 12", ko: "글의 내용과 같은 것",
    sub: { en: "Choose what matches the content of a short passage", my: "စာပိုဒ်တိုပါ အကြောင်းအရာနဲ့ တူညီတာ ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "Take the keywords (nouns and numbers) from the 4 choices and look for them in the passage.", my: "ရွေးချယ်စရာ ၄ ခုထဲက keyword (နာမ်/ကိန်းဂဏန်း) ကို စာပိုဒ်ထဲမှာ ရှာပါ။" },
      { kind: "trap", en: "Tricks: a changed time (이미 vs 아직), cause and result swapped, and absolute words like 모든 / 항상 (all / always) are rarely the right answer.", my: "လှည့်ကွက်တွေ – အချိန် (이미 vs 아직)၊ အကြောင်းနဲ့ အကျိုး ပြောင်းထားတာ၊ 모든/항상 လို အပြည့်အဝ စကားလုံးတွေက အဖြေမှားဖြစ်ခဲပါတယ်။" },
    ],
  },
  {
    id: "r-13-15", skill: "reading", range: "13 ~ 15", ko: "문장 순서 배열",
    sub: { en: "Put the sentences (가, 나, 다, 라) back in order", my: "စာကြောင်း (က၊ ခ၊ ဂ၊ ဃ) များကို အစဉ်လိုက် ပြန်စီခြင်း" },
    tips: [
      { kind: "point", en: "The 4 choices usually have only 2 different first sentences. First decide which of the two can start the passage.", my: "ရွေးချယ်စရာ ၄ ခုမှာ ပထမစာကြောင်း ၂ မျိုးပဲ ရှိလေ့ရှိတယ်။ နှစ်ခုထဲက ဘယ်ဟာ စနိုင်လဲ အရင်ဆုံးဖြတ်ပါ။" },
      { kind: "trap", en: "What cannot be in the first sentence: connectors and pointing words such as 그래서, 하지만, 이, 그, 이것, 또한, 따라서.", my: "ပထမစာကြောင်းမှာ မပါနိုင်တာတွေ – 그래서, 하지만, 이, 그, 이것, 또한, 따라서 စတဲ့ ဆက်စပ်စကား/ညွှန်းစကား။" },
      { kind: "point", en: "Once the first sentence is decided, you only have to choose between the remaining 2.", my: "ပထမစာကြောင်း ဆုံးဖြတ်ပြီးရင် ကျန်တာ ၂ ခုထဲ ရွေးရုံပါပဲ။" },
    ],
  },
  {
    id: "r-16-18", skill: "reading", range: "16 ~ 18", ko: "빈칸에 들어갈 내용",
    sub: { en: "Choose the sentence that goes into the blank of the passage", my: "စာပိုဒ်၏ ကွက်လပ်တွင် ဝင်ရမယ့် စာကြောင်း ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "context", en: "Read mainly the sentence before and the sentence after the blank.", my: "ကွက်လပ်ရဲ့ ရှေ့စာကြောင်းနဲ့ နောက်စာကြောင်း ကို အဓိကဖတ်ပါ။" },
      { kind: "nuance", en: "Connectors guide the answer: 그래서 (result), 하지만 (contrast), 즉 (restating).", my: "그래서 (ရလဒ်), 하지만 (ဆန့်ကျင်), 즉 (ပြန်ရှင်း) စတဲ့ ဆက်စပ်စကားက အဖြေကို လမ်းညွှန်ပေးပါတယ်။" },
      { kind: "point", en: "A choice that rewrites a word from the passage in different words is often the right answer.", my: "စာပိုဒ်ထဲက စကားလုံးကို ပြောင်းရေးထားတဲ့ ရွေးချယ်စရာက အဖြေမှန် ဖြစ်တတ်ပါတယ်။" },
    ],
  },
  {
    id: "r-19-20", skill: "reading", range: "19 ~ 20", ko: "빈칸 + 중심 생각 & 기분/태도",
    sub: { en: "Choose the main idea and the writer's feeling or attitude", my: "စာပိုဒ်၏ အဓိကလိုရင်း စိတ်ကူးနှင့် စာရေးသူ၏ ခံစားချက်/သဘောထား ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "19: The blank often takes a connector or adverb (게다가, 오히려, 결코, 마치). Look at the relation before and after it (addition, contrast or example).", my: "19 – ကွက်လပ်ထဲ ဆက်စပ်စကား/ကြိယာဝိသေသန (게다가, 오히려, 결코, 마치) ထည့်ရတာ များပါတယ်။ ရှေ့နောက် ဆက်နွယ်မှု (ထပ်ဆင့်/ဆန့်ကျင်/ဥပမာ) ကို ကြည့်ပါ။" },
      { kind: "point", en: "20: The writer's main idea is usually at the end of the passage. Look for the sentence with -아야 한다, -는 것이 중요하다 or -ㄹ 필요가 있다.", my: "20 – စာရေးသူရဲ့ အဓိက အယူအဆက စာပိုဒ်အဆုံး မှာ ရှိလေ့ရှိတယ်။ -아야 한다, -는 것이 중요하다, -ㄹ 필요가 있다 ပါတဲ့ စာကြောင်းကို ရှာပါ။" },
    ],
  },
  {
    id: "r-21-22", skill: "reading", range: "21 ~ 22", ko: "관용구/속담 & 중심 내용",
    sub: { en: "Choose the main content of a passage that contains an idiom or proverb", my: "စကားပုံ/ဆိုရိုးစကား ပါသော စာပိုဒ်၏ အဓိက အကြောင်းအရာ ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "21: Memorise the idioms that appear often: 발이 넓다, 손을 놓다, 눈코 뜰 새 없다, 귀가 얇다, 발 벗고 나서다, 머리를 맞대다.", my: "21 – မကြာခဏ ထွက်တဲ့ 관용구 တွေကို ကျက်ထားပါ – 발이 넓다, 손을 놓다, 눈코 뜰 새 없다, 귀가 얇다, 발 벗고 나서다, 머리를 맞대다။" },
      { kind: "context", en: "If you do not know one, guess from the situation before and after it (positive or negative).", my: "မသိရင် ရှေ့နောက် အခြေအနေ (အပြုသဘော/အပျက်သဘော) ကို ကြည့်ပြီး ခန့်မှန်းပါ။" },
      { kind: "point", en: "22: As in 11-12, match the keywords against the passage.", my: "22 – 11~12 လိုပဲ keyword တိုက်စစ်ပါ။" },
    ],
  },
  {
    id: "r-23-24", skill: "reading", range: "23 ~ 24", ko: "수필/소설 - 심정 & 내용",
    sub: { en: "Read the passage and choose the character's feeling and what matches the content", my: "စာပိုဒ်ကို ဖတ်ပြီး စာရေးသူ၏ စိတ်ခံစားချက်နှင့် တူညီသော အကြောင်းအရာ ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "23: The underlined part asks for the character's feeling. Look at the events before and after it.", my: "23 – မျဉ်းသားထားတဲ့ နေရာမှာ ဇာတ်ကောင်ရဲ့ ခံစားချက် ကို မေးတာပါ။ ရှေ့နောက် အဖြစ်အပျက်ကို ကြည့်ပါ။" },
      { kind: "example", en: "Memorise the feeling words: 서운하다, 당황스럽다, 안타깝다, 담담하다, 부끄럽다, 뿌듯하다, 섭섭하다, 후련하다.", my: "ခံစားချက်ပြ စကားလုံး ကျက်ထားပါ – 서운하다, 당황스럽다, 안타깝다, 담담하다, 부끄럽다, 뿌듯하다, 섭섭하다, 후련하다။" },
      { kind: "point", en: "24: The text is told in the first person, so note in time order what \"나\" (I) did.", my: "24 – ပထမပုဂ္ဂိုလ်ပြော စာဖြစ်လို့ \"나\" ဘာလုပ်ခဲ့လဲ အချိန်အစဉ်လိုက် မှတ်ထားပါ။" },
    ],
  },
  {
    id: "r-25-27", skill: "reading", range: "25 ~ 27", ko: "신문 기사 제목",
    sub: { en: "Choose the correct meaning of newspaper headlines", my: "သတင်းစာ ခေါင်းစဉ်များ၏ အဓိပ္ပာယ်မှန် ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "News headlines are short and use many Sino-Korean words (한자어).", my: "သတင်းခေါင်းစဉ်တွေက အတိုချုံး + 한자어 များပါတယ်။" },
      { kind: "example", en: "Common words:\n• 껑충 (a sudden rise)\n• 뚝 (a sudden fall)\n• 주춤 (a pause)\n• 훈풍 (a good atmosphere)\n• 먹구름 (cause for worry)\n• 발목 잡다 (hold back)\n• 날개 달다 (gain momentum)", my: "အသုံးများတဲ့ စကားလုံးတွေ –\n• 껑충 (ရုတ်တရက်တက်)\n• 뚝 (ရုတ်တရက်ကျ)\n• 주춤 (ရပ်တန့်)\n• 훈풍 (အခြေအနေကောင်း)\n• 먹구름 (စိုးရိမ်ဖွယ်)\n• 발목 잡다 (တားဆီး)\n• 날개 달다 (အရှိန်ရ)" },
      { kind: "point", en: "When a headline is split by a comma, the first part is often the cause or situation and the second part the result.", my: ", နဲ့ ခွဲထားရင် ရှေ့ပိုင်း = အကြောင်း/အခြေအနေ၊ နောက်ပိုင်း = ရလဒ် ဖြစ်တတ်ပါတယ်။" },
    ],
  },
  {
    id: "r-28-31", skill: "reading", range: "28 ~ 31", ko: "빈칸 채우기 - 중·고급",
    sub: { en: "Fill the blanks in intermediate and advanced passages", my: "အလယ်လတ်/အဆင့်မြင့် စာပိုဒ်များ၏ ကွက်လပ်ဖြည့်ခြင်း" },
    tips: [
      { kind: "point", en: "This is one of the hardest parts. Catch the topic of the passage from the first sentence.", my: "အခက်ဆုံး အပိုင်းတွေထဲက တစ်ခုပါ။ စာပိုဒ်ရဲ့ ခေါင်းစဉ် (topic) ကို ပထမစာကြောင်းကနေ ဖမ်းပါ။" },
      { kind: "context", en: "The sentence with the blank often restates the main point, so the sentence after the blank often holds a hint.", my: "ကွက်လပ်ပါတဲ့ စာကြောင်းက အဓိကအချက်ကို ပြန်ရှင်းထားတာ ဖြစ်လေ့ရှိလို့ ကွက်လပ်နောက်က စာကြောင်းမှာ အရိပ်အမြွက် ရှိတတ်ပါတယ်။" },
      { kind: "time", en: "If you cannot get it, do not stay long. Mark it and come back later.", my: "မရရင် ကြာကြာ မနေပါနဲ့။ အမှတ်အသားလုပ်ပြီး နောက်မှ ပြန်လာပါ။" },
    ],
  },
  {
    id: "r-32-34", skill: "reading", range: "32 ~ 34", ko: "내용과 같은 것 - 고급",
    sub: { en: "Choose the main idea / title or what matches the content of an advanced passage", my: "အဆင့်မြင့် စာပိုဒ်၏ အဓိက အကြောင်းအရာ/ခေါင်းစဉ် ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "note", en: "Note: in the real exam this part is usually choosing what matches the content, not the topic.", my: "(မှတ်ချက် – တကယ့်စာမေးပွဲမှာ ဒီအပိုင်းက 주제 မဟုတ်ဘဲ အကြောင်းအရာနဲ့ တူတာ ရွေးခြင်း ဖြစ်လေ့ရှိပါတယ်။)" },
      { kind: "point", en: "Science, history and economics passages appear. Read the choices first, find their keywords in the text and check them against it.", my: "သိပ္ပံ၊ သမိုင်း၊ စီးပွားရေး စာတွေ ထွက်ပါတယ်။ ရွေးချယ်စရာကို အရင်ဖတ်ပြီး keyword ကို စာထဲမှာ ရှာပြီး တိုက်စစ်ပါ။" },
      { kind: "trap", en: "The right answer often does not use the word from the text but rewrites it with a word of the same meaning.", my: "အဖြေမှန်က စာထဲက စကားလုံးကို ကိုယ်တိုင် မသုံးဘဲ အဓိပ္ပာယ်တူ စကားနဲ့ ပြန်ရေးထားလေ့ရှိပါတယ်။" },
    ],
  },
  {
    id: "r-35-38", skill: "reading", range: "35 ~ 38", ko: "주제 / 중심 내용",
    sub: { en: "Find the sentence that does not fit the flow of the passage / put sentences in order", my: "စာပိုဒ်၏ စီးဆင်းမှုနှင့် မဆိုင်သော စာကြောင်းရှာခြင်း / အစဉ်လိုက်စီခြင်း" },
    tips: [
      { kind: "note", en: "(In the real exam this part is choosing the topic of the text, 글의 주제 고르기.)", my: "(တကယ့်စာမေးပွဲမှာ ဒီအပိုင်းက 글의 주제 고르기 ဖြစ်ပါတယ်။)" },
      { kind: "point", en: "The main point is at the start or the end of the passage. Pay special attention to the sentence after 그러나, 하지만, 따라서, 그러므로, 결국.", my: "အဓိကအချက်က စာပိုဒ် အစ ဒါမှမဟုတ် အဆုံး မှာ ရှိတယ်။ 그러나, 하지만, 따라서, 그러므로, 결국 နောက်က စာကြောင်းကို အထူးဂရုစိုက်ပါ။" },
      { kind: "trap", en: "A choice that talks about just one detail is not the main point. Choose the one that covers the whole passage.", my: "ရွေးချယ်စရာထဲက အသေးစိတ်တစ်ခုတည်းကို ပြောတာ က အဓိကအချက် မဟုတ်ပါ။ စာပိုဒ်တစ်ခုလုံးကို ခြုံငုံတာကို ရွေးပါ။" },
    ],
  },
  {
    id: "r-39-41", skill: "reading", range: "39 ~ 41", ko: "문장 들어갈 위치",
    sub: { en: "Choose the correct place (ㄱ, ㄴ, ㄷ, ㄹ) for the given sentence", my: "ပေးထားသော စာကြောင်း ဝင်ရမည့် နေရာမှန် (ㄱ, ㄴ, ㄷ, ㄹ) ရွေးချယ်ခြင်း" },
    tips: [
      { kind: "point", en: "First look at the connector and pointing words (이러한, 그, 이 때문에, 또한, 반면) in the given sentence.", my: "ပေးထားတဲ့ စာကြောင်းထဲက ဆက်စပ်စကား နဲ့ ညွှန်းစကား (이러한, 그, 이 때문에, 또한, 반면) ကို အရင်ကြည့်ပါ။" },
      { kind: "example", en: "Example: with 이러한 문제 the sentence must go right after the place where a problem was described.", my: "ဥပမာ – 이러한 문제 ဆိုရင် ရှေ့မှာ ပြဿနာတစ်ခု ပြောထားတဲ့ နေရာနောက်မှာ ဝင်ရမယ်။" },
      { kind: "check", en: "Put it into every place (ㄱ)(ㄴ)(ㄷ)(ㄹ), read it, and choose the place where the text before and after flows smoothly.", my: "(ㄱ)(ㄴ)(ㄷ)(ㄹ) နေရာတိုင်းမှာ ထည့်ဖတ်ကြည့်ပြီး ရှေ့နောက် ချောမွေ့တဲ့ နေရာကို ရွေးပါ။" },
    ],
  },
  {
    id: "r-42-50", skill: "reading", range: "42 ~ 50", ko: "장문 독해 - 논설문 / 비평문 / 소설",
    sub: { en: "Read long essays, critiques and stories, then answer the questions (main idea, writer's attitude, blanks and so on)", my: "ဆောင်းပါးရှည်၊ ဝေဖန်စာ၊ ဝတ္ထုရှည်များ ဖတ်ပြီး မေးခွန်းများ ဖြေဆိုခြင်း (အဓိက စိတ်ကူး၊ စာရေးသူ၏ သဘောထား၊ ကွက်လပ်ဖြည့် စသည်)" },
    tips: [
      { kind: "point", en: "42-43 (story): the character's feeling + the content. Dialogue often holds hints.", my: "42~43 (소설) – ဇာတ်ကောင်ရဲ့ ခံစားချက် + အကြောင်းအရာ။ စကားပြောပိုင်းတွေမှာ အရိပ်အမြွက် များပါတယ်။" },
      { kind: "point", en: "44-45: a blank + the title of the essay.", my: "44~45 – ကွက်လပ် + ဆောင်းပါးရဲ့ ခေါင်းစဉ်။" },
      { kind: "example", en: "46-47: the writer's attitude (태도). Memorise 비판하고 있다, 우려하고 있다, 강조하고 있다, 기대하고 있다, 지지하고 있다.", my: "46~47 – စာရေးသူရဲ့ သဘောထား (태도) – 비판하고 있다, 우려하고 있다, 강조하고 있다, 기대하고 있다, 지지하고 있다 စတာတွေကို ကျက်ထားပါ။" },
      { kind: "point", en: "48-50 (essay): the purpose of writing (목적), the blank and the attitude. First decide whether the writer supports or opposes.", my: "48~50 (논설문) – စာရေးရတဲ့ ရည်ရွယ်ချက် (목적)၊ ကွက်လပ်၊ သဘောထား။ စာရေးသူ ထောက်ခံလား/ဆန့်ကျင်လား ကို အရင်ဆုံး ဆုံးဖြတ်ပါ။" },
    ],
  },
  {
    id: "w-51-52", skill: "writing", range: "51 ~ 52", ko: "빈칸 문장 완성", targetSeconds: 300,
    sub: { en: "Write the missing sentence in each blank (㉠, ㉡)", my: "ကွက်လပ် (㉠, ㉡) တစ်ခုချင်းမှာ ပျောက်နေတဲ့ဝါကျကို ရေးပါ" },
    steps: {
      en: ["Read the whole text and decide what the blank does: reason, request, condition or conclusion.", "Match the style of the text (-ㅂ/습니다 or -아/어요).", "Write one short, natural phrase with the right ending.", "Check spelling and spacing: they are marked."],
      my: ["စာတစ်ခုလုံးဖတ်ပြီး ကွက်လပ်က ဘာလုပ်ပေးသလဲ ဆုံးဖြတ်ပါ: အကြောင်းရင်း၊ တောင်းဆိုချက်၊ အခြေအနေ ဒါမှမဟုတ် နိဂုံး။", "စာရဲ့ စာပုံစံ (-ㅂ/습니다 ဒါမှမဟုတ် -아/어요) နဲ့ ကိုက်အောင် ရေးပါ။", "အဆုံးသတ်မှန်တဲ့ တိုတိုသဘာဝကျတဲ့ စကားစုတစ်ခု ရေးပါ။", "စာလုံးပေါင်းနဲ့ ခြားနားချက်ကို စစ်ပါ: အမှတ်ပေးခံရပါတယ်။"],
    },
    tips: [
      { kind: "context", en: "The sentence before and after the blank tell you the answer: a request ends with -(으)세요 / -아/어 주시기 바랍니다, a reason with -기 때문입니다.", my: "ကွက်လပ်ရဲ့ ရှေ့နောက်ဝါကျက အဖြေကို ပြောပြတယ်: တောင်းဆိုချက်က -(으)세요 / -아/어 주시기 바랍니다၊ အကြောင်းရင်းက -기 때문입니다 နဲ့ အဆုံးသတ်တယ်။" },
      { kind: "tense", en: "Keep the tense of the text: if the surrounding sentences are past, the answer is past too.", my: "စာရဲ့ ကာလကို ထိန်းပါ: ပတ်လည်ဝါကျတွေ အတိတ်ဆိုရင် အဖြေလည်း အတိတ်ပါ။" },
      { kind: "time", en: "Plan about 5 minutes for each question.", my: "မေးခွန်းတစ်ခုကို ၅ မိနစ်ခန့် စီစဉ်ပါ။" },
    ],
  },
  {
    id: "w-53", skill: "writing", range: "53", ko: "도표 설명 (200~300자)", targetSeconds: 720,
    sub: { en: "Describe a chart or graph in 200-300 characters", my: "ဇယား/ဂရပ်ကို စာလုံး ၂၀၀-၃၀၀ နဲ့ ဖော်ပြပါ" },
    steps: {
      en: ["Read the title, the units and the years or groups.", "Write one sentence about what the survey or graph is about.", "Describe the biggest change or number, then the second, with numbers.", "Add the reason or the overall trend if the question asks.", "Use the plain written style (-ㄴ/는다, -았/었다) and keep to the length."],
      my: ["ခေါင်းစဉ်၊ ယူနစ်၊ နှစ် သို့မဟုတ် အုပ်စုတွေကို ဖတ်ပါ။", "စစ်တမ်း/ဂရပ်က ဘာအကြောင်းလဲ ဝါကျတစ်ကြောင်း ရေးပါ။", "အကြီးဆုံးပြောင်းလဲမှု သို့မဟုတ် ကိန်းဂဏန်းကို အရင်၊ ပြီးရင် ဒုတိယအချက်ကို ကိန်းဂဏန်းနဲ့ ဖော်ပြပါ။", "မေးခွန်းက တောင်းရင် အကြောင်းရင်း သို့မဟုတ် အလုံးစုံလမ်းကြောင်းကို ထည့်ပါ။", "စာရေးပုံစံ (-ㄴ/는다, -았/었다) နဲ့ ရေးပြီး အရှည်ကို ထိန်းပါ။"],
    },
    tips: [
      { kind: "nuance", en: "Useful patterns: -(으)로 나타났다, 증가했다 / 감소했다, -에 비해, -(으)ㄴ 반면에, 이는 -기 때문으로 보인다.", my: "အသုံးဝင်တဲ့ပုံစံများ: -(으)로 나타났다, 증가했다 / 감소했다, -에 비해, -(으)ㄴ 반면에, 이는 -기 때문으로 보인다။" },
      { kind: "tense", en: "Past data takes the past (-았/었다); a forecast takes -(으)ㄹ 것으로 예상된다.", my: "အတိတ်ဒေတာက အတိတ် (-았/었다) ကိုသုံးတယ်၊ ခန့်မှန်းချက်က -(으)ㄹ 것으로 예상된다 ကို သုံးတယ်။" },
      { kind: "trap", en: "Do not give your own opinion and do not repeat the same sentence ending; both lose points.", my: "ကိုယ့်သဘောထားကို မထည့်ပါနဲ့၊ စာကြောင်းအဆုံးသတ်တူတွေ ထပ်မသုံးပါနဲ့: နှစ်ခုလုံး အမှတ်ဆုံးရှုံးတယ်။" },
      { kind: "time", en: "Plan about 12 minutes, and leave time to count the characters.", my: "၁၂ မိနစ်ခန့် စီစဉ်ပြီး စာလုံးရေ ရေတွက်ဖို့ အချိန်ချန်ပါ။" },
    ],
  },
  {
    id: "w-54", skill: "writing", range: "54", ko: "논술 (600~700자)", targetSeconds: 1500,
    sub: { en: "Write an essay of 600-700 characters on the given topic", my: "ပေးထားတဲ့ ခေါင်းစဉ်ပေါ် စာလုံး ၆၀၀-၇၀၀ နဲ့ စာစီစာကုံး ရေးပါ" },
    steps: {
      en: ["Read the topic and the guiding questions; the essay must answer all of them.", "Make a quick outline: introduction, body (2-3 points with reasons or examples), conclusion.", "Write in the plain written style and link ideas with connectors (먼저, 또한, 그러나, 따라서).", "Check the length (600-700 characters), spelling and spacing."],
      my: ["ခေါင်းစဉ်နဲ့ လမ်းညွှန်မေးခွန်းတွေကို ဖတ်ပါ။ စာစီစာကုံးက အားလုံးကို ဖြေရမယ်။", "အမြန်ဖွဲ့စည်းပုံ ရေးပါ: နိဒါန်း၊ အဓိကအပိုင်း (အကြောင်းရင်း/ဥပမာနဲ့ အချက် ၂-၃ ချက်)၊ နိဂုံး။", "စာရေးပုံစံနဲ့ ရေးပြီး ဆက်စပ်စကားလုံး (먼저, 또한, 그러나, 따라서) နဲ့ အကြောင်းအရာတွေကို ချိတ်ပါ။", "အရှည် (စာလုံး ၆၀၀-၇၀၀)၊ စာလုံးပေါင်းနဲ့ ခြားနားချက်ကို စစ်ပါ။"],
    },
    tips: [
      { kind: "context", en: "Use the guiding questions as your outline; answering each one in order gives you the structure.", my: "လမ်းညွှန်မေးခွန်းတွေကို ဖွဲ့စည်းပုံအဖြစ် သုံးပါ: တစ်ခုချင်း အစဉ်လိုက်ဖြေရင် ဖွဲ့စည်းပုံ ရပါပြီ။" },
      { kind: "nuance", en: "Show a clear opinion with -다고 생각한다 / -(으)ㄹ 필요가 있다, and support it with -기 때문이다 and an example.", my: "-다고 생각한다 / -(으)ㄹ 필요가 있다 နဲ့ ရှင်းလင်းတဲ့ သဘောထားကိုပြပြီး -기 때문이다 နဲ့ ဥပမာတစ်ခုနဲ့ ထောက်ခံပါ။" },
      { kind: "trap", en: "Do not write in the spoken style (-아/어요) and do not go over 700 characters.", my: "စကားပြောပုံစံ (-아/어요) နဲ့ မရေးပါနဲ့၊ စာလုံး ၇၀၀ လည်း မကျော်ပါစေနဲ့။" },
      { kind: "time", en: "Plan about 25 minutes: 5 to plan, 17 to write, 3 to check.", my: "၂၅ မိနစ်ခန့် စီစဉ်ပါ: ၅ မိနစ် စီစဉ်၊ ၁၇ မိနစ် ရေး၊ ၃ မိနစ် စစ်။" },
    ],
  },
  // ── Listening (듣기): the question format of each group and how to answer it ──
  {
    id: "l-1-2", skill: "listening", range: "1 ~ 2", ko: "그림 고르기",
    sub: { en: "Listen to the dialogue and choose the picture that matches the situation", my: "စကားပြောကို နားထောင်ပြီး အခြေအနေနဲ့ ကိုက်ညီတဲ့ ရုပ်ပုံ ရွေးခြင်း" },
    tips: [
      { kind: "key", en: "Catch only \"what are they doing now\" and \"where are they\".", my: "\"အခု ဘာလုပ်နေလဲ\" + \"ဘယ်နေရာလဲ\" ကိုသာ ဖမ်းပါ။" },
      { kind: "point", en: "Before the audio starts, look at the 4 pictures and note the differences in advance (shop / kitchen, sitting / carrying).", my: "အသံမလာခင် ရုပ်ပုံ ၄ ပုံကို ကြည့်ပြီး ကွာခြားချက် (ဆိုင်/မီးဖိုချောင်၊ ထိုင်နေ/သယ်နေ) ကို ကြိုမှတ်ပါ။" },
      { kind: "point", en: "The last line of the dialogue usually shows the current action.", my: "နောက်ဆုံးစကားကြောင်း က လက်ရှိ လုပ်ဆောင်ချက်ကို ပြလေ့ရှိတယ်။" },
      { kind: "example", en: "Example 1: 손님, 접시 위에 있는 거 먹어 봐도 돼요? → inside a shop, taking a snack from a plate → ①", my: "ဥပမာ ၁ – 손님, 접시 위에 있는 거 먹어 봐도 돼요? → ဆိုင်ထဲ၊ ပန်းကန်ပြားပေါ်က အမြည်းကို ယူနေ → ①" },
      { kind: "example", en: "Example 2: 의자에 앉아 보니까, 이 부분을 잘라야겠다 → the woman is sitting, the man points at the spot → ②", my: "ဥပမာ ၂ – 의자에 앉아 보니까, 이 부분을 잘라야겠다 → အမျိုးသမီး ထိုင်နေ၊ အမျိုးသား နေရာကို ညွှန်ပြနေ → ②" },
    ],
  },
  {
    id: "l-3", skill: "listening", range: "3", ko: "그래프 고르기",
    sub: { en: "Listen to the news or report and choose the correct graph or table", my: "သတင်း/အစီရင်ခံစာကို နားထောင်ပြီး မှန်ကန်တဲ့ ဂရပ်/ဇယား ရွေးခြင်း" },
    tips: [
      { kind: "key", en: "Tell the 2 kinds of graph apart as you listen: change in numbers / reasons in %.", my: "ဂရပ် အမျိုးအစား ၂ မျိုး (အရေအတွက် ပြောင်းလဲမှု / အကြောင်းရင်း %) ကို ခွဲပြီး နားထောင်ပါ။" },
      { kind: "point", en: "증가 / 감소 / 꾸준히 / 급격히 → the direction of a line graph", my: "증가/감소/꾸준히/급격히 → line graph ရဲ့ ဦးတည်ချက်" },
      { kind: "point", en: "가장 많았으며, 그 뒤를 이었습니다 → the order in a pie chart (1st → 2nd → 3rd)", my: "가장 많았으며, 그 뒤를 이었습니다 → pie chart ရဲ့ အစဉ် (1st → 2nd → 3rd)" },
      { kind: "example", en: "Example 3: 꾸준히 증가 → ② (① is wrong because it falls first and then rises). The reason 신선하고 품질이 좋아서 is the biggest → it matches the 43% in ③. So this question needs you to check the figures.", my: "ဥပမာ ၃ – 꾸준히 증가 → ② (①က ကျပြီးမှ တက်လို့ မှား)၊ 신선하고 품질이 좋아서က အများဆုံး → ③ ရဲ့ 43% နဲ့ ကိုက်။ ဒီတော့ ထုတ်ချက်ကို တိုက်စစ် ရတဲ့ မေးခွန်းပါ။" },
    ],
  },
  {
    id: "l-4-8", skill: "listening", range: "4 ~ 8", ko: "이어질 수 있는 말",
    sub: { en: "Choose the most suitable thing to say next at the end of the dialogue", my: "စကားပြောအဆုံးမှာ နောက်ဆက်ပြောမယ့် စကား အသင့်တော်ဆုံး ရွေးခြင်း" },
    tips: [
      { kind: "key", en: "The last line is a question or a problem. Choose the reply to it.", my: "နောက်ဆုံးစကားကြောင်း = မေးခွန်း/ပြဿနာ ပါ။ အဲဒါကို တုံ့ပြန်တာကို ရွေးပါ။" },
      { kind: "point", en: "If a problem is mentioned → advice (-지 그래요?, -는 게 어때요?)", my: "ပြဿနာ ပြောရင် → အကြံပေး (-지 그래요?, -는 게 어때요?)" },
      { kind: "point", en: "If options are mentioned → a decision (그럼 ~로 할게)", my: "ရွေးချယ်စရာ ပြောရင် → ဆုံးဖြတ်ချက် (그럼 ~로 할게)" },
      { kind: "example", en: "Example 4: 약을 먹었는데 잘 안 나아요 → ③ 병원에 한번 가 보지 그래요?", my: "ဥပမာ ၄ – 약을 먹었는데 잘 안 나아요 → ③ 병원에 한번 가 보지 그래요?" },
      { kind: "example", en: "Example 6: 음료수는 못 갖고 들어가나 봐 → ② 얼른 마시고 들어가자", my: "ဥပမာ ၆ – 음료수는 못 갖고 들어가나 봐 → ② 얼른 마시고 들어가자" },
      { kind: "trap", en: "A choice that reuses a word from the dialogue (④ 음료수부터 사자) is often a trick.", my: "စကားပြောထဲက စကားလုံးကို ထပ်သုံးထားတဲ့ ရွေးချယ်စရာ (④ 음료수부터 사자) က လှည့်ကွက် ဖြစ်တတ်တယ်။" },
    ],
  },
  {
    id: "l-9-12", skill: "listening", range: "9 ~ 12", ko: "이어서 할 행동",
    sub: { en: "Choose what the woman (usually) will do next after the dialogue", my: "စကားပြောပြီးနောက် (အများအားဖြင့် အမျိုးသမီး) ဆက်လုပ်မယ့် အပြုအမူ ရွေးခြင်း" },
    tips: [
      { kind: "key", en: "\"What they will do right away\", not a plan far in the future.", my: "\"ချက်ချင်း ဆက်လုပ်မယ့် အရာ\" – အနာဂတ် အဝေးက အစီအစဉ် မဟုတ်ပါ။" },
      { kind: "point", en: "Listen for sentences with -ㄹ게요, -ㄹ 테니까, 지금 바로, 먼저.", my: "-ㄹ게요, -ㄹ 테니까, 지금 바로, 먼저 ပါတဲ့ စာကြောင်းကို နားစွင့်ပါ။" },
      { kind: "check", en: "Read the question carefully to see whose action it is (the woman / the man).", my: "ဘယ်သူ့ အပြုအမူလဲ (여자/남자) ကို မေးခွန်းမှာ သေချာ ကြည့်ပါ။" },
      { kind: "example", en: "Example 9: 지금 바로 가지러 갈게 → ④ (여행을 간다 is only tomorrow)", my: "ဥပမာ ၉ – 지금 바로 가지러 갈게 → ④ (여행을 간다 က မနက်ဖြန်မှ)" },
      { kind: "example", en: "Example 10: 계산 먼저 해 드릴 테니까 → ② 계산을 해 준다 (the packing comes later)", my: "ဥပမာ ၁၀ – 계산 먼저 해 드릴 테니까 → ② 계산을 해 준다 (ထုပ်ပိုးတာက နောက်မှ)" },
    ],
  },
  {
    id: "l-13-16", skill: "listening", range: "13 ~ 16", ko: "들은 내용과 같은 것",
    sub: { en: "Choose what matches the dialogue, announcement or news", my: "စကားပြော/ကြေညာချက်/သတင်း အကြောင်းအရာနဲ့ တူညီတာ ရွေးခြင်း" },
    tips: [
      { kind: "key", en: "Read the 4 choices in advance and underline the keywords.", my: "ရွေးချယ်စရာ ၄ ခုကို ကြိုဖတ်ပြီး keyword မှာ မျဉ်းသား ထားပါ။" },
      { kind: "trap", en: "3 kinds of tricks: opposites (처음 ↔ 10주년), amounts (모든 사람 ↔ 5만 원 이상) and who (man ↔ woman).", my: "လှည့်ကွက် ၃ မျိုး – ဆန့်ကျင်ဘက် (처음 ↔ 10주년)၊ ပမာဏ (모든 사람 ↔ 5만 원 이상)၊ ဘယ်သူ (남자 ↔ 여자)" },
      { kind: "example", en: "Example 14: 영업시간도 한 시간 연장 → ② 영업시간이 늘어난다", my: "ဥပမာ ၁၄ – 영업시간도 한 시간 연장 → ② 영업시간이 늘어난다" },
      { kind: "example", en: "Example 13: 난 비 오는 날 캠핑은 안 해 봤는데 → ④ is wrong; the man says 분위기가 좋더라고 → ③ is correct", my: "ဥပမာ ၁၃ – 난 비 오는 날 캠핑은 안 해 봤는데 → ④ မှား၊ အမျိုးသား 분위기가 좋더라고 → ③ မှန်" },
    ],
  },
  {
    id: "l-17-20", skill: "listening", range: "17 ~ 20", ko: "남자의 중심 생각",
    sub: { en: "Choose the man's main thought", my: "အမျိုးသားရဲ့ အဓိက အတွေးအမြင် ရွေးခြင်း" },
    tips: [
      { kind: "key", en: "The answer is in the man's last words.", my: "အမျိုးသားရဲ့ နောက်ဆုံးစကား ထဲမှာ အဖြေ ရှိတယ်။" },
      { kind: "point", en: "Listen for endings that show an opinion: -아야/어야 ~, -는 게 좋다, -거든요, -잖아요.", my: "-아야/어야 ~, -는 게 좋다, -거든요, -잖아요 စတဲ့ အမြင်ပြ အဆုံးသတ် တွေကို နားထောင်ပါ။" },
      { kind: "example", en: "Example 17: 팝콘이 있어야 영화관에 온 것 같지 → ③", my: "ဥပမာ ၁၇ – 팝콘이 있어야 영화관에 온 것 같지 → ③" },
      { kind: "example", en: "Example 18: 시간이 지나면 오해가 더 커질 수도 → ① 사과를 빨리하는 것이 좋다", my: "ဥပမာ ၁၈ – 시간이 지나면 오해가 더 커질 수도 → ① 사과를 빨리하는 것이 좋다" },
      { kind: "trap", en: "The trap is often the woman's opinion (④ 말을 거는 것이 힘들다), set so that you choose it by mistake.", my: "အမျိုးသမီးရဲ့ အမြင် (④ 말을 거는 것이 힘들다) ကို ရွေးမိအောင် ထောင်ချောက်ထားတတ်တယ်။" },
    ],
  },
  {
    id: "l-21-22", skill: "listening", range: "21 ~ 22", ko: "중심 생각 + 내용 일치",
    sub: { en: "Office / work dialogue: the man's main opinion + what matches the content", my: "ရုံးခန်း/လုပ်ငန်း စကားပြော – အမျိုးသားရဲ့ အဓိကအမြင် + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "First sort out who supports and who objects.", my: "ဘယ်သူ ထောက်ခံ/ကန့်ကွက် လဲ အရင်ခွဲပါ။" },
      { kind: "example", en: "Example 21: the man says 신중해야 and 부담이 클 것 같아요 → he does not want the change → ④ 현재 디자인을 유지하고 싶다", my: "ဥပမာ ၂၁ – အမျိုးသား 신중해야, 부담이 클 것 같아요 → ပြောင်းလဲမှုကို မလိုလား → ④ 현재 디자인을 유지하고 싶다" },
      { kind: "example", en: "Example 22: 캐릭터가 너무 사실적이라서 → ②. 아직 출시도 좀 남았는데 → ① is wrong", my: "ဥပမာ ၂၂ – 캐릭터가 너무 사실적이라서 → ② ။ 아직 출시도 좀 남았는데 → ① မှား" },
    ],
  },
  {
    id: "l-23-24", skill: "listening", range: "23 ~ 24", ko: "무엇을 하고 있는지 + 내용 일치",
    sub: { en: "What is the man doing (asking / requesting / explaining) + what matches the content", my: "အမျိုးသား ဘာလုပ်နေလဲ (မေးမြန်း/တောင်းဆို/ရှင်းပြ) + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "Catch the verb for what the man is doing on the phone.", my: "အမျိုးသား ဖုန်းဆက်ပြီး ဘာလုပ်နေလဲ ဆိုတဲ့ ကြိယာ ကို ဖမ်းပါ။" },
      { kind: "example", en: "문의하다 (enquire), 신청하다 (apply), 확인하다 (check), 요청하다 (request), 항의하다 (complain)", my: "문의하다 (စုံစမ်း), 신청하다 (လျှောက်), 확인하다 (စစ်ဆေး), 요청하다 (တောင်းဆို), 항의하다 (ကန့်ကွက်)" },
      { kind: "point", en: "In the first 2 sentences (~ 때문에 전화드렸는데요) the purpose often appears.", my: "ပထမ စကားကြောင်း ၂ ကြောင်း (~ 때문에 전화드렸는데요) မှာ ရည်ရွယ်ချက် ပေါ်လေ့ရှိတယ်။" },
    ],
  },
  {
    id: "l-25-26", skill: "listening", range: "25 ~ 26", ko: "인터뷰 - 중심 생각 + 내용 일치",
    sub: { en: "Interview: the main opinion + what matches the content", my: "အင်တာဗျူး – အဓိကအမြင် + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "What comes after 무엇보다, 가장 중요한 것은 and 덕분이라고 생각합니다 is the answer.", my: "무엇보다, 가장 중요한 것은, 덕분이라고 생각합니다 နောက်က စကားက အဖြေပါ။" },
      { kind: "example", en: "Example 25: 무엇보다 현장 대응력을 높이기 위한 훈련 덕분 + 모의 상황…반복해서 → ① 실제 상황을 가정한 반복 훈련", my: "ဥပမာ ၂၅ – 무엇보다 현장 대응력을 높이기 위한 훈련 덕분 + 모의 상황…반복해서 → ① 실제 상황을 가정한 반복 훈련" },
      { kind: "example", en: "Example 26: 번화한 곳이라서 사건, 사고가 많지요 → ①", my: "ဥပမာ ၂၆ – 번화한 곳이라서 사건, 사고가 많지요 → ①" },
    ],
  },
  {
    id: "l-27-28", skill: "listening", range: "27 ~ 28", ko: "말하는 의도 + 내용 일치",
    sub: { en: "The speaker's intention (의도) + what matches the content", my: "ပြောသူရဲ့ ရည်ရွယ်ချက် (의도) + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "\"Why is this said?\": choose the verb of intention.", my: "\"ဘာကြောင့် ဒီစကား ပြောတာလဲ\" – ရည်ရွယ်ချက် ကြိယာကို ရွေးပါ။" },
      { kind: "example", en: "The -려고 form: 알려 주려고 (to inform), 권유하려고 (to urge), 불만을 제기하려고 (to complain), 설득하려고 (to persuade)", my: "-려고 ပုံစံ – 알려 주려고 (အသိပေး), 권유하려고 (တိုက်တွန်း), 불만을 제기하려고 (မကျေနပ်ချက်), 설득하려고 (ဆွဲဆောင်)" },
      { kind: "check", en: "Notice whose purpose it is, the woman's or the man's.", my: "အမျိုးသမီး/အမျိုးသား ဘယ်သူ့ ရည်ရွယ်ချက်လဲ သတိထားပါ။" },
    ],
  },
  {
    id: "l-29-30", skill: "listening", range: "29 ~ 30", ko: "누구인지 + 내용 일치",
    sub: { en: "Interview: who is the man (his job) + what matches the content", my: "အင်တာဗျူး – အမျိုးသားက ဘယ်သူလဲ (အလုပ်အကိုင်) + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "Catch the verbs that show the work (연구, 개발, 설치, 관리, 홍보).", my: "အလုပ်ကို ပြတဲ့ ကြိယာ ကို ဖမ်းပါ (연구, 개발, 설치, 관리, 홍보)။" },
      { kind: "example", en: "Example 29: 20년 동안 제주 바다, 논문을 발표, 어종 분포에 대해 조사 → ① 해양 생태계를 연구하는 사람", my: "ဥပမာ ၂၉ – 20년 동안 제주 바다, 논문을 발표, 어종 분포에 대해 조사 → ① 해양 생태계를 연구하는 사람" },
      { kind: "example", en: "Example 30: 다른 국가와 공동으로 팀을 꾸려서 → ②. Since it says 20년 동안, ③ 작년부터 시작 is wrong", my: "ဥပမာ ၃၀ – 다른 국가와 공동으로 팀을 꾸려서 → ② ။ 20년 동안 ဆိုလို့ ③ 작년부터 시작 မှား" },
    ],
  },
  {
    id: "l-31-32", skill: "listening", range: "31 ~ 32", ko: "토론 - 중심 생각 + 태도",
    sub: { en: "Debate: the man's main opinion + his attitude (태도)", my: "ဆွေးနွေးငြင်းခုံ – အမျိုးသားရဲ့ အဓိကအမြင် + သဘောထား (태도)" },
    tips: [
      { kind: "key", en: "First decide which side the man is on.", my: "အမျိုးသားက ဘက်ဘယ်ဘက် လဲ ပထမဆုံး ဆုံးဖြတ်ပါ။" },
      { kind: "point", en: "What comes after 하지만, 그런데요, 오히려 is his real opinion.", my: "하지만, 그런데요, 오히려 နောက်က စကားက သူ့ အမြင်အစစ်" },
      { kind: "example", en: "Attitude (태도): 반박하고 있다 (rebutting), 동의하고 있다 (agreeing), 우려하고 있다 (worried), 근거를 들어 주장하고 있다 (arguing with evidence)", my: "태도 – 반박하고 있다 (ချေပ), 동의하고 있다, 우려하고 있다, 근거를 들어 주장하고 있다" },
    ],
  },
  {
    id: "l-33-34", skill: "listening", range: "33 ~ 34", ko: "강연 - 무엇에 대한 내용 + 내용 일치",
    sub: { en: "Lecture: what is it about (the topic) + what matches the content", my: "ဟောပြောချက် – ဘာအကြောင်းလဲ (ခေါင်းစဉ်) + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "The topic is in the first 2-3 sentences. Listen especially for 이걸 ~라고 하죠 (naming something).", my: "ပထမ ၂ ~ ၃ ကြောင်း မှာ ခေါင်းစဉ် ရှိတယ်။ 이걸 ~라고 하죠 (အမည်ပေး) ကို အထူးနားထောင်ပါ။" },
      { kind: "example", en: "Example 33: 뇌의 신경망이 피부를 압박하는 자극을 위험한 신호로… → ③ 불편한 피부 자극에 대한 신경학적 설명\n④ 치료법 was never said: drop a choice that holds a point you did not hear.", my: "ဥပမာ ၃၃ – 뇌의 신경망이 피부를 압박하는 자극을 위험한 신호로… → ③ 불편한 피부 자극에 대한 신경학적 설명\n④ 치료법 က ပြောမှ မပြောခဲ့တာ – မကြားခဲ့တဲ့ အချက် ပါရင် ဖယ်ပါ။" },
      { kind: "example", en: "Example 34: 뇌의 신경망 → ① 뇌와 관련이 있다", my: "ဥပမာ ၃၄ – 뇌의 신경망 → ① 뇌와 관련이 있다" },
    ],
  },
  {
    id: "l-35-36", skill: "listening", range: "35 ~ 36", ko: "연설 - 무엇을 하고 있는지 + 내용 일치",
    sub: { en: "Speech / opening address: what is the speaker doing + what matches the content", my: "မိန့်ခွန်း/နှုတ်ခွန်းဆက်စကား – ပြောသူ ဘာလုပ်နေလဲ + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "The type of event + what the speaker is doing.", my: "ပွဲအမျိုးအစား + ပြောသူ လုပ်ဆောင်ချက်" },
      { kind: "example", en: "감사드립니다 → 감사를 표하다 / 축하합니다 → 축하하다 / 소개합니다 → 소개하다 / 부탁드립니다 → 당부하다", my: "감사드립니다 → 감사를 표하다 / 축하합니다 → 축하하다 / 소개합니다 → 소개하다 / 부탁드립니다 → 당부하다" },
      { kind: "point", en: "The purpose shows at the beginning and at the end of the speech.", my: "စကားပြောရဲ့ အစ နဲ့ အဆုံး မှာ ရည်ရွယ်ချက် ပေါ်တယ်။" },
    ],
  },
  {
    id: "l-37-38", skill: "listening", range: "37 ~ 38", ko: "교양 프로그램 - 중심 생각 + 내용 일치",
    sub: { en: "Educational programme: the expert's main opinion + what matches the content", my: "ပညာပေး အစီအစဉ် – ကျွမ်းကျင်သူရဲ့ အဓိကအမြင် + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "In the pattern \"예전에는 ~ 하지만 최근에는 ~\", what follows 하지만 is the real opinion.", my: "예전에는 ~ 하지만 최근에는 ~ ပုံစံ – 하지만 နောက်က က အမြင်အစစ်" },
      { kind: "example", en: "Example 37: 찾는 사람들의 생활을 분석하여 반영 → ③ 찾아오는 사람의 상황을 고려해 조성해야", my: "ဥပမာ ၃၇ – 찾는 사람들의 생활을 분석하여 반영 → ③ 찾아오는 사람의 상황을 고려해 조성해야" },
      { kind: "example", en: "Example 38: 인주시는 이 공원을 조성하면서 → ②. Since it says 빽빽하게 나무를 심어, ① is wrong", my: "ဥပမာ ၃၈ – 인주시는 이 공원을 조성하면서 → ② ။ 빽빽하게 나무를 심어 ဆိုလို့ ① မှား" },
    ],
  },
  {
    id: "l-39-40", skill: "listening", range: "39 ~ 40", ko: "대담 - 앞의 내용 + 내용 일치",
    sub: { en: "Talk show: guess what was said before the dialogue + what matches the content", my: "ဆွေးနွေးပွဲ – စကားပြောမတိုင်ခင်က ပြောခဲ့တဲ့ အကြောင်းအရာ ခန့်မှန်းခြင်း + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "The very first sentence summarises what was said earlier.", my: "ပထမဆုံး စကားကြောင်း က အရင်ကပြောခဲ့တာကို အကျဉ်းချုပ်တယ်။" },
      { kind: "point", en: "Remember the first sentence well: it holds expressions such as 말씀하신 것처럼, 그렇게 ~ 다면, 이런 ~.", my: "말씀하신 것처럼, 그렇게 ~ 다면, 이런 ~ စတာတွေ ပါတဲ့ ပထမစာကြောင်းကို သေချာ မှတ်ပါ။" },
      { kind: "trap", en: "If you miss the first 3 seconds, you lose question 39. Keep your full attention.", my: "ပထမ ၃ စက္ကန့် လွတ်သွားရင် မေးခွန်း ၃၉ လွတ်သွားပြီ – အာရုံ အပြည့်ထားပါ။" },
    ],
  },
  {
    id: "l-41-42", skill: "listening", range: "41 ~ 42", ko: "강연 - 중심 내용 + 내용 일치",
    sub: { en: "Lecture (history / culture): the main content + what matches the content", my: "ဟောပြောချက် (သမိုင်း/ယဉ်ကျေးမှု) – အဓိကအကြောင်းအရာ + အကြောင်းအရာတူတာ" },
    tips: [
      { kind: "key", en: "The last sentence is the overall summary. Listen to what follows 이렇게 ~, 즉 and 결국.", my: "နောက်ဆုံးစကားကြောင်း က ခြုံငုံသုံးသပ်ချက်။ 이렇게 ~, 즉, 결국 နောက်က စကားကို နားထောင်ပါ။" },
      { kind: "example", en: "Example 41: 이렇게 돈덕전은 근대 국가로서의 위상을…드러내고자 한 곳 → ③", my: "ဥပမာ ၄၁ – 이렇게 돈덕전은 근대 국가로서의 위상을…드러내고자 한 곳 → ③" },
      { kind: "example", en: "Example 42: 연회를 베푸는 장소 → ②. 40주년 is not a year but an anniversary of the accession → ① is wrong (a number trick)", my: "ဥပမာ ၄၂ – 연회를 베푸는 장소 → ② ။ 40주년 က ခုနှစ် မဟုတ်ဘဲ နန်းတက် နှစ်ပတ်လည် → ① မှား (ကိန်းဂဏန်း လှည့်ကွက်)" },
    ],
  },
  {
    id: "l-43-44", skill: "listening", range: "43 ~ 44", ko: "다큐멘터리 - 중심 내용 + 이유",
    sub: { en: "Documentary: the main content + choose the reason (이유)", my: "မှတ်တမ်းရုပ်ရှင် – အဓိကအကြောင်းအရာ + အကြောင်းရင်း (이유) ရွေးခြင်း" },
    tips: [
      { kind: "key", en: "When the speaker asks \"왜 ~ㄹ까요?\" himself, what follows is the answer (the reason).", my: "왜 ~ㄹ까요? ဆိုတဲ့ မေးခွန်းကို ပြောသူကိုယ်တိုင် မေး ရင် နောက်ကစကားက 이유 အဖြေ။" },
      { kind: "point", en: "Listen for ~기 때문이다, ~ 덕분에, ~(으)므로.", my: "~기 때문이다, ~ 덕분에, ~(으)므로 ကို နားစွင့်ပါ။" },
      { kind: "note", en: "Animals and nature come up often, so memorise biology words.", my: "တိရစ္ဆာန်/သဘာဝ အကြောင်းများလို့ ဇီဝဆိုင်ရာ ဝေါဟာရ ကျက်ထားပါ။" },
    ],
  },
  {
    id: "l-45-46", skill: "listening", range: "45 ~ 46", ko: "강연 - 내용 일치 + 말하는 방식",
    sub: { en: "Lecture (science / technology): what matches the content + the way of speaking (말하는 방식)", my: "ဟောပြောချက် (သိပ္ပံ/နည်းပညာ) – အကြောင်းအရာတူတာ + ပြောပုံ (말하는 방식)" },
    tips: [
      { kind: "key", en: "Catch the words that show the structure:", my: "ဖွဲ့စည်းပုံ စကားလုံး ကို ဖမ်းပါ –" },
      { kind: "point", en: "첫째, 둘째 → 나열하다 (listing)\n예를 들어 → 사례를 들다 (giving examples)\n~에 비해 → 비교하다 (comparing)\n~라고 합니다 (defining) → 정의하다 / 규정하다", my: "첫째, 둘째 → 나열하다 (စီပြ)\n예를 들어 → 사례를 들다\n~에 비해 → 비교하다\n~라고 합니다 (အဓိပ္ပာယ်ဖွင့်) → 정의하다/규정하다" },
      { kind: "example", en: "Example 45: 내부 압력이 올라가고 → ④. 중앙 부분은 두껍고 → ① is wrong; 익는 속도가 빨라집니다 → ③ is wrong", my: "ဥပမာ ၄၅ – 내부 압력이 올라가고 → ④ ။ 중앙 부분은 두껍고 → ① မှား၊ 익는 속도가 빨라집니다 → ③ မှား" },
      { kind: "example", en: "Example 46: 첫째…둘째… + 왜 그럴까요? → ③ 이유를 나열하며 원리를 알려 주고 있다", my: "ဥပမာ ၄၆ – 첫째…둘째… + 왜 그럴까요? → ③ 이유를 나열하며 원리를 알려 주고 있다" },
    ],
  },
  {
    id: "l-47-48", skill: "listening", range: "47 ~ 48", ko: "대담 - 내용 일치 + 태도",
    sub: { en: "Talk show (policy / society): what matches the content + the man's attitude", my: "ဆွေးနွေးပွဲ (မူဝါဒ/လူမှုရေး) – အကြောင်းအရာတူတာ + အမျိုးသားရဲ့ သဘောထား" },
    tips: [
      { kind: "key", en: "Listen to the feeling of the verb ending.", my: "ကြိယာ အဆုံးသတ်ရဲ့ ခံစားချက် ကို နားထောင်ပါ။" },
      { kind: "example", en: "-ㄹ까 걱정입니다 → 우려 (worry)\n-아야 할 것입니다 → 촉구/강조 (urging / stressing)\n-다는 점에서 의미가 있습니다 → 긍정적 평가 (positive evaluation)\n과연 ~ㄹ지 의문입니다 → 회의적 (sceptical)", my: "-ㄹ까 걱정입니다 → 우려\n-아야 할 것입니다 → 촉구/강조\n-다는 점에서 의미가 있습니다 → 긍정적 평가\n과연 ~ㄹ지 의문입니다 → 회의적" },
    ],
  },
  {
    id: "l-49-50", skill: "listening", range: "49 ~ 50", ko: "강연 - 말하는 방식",
    sub: { en: "Academic lecture: what matches the content + the way of speaking / attitude", my: "ပညာရပ်ဆိုင်ရာ ဟောပြောချက် – အကြောင်းအရာတူတာ + ပြောပုံ/သဘောထား" },
    tips: [
      { kind: "key", en: "As in 45-46, look at the pattern of the talk.", my: "၄၅~၄၆ နဲ့ နည်းတူ – စကားပြောရဲ့ ပုံစံ ကို ကြည့်ပါ။" },
      { kind: "example", en: "Example 49: 24시간 내내 태양을 볼 수 있는 궤도 → ④\n• 태양 전지를 부착 → ① is wrong\n• 전력 소비가 굉장해 → ③ is wrong\n• 얼마 전…발사됐는데요 → ② is wrong", my: "ဥပမာ ၄၉ – 24시간 내내 태양을 볼 수 있는 궤도 → ④\n• 태양 전지를 부착 → ① မှား\n• 전력 소비가 굉장해 → ③ မှား\n• 얼마 전…발사됐는데요 → ② မှား" },
      { kind: "example", en: "Example 50: 왜 ~ 계산했을까요? 이는 ~ 때문이었습니다 → ① 발사 시각이 정해진 배경을 과학적으로 설명", my: "ဥပမာ ၅၀ – 왜 ~ 계산했을까요? 이는 ~ 때문이었습니다 → ① 발사 시각이 정해진 배경을 과학적으로 설명" },
    ],
  },
];
