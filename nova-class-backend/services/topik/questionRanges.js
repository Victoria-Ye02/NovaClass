// The three exam domains and the question ranges of each (Smart Drill: the student picks a domain and, if wanted, a range such
// as "읽기 13~15 문장 순서 배열", and the generator writes new questions in that pattern). The ranges are the question groups of the
// TOPIK Booster (frontend boosterData.js); test/questionRanges.test.js keeps the two lists in step.
const DOMAINS = {
  reading: {
    key: "reading", ko: "읽기", label: "Reading",
    // what the model must write for this domain
    rule: 'Reading (읽기): give a Korean reading text in "passage" (an advertisement, notice, article, short story or essay as the range requires) and ask the question about it. The question must really depend on the passage.',
    ranges: [
    {"key": "r-1-2", "range": "1~2", "ko": "문법 - 빈칸 채우기"},
    {"key": "r-3-4", "range": "3~4", "ko": "유사 문법"},
    {"key": "r-5-8", "range": "5~8", "ko": "안내문 / 광고 / 안내판"},
    {"key": "r-9-10", "range": "9~10", "ko": "표 / 그래프 / 안내문 내용 확인"},
    {"key": "r-11-12", "range": "11~12", "ko": "글의 내용과 같은 것"},
    {"key": "r-13-15", "range": "13~15", "ko": "문장 순서 배열"},
    {"key": "r-16-18", "range": "16~18", "ko": "빈칸에 들어갈 내용"},
    {"key": "r-19-20", "range": "19~20", "ko": "빈칸 + 중심 생각 & 기분/태도"},
    {"key": "r-21-22", "range": "21~22", "ko": "관용구/속담 & 중심 내용"},
    {"key": "r-23-24", "range": "23~24", "ko": "수필/소설 - 심정 & 내용"},
    {"key": "r-25-27", "range": "25~27", "ko": "신문 기사 제목"},
    {"key": "r-28-31", "range": "28~31", "ko": "빈칸 채우기 - 중·고급"},
    {"key": "r-32-34", "range": "32~34", "ko": "내용과 같은 것 - 고급"},
    {"key": "r-35-38", "range": "35~38", "ko": "주제 / 중심 내용"},
    {"key": "r-39-41", "range": "39~41", "ko": "문장 들어갈 위치"},
    {"key": "r-42-50", "range": "42~50", "ko": "장문 독해 - 논설문 / 비평문 / 소설"}
  ],
  },
  listening: {
    key: "listening", ko: "듣기", label: "Listening",
    rule: 'Listening (듣기): give a short audio SCRIPT in "passage" (a natural spoken dialogue between a man and a woman, or an announcement, interview or lecture as the range requires; write who speaks like "남자: ..." / "여자: ..."). The question asks what was heard (main idea, matching content, next line or next action). Do not rely on pictures or graphs that cannot be shown.',
    ranges: [
    {"key": "l-1-2", "range": "1~2", "ko": "그림 고르기"},
    {"key": "l-3", "range": "3", "ko": "그래프 고르기"},
    {"key": "l-4-8", "range": "4~8", "ko": "이어질 수 있는 말"},
    {"key": "l-9-12", "range": "9~12", "ko": "이어서 할 행동"},
    {"key": "l-13-16", "range": "13~16", "ko": "들은 내용과 같은 것"},
    {"key": "l-17-20", "range": "17~20", "ko": "남자의 중심 생각"},
    {"key": "l-21-22", "range": "21~22", "ko": "중심 생각 + 내용 일치"},
    {"key": "l-23-24", "range": "23~24", "ko": "무엇을 하고 있는지 + 내용 일치"},
    {"key": "l-25-26", "range": "25~26", "ko": "인터뷰 - 중심 생각 + 내용 일치"},
    {"key": "l-27-28", "range": "27~28", "ko": "말하는 의도 + 내용 일치"},
    {"key": "l-29-30", "range": "29~30", "ko": "누구인지 + 내용 일치"},
    {"key": "l-31-32", "range": "31~32", "ko": "토론 - 중심 생각 + 태도"},
    {"key": "l-33-34", "range": "33~34", "ko": "강연 - 무엇에 대한 내용 + 내용 일치"},
    {"key": "l-35-36", "range": "35~36", "ko": "연설 - 무엇을 하고 있는지 + 내용 일치"},
    {"key": "l-37-38", "range": "37~38", "ko": "교양 프로그램 - 중심 생각 + 내용 일치"},
    {"key": "l-39-40", "range": "39~40", "ko": "대담 - 앞의 내용 + 내용 일치"},
    {"key": "l-41-42", "range": "41~42", "ko": "강연 - 중심 내용 + 내용 일치"},
    {"key": "l-43-44", "range": "43~44", "ko": "다큐멘터리 - 중심 내용 + 이유"},
    {"key": "l-45-46", "range": "45~46", "ko": "강연 - 내용 일치 + 말하는 방식"},
    {"key": "l-47-48", "range": "47~48", "ko": "대담 - 내용 일치 + 태도"},
    {"key": "l-49-50", "range": "49~50", "ko": "강연 - 말하는 방식"}
  ],
  },
  writing: {
    key: "writing", ko: "쓰기", label: "Writing",
    rule: 'Writing (쓰기): the practice is sentence completion and short-essay logic in multiple-choice form. Put the short context (a notice, an e-mail, a chart described in words or an essay topic with its first sentences) in "passage", and ask which sentence or expression best completes it (correct ending, connector, register and logic).',
    ranges: [
    {"key": "w-51-52", "range": "51~52", "ko": "빈칸 문장 완성"},
    {"key": "w-53", "range": "53", "ko": "도표 설명 (200~300자)"},
    {"key": "w-54", "range": "54", "ko": "논술 (600~700자)"}
  ],
  },
};

// Reading is also offered by level band (the broad parts of the 50 questions); `focus` tells the model what that band is about.
DOMAINS.reading.bands = [
  { key: "b-1-10", range: "1~10", ko: "기본 — basic grammar, similar meanings and short notices", focus: "basic grammar, similar meanings and short notices" },
  { key: "b-11-25", range: "11~25", ko: "중급 — matching information, main ideas and short essay / article context", focus: "matching information, main ideas and short essay or article context" },
  { key: "b-26-38", range: "26~38", ko: "중고급 — ordering sentences, advanced context and specific viewpoints", focus: "ordering sentences, advanced context and specific viewpoints" },
  { key: "b-39-50", range: "39~50", ko: "고급 — long academic / news / literary texts", focus: "long academic, news or literary texts with a complex logical structure" },
];

const domainByKey = key => DOMAINS[key] || null;
// a range belongs to its domain: "13~15" is only valid for reading; a band ("11~25") is a broader choice of the same section
const rangeByKey = (domainKey, rangeKey) => {
  const domain = DOMAINS[domainKey];
  return domain?.ranges.find(r => r.key === rangeKey) || domain?.bands?.find(b => b.key === rangeKey) || null;
};

const numericBounds = range => {
  const [first, last = first] = String(range || "").split("~").map(Number);
  return Number.isInteger(first) && Number.isInteger(last) ? { first, last } : null;
};

const questionBounds = domainKey => {
  const domain = domainByKey(domainKey);
  const all = domain?.ranges.map(r => numericBounds(r.range)).filter(Boolean) || [];
  if (!all.length) return null;
  return { first: Math.min(...all.map(r => r.first)), last: Math.max(...all.map(r => r.last)) };
};

// A student may choose a broad span such as 읽기 1~30. Return every official
// TOPIK question pattern that overlaps it, so the generator can make a varied
// but still faithful practice set instead of pretending it is just one type.
const rangesForQuestionSpan = (domainKey, startQuestion, endQuestion) => {
  const domain = domainByKey(domainKey);
  const bounds = questionBounds(domainKey);
  const start = Number(startQuestion);
  const end = Number(endQuestion);
  if (!domain || !bounds || !Number.isInteger(start) || !Number.isInteger(end) || start > end || start < bounds.first || end > bounds.last) return null;
  return domain.ranges.filter(range => {
    const numbers = numericBounds(range.range);
    return numbers.first <= end && numbers.last >= start;
  });
};

// The official pattern of one question number, e.g. 읽기 14 -> 13~15 문장 순서 배열 (null for a number no pattern covers).
const rangeForQuestionNumber = (domainKey, number) => {
  const n = Number(number);
  return DOMAINS[domainKey]?.ranges.find(r => { const b = numericBounds(r.range); return b && b.first <= n && n <= b.last; }) || null;
};

// What the screen needs: names only.
const pick = ({ key, range, ko }) => ({ key, range, ko });
const publicDomains = () => Object.values(DOMAINS).map(({ key, ko, label, ranges, bands = [] }) => {
  const bounds = questionBounds(key);
  return { key, ko, label, ranges: ranges.map(pick), bands: bands.map(pick), minQuestion: bounds.first, maxQuestion: bounds.last };
});

module.exports = { DOMAINS, domainByKey, rangeByKey, rangesForQuestionSpan, rangeForQuestionNumber, questionBounds, publicDomains };
