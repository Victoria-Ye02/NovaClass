import { useState, useEffect, useCallback } from "react";
import API from "../../services/api";
import { useLang } from "../../LanguageContext";

// The TOPIK practice settings and study help that the K_MATE sidebar shows and the quiz uses: which question type and
// difficulty to practise, the explanation language, the strategy guide for the chosen type, the student's weak points
// and the explanation of the one that is open. They live here (in the K_MATE page) so the sidebar and the quiz
// share one set of choices.
export const LANG_CODE = { English: "en", Korean: "ko", Burmese: "my", Vietnamese: "vi" };
const FROM_SETTINGS = { en: "English", ko: "Korean", my: "Burmese", vi: "Vietnamese" };      // the app language -> the explanation language

// What to ask the question generator to practise: a quiz point as it is; an exam point (a question type of one section,
// e.g. "reading · grammar fill in") as a TOPIK II question of that kind.
export const practiceFocus = w => (w.source === "exam" ? `TOPIK II ${w.skillArea} question type: ${w.weakness}` : w.weakness);

// The three exam sections are always offered, even when the options could not be loaded (then without question ranges).
const FALLBACK_DOMAINS = [
  { key: "reading", ko: "읽기", label: "Reading", ranges: [], minQuestion: 1, maxQuestion: 50 },
  { key: "listening", ko: "듣기", label: "Listening", ranges: [], minQuestion: 1, maxQuestion: 50 },
  { key: "writing", ko: "쓰기", label: "Writing", ranges: [], minQuestion: 51, maxQuestion: 54 },
];

const QUESTION_LIMITS = { reading: [1, 50], listening: [1, 50], writing: [51, 54] };

export function useTopikPractice({ initial } = {}) {
  const [options, setOptions] = useState(null);        // { types[], difficulties[] } from the server
  const [weak, setWeak] = useState(null);              // { attempts, averageScore, weaknesses[] }
  const [typeKey, setTypeKey] = useState("");          // "" = any question type
  const [level, setLevel] = useState("");              // "" = any difficulty
  const [domain, setDomainState] = useState(initial?.domain || "");        // "" = any exam section: reading | listening | writing
  const [range, setRange] = useState("");              // "" = any question range of the section
  const [startQuestion, setStartQuestionState] = useState(initial?.start || "");
  const [endQuestion, setEndQuestionState] = useState(initial?.end || "");
  const { lang: appLang } = useLang();
  const [lang, setLang] = useState(FROM_SETTINGS[appLang] || "English");   // the language of explanations and guides: starts as the Settings language
  const [openWeak, setOpenWeak] = useState("");        // "source|point" of the weak point whose explanation is open
  const [guideResult, setGuideResult] = useState({ key: "", data: null, error: false });
  const [explainResult, setExplainResult] = useState({ key: "", data: null, error: false });

  const loadOptions = useCallback(() => API.get("/kmate/quiz/options").then(r => setOptions(r.data)).catch(() => {}), []);
  const refreshWeak = useCallback(async () => {
    try { setWeak((await API.get("/kmate/quiz/weaknesses")).data); } catch { /* the list just stays as it was */ }
  }, []);

  useEffect(() => {
    let alive = true;
    API.get("/kmate/quiz/weaknesses").then(r => { if (alive) setWeak(r.data); }).catch(() => {});
    API.get("/kmate/quiz/options").then(r => { if (alive) setOptions(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // The strategy guide of the chosen type in the chosen language (kept in MySQL by the server, so only the very first
  // request for a type/language is slow). "Loading" is derived: the answer on hand is for another key.
  const guideKey = typeKey ? `${typeKey}|${LANG_CODE[lang]}` : "";
  useEffect(() => {
    if (!guideKey) return undefined;
    let alive = true;
    const [type, language] = guideKey.split("|");
    API.get("/kmate/quiz/strategy", { params: { type, language } })
      .then(r => { if (alive) setGuideResult({ key: guideKey, data: r.data, error: false }); })
      .catch(() => { if (alive) setGuideResult({ key: guideKey, data: null, error: true }); });
    return () => { alive = false; };
  }, [guideKey]);

  // What the open weak point means: a grammar explanation with 3 examples (quiz points) or its type's guide (exam points).
  const explainKey = openWeak ? `${openWeak}|${LANG_CODE[lang]}` : "";
  useEffect(() => {
    if (!explainKey) return undefined;
    let alive = true;
    const [source, ...rest] = explainKey.split("|");
    const language = rest.pop();
    API.get("/kmate/quiz/explain", { params: { point: rest.join("|"), source, language } })
      .then(r => { if (alive) setExplainResult({ key: explainKey, data: r.data, error: false }); })
      .catch(() => { if (alive) setExplainResult({ key: explainKey, data: null, error: true }); });
    return () => { alive = false; };
  }, [explainKey]);

  const setDomain = value => {
    setDomainState(value);
    setRange("");
    const [first, last] = QUESTION_LIMITS[value] || ["", ""];
    setStartQuestionState(first ? String(first) : "");
    setEndQuestionState(last ? String(last) : "");
  };
  const setQuestionStart = value => {
    setStartQuestionState(value);
    setRange("");
    if (endQuestion && Number(value) > Number(endQuestion)) setEndQuestionState(value);
  };
  const setQuestionEnd = value => {
    setEndQuestionState(value);
    setRange("");
    if (startQuestion && Number(value) < Number(startQuestion)) setStartQuestionState(value);
  };
  const setSelectedRange = value => {
    setRange(value);
    if (value) { setStartQuestionState(""); setEndQuestionState(""); }
  };

  return {
    options, loadOptions, weak, refreshWeak,
    domain, setDomain, range, setRange: setSelectedRange,
    startQuestion, setQuestionStart, endQuestion, setQuestionEnd,
    domains: options?.domains?.length ? options.domains : FALLBACK_DOMAINS,
    domainInfo: (options?.domains?.length ? options.domains : FALLBACK_DOMAINS).find(d => d.key === domain) || null,
    typeKey, setTypeKey, level, setLevel, lang, setLang, langCode: LANG_CODE[lang],
    typeInfo: options?.types.find(t => t.key === typeKey) || null,
    guide: {
      data: guideResult.key === guideKey ? guideResult.data : null,
      loading: Boolean(guideKey) && guideResult.key !== guideKey,
      error: guideResult.key === guideKey && guideResult.error,
    },
    openWeak,
    toggleWeak: rowKey => setOpenWeak(current => (current === rowKey ? "" : rowKey)),
    explain: {
      data: explainResult.key === explainKey ? explainResult.data : null,
      loading: Boolean(explainKey) && explainResult.key !== explainKey,
      error: explainResult.key === explainKey && explainResult.error,
    },
  };
}
