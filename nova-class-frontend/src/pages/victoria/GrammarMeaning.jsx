import { useState } from "react";
import Sidebar from "../../components/Sidebar";
import { SIMILAR_GRAMMAR, NUANCE, sentenceOf } from "./similarGrammar";
import { hubUi } from "./hubUi";
import { coreShort, coreExample, similarText, nuanceLabel } from "./grammarText";
import { CORE_GRAMMAR } from "./coreGrammar";
import { useLang } from "../../LanguageContext";
import VocabList from "./VocabList";
import IdiomNotebook from "./IdiomNotebook";
import { ExplainButton, ExplainPanel } from "./GrammarExplain";
import PlayButton from "./PlayButton";

// TOPIK Hub › Grammar & Meaning. At the top a [읽기] / [듣기] / [쓰기] switch (the TOPIK skill); each skill's dropdown picks
// one of the study lists that help with it: core grammar cards, similar-grammar pairs, vocabulary or idioms & proverbs.
// Listening has no dedicated list yet, so it offers the vocabulary with audio and says so.
const VIEW_LABELS = { core: "coreOption", similar: "similarOption", meaning: "meaningOption", idioms: "idiomsOption" };  // keys of hubUi
const SKILLS = [
  { value: "reading", label: "tabReading", views: ["core", "similar", "idioms", "meaning"] },
  { value: "listening", label: "tabListening", views: ["meaning"], note: "listeningNote" },
  { value: "writing", label: "tabWriting", views: ["core", "similar", "idioms"] },
];

// the badge text of a category: "선택" + "무관" → "선택 · 무관"; ①/② items list both senses
const categoryLabel = c => c.join(c.some(x => /^[①②]/.test(x)) ? "  " : " · ");

// Normal / Slow for every example sentence on the page (Slow asks for the slower, clearer audio)
function SpeedToggle({ speed, onChange }) {
  const { lang } = useLang();
  const ui = hubUi(lang);
  const seg = on => ({ ...g.miniTab, ...(on ? g.miniTabOn : {}) });
  return (
    <div style={{ ...g.tabRow, margin: "0 0 14px", alignItems: "center" }} role="group" aria-label="Audio speed">
      <span style={g.speedLabel} aria-hidden="true">🔊 {ui.speed}</span>
      <button type="button" style={seg(speed === "normal")} aria-pressed={speed === "normal"} onClick={() => onChange("normal")}>{ui.normal}</button>
      <button type="button" style={seg(speed === "slow")} aria-pressed={speed === "slow"} onClick={() => onChange("slow")}>{ui.slow}</button>
    </div>
  );
}

// One full-width row per grammar. Left: number, grammar, badges. Middle: short meaning and the conjugation rule.
// Right: the examples with their translation (Burmese when Burmese is chosen, else English) and the speaker.
function CoreRow({ item, lang, speed }) {
  const ui = hubUi(lang);
  const [explaining, setExplaining] = useState(false);
  return (
    <article style={g.row} data-testid="core-row">
      <div style={g.colLeft}>
        <div style={g.rowTitle}>
          <span style={g.no}>{item.no}</span>
          <h4 style={{ ...g.pattern, margin: 0 }}>{item.pattern}</h4>
        </div>
        <div style={g.badges}>
          <span style={g.badge}>{categoryLabel(item.category)}</span>
          <span style={g.chip}>{item.level}</span>
        </div>
        <ExplainButton open={explaining} onClick={() => setExplaining(o => !o)} lang={lang} />
      </div>

      <div style={g.colMid}>
        <p style={g.shortMeaning} title={item.my} data-testid="short-meaning">{coreShort(item, lang)}</p>
        <div style={g.rule}><strong>{ui.conjugation}</strong><br />{item.rule}</div>
      </div>

      <div style={g.colRight}>
        {item.examples.map((ex, i) => (
          <div key={ex.ko} style={g.exRow}>
            <div style={{ flex: 1 }}>
              {ex.label && <span style={g.senseLabel}>{ex.label}</span>}
              <p style={g.exKo}>{ex.ko}</p>
              <p style={g.exEn} data-testid="example-translation">{coreExample(item, i, lang)}</p>
            </div>
            <PlayButton text={ex.ko} speed={speed} />
          </div>
        ))}
      </div>
      {explaining && <ExplainPanel pattern={item.pattern} lang={lang} speed={speed} />}
    </article>
  );
}

// The text a search looks at for one core grammar card: the pattern, the meanings, the rule and the example sentences
function coreText(item, lang) {
  return [item.pattern, item.my, item.rule, coreShort(item, lang), ...item.examples.map((ex, i) => `${ex.ko} ${coreExample(item, i, lang)}`)].join(" ");
}

// Search box labels (the grammar tab only; the meaning and idiom tabs keep their own search boxes)
const SEARCH_UI = {
  en: { placeholder: "Search grammar", none: "No grammar matches your search." },
  my: { placeholder: "သဒ္ဒါ ရှာပါ", none: "ရှာထားတာနဲ့ ကိုက်တဲ့ သဒ္ဒါ မရှိပါ။" },
  vi: { placeholder: "Tìm ngữ pháp", none: "Không có ngữ pháp nào khớp với tìm kiếm." },
  ko: { placeholder: "문법 검색", none: "검색과 일치하는 문법이 없습니다." },
};

function SearchEmpty({ lang }) {
  return <div style={g.placeholder} data-testid="grammar-search-empty">{(SEARCH_UI[lang] || SEARCH_UI.en).none}</div>;
}

function CoreList({ speed, query }) {
  const { lang } = useLang();
  const q = query.trim().toLowerCase();
  const items = CORE_GRAMMAR.filter(item => !q || coreText(item, lang).toLowerCase().includes(q));
  if (items.length === 0) return <SearchEmpty lang={lang} />;
  return (
    <div style={g.rowList} data-testid="core-grammar-list">
      {items.map(item => <CoreRow key={item.no} item={item} lang={lang} speed={speed} />)}
    </div>
  );
}

const STAR_KEY = "grammar_confusion_list";

function loadStars() {
  try { return JSON.parse(localStorage.getItem(STAR_KEY)) || []; } catch { return []; }
}

function SimilarCard({ group, starred, onStar, speed, lang }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);               // the grammar currently swapped into the sentence
  const [quizOpen, setQuizOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const { quiz, items } = group;
  const item = items[active];
  const nuance = NUANCE[item.tag] || NUANCE.general;
  const ui = hubUi(lang);
  const text = similarText(group, lang);                       // Burmese and Vietnamese explanations; other languages show English
  const translation = text.sentences[active];
  const diff = text.diff;
  const note = text.notes[active];
  const nuanceText = nuanceLabel(item.tag, lang);

  return (
    <article style={g.acc} data-testid="similar-card">
      <div style={g.accRow}>
        <button type="button" style={g.star} onClick={onStar} aria-pressed={starred} aria-label={starred ? "Remove from My Confusing Grammars" : "Save to My Confusing Grammars"} title="My Confusing Grammars">{starred ? "★" : "☆"}</button>
        <button type="button" style={g.accHead} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={group.title}>
          <span style={g.accTitle}>{group.title}</span>
          <span style={g.accDiff}>{diff}</span>
        </button>
        <span style={{ ...g.chevron, transform: open ? "rotate(180deg)" : "none" }} aria-hidden="true">⌄</span>
      </div>

      {open && (
        <div style={g.accBody} data-testid="swap-builder">
          <div style={g.sentenceBox}>
            <p style={g.sentence} data-testid="swap-sentence">
              {item.pre ?? group.pre}
              <button type="button" style={{ ...g.pill, color: nuance.color, background: `${nuance.color}1F`, borderColor: `${nuance.color}66` }} onClick={() => setActive((active + 1) % items.length)} title={ui.pillTitle} data-testid="swap-pill">{item.slot}</button>
              {item.post ?? group.post}
            </p>
            <PlayButton text={sentenceOf(group, item)} speed={speed} />
          </div>
          <p style={g.translation} data-testid="swap-translation">{translation}</p>

          <div style={g.chipRow} role="group" aria-label="Swap the grammar" title={ui.swap}>
            {items.map((x, i) => (
              <button key={x.p} type="button" style={{ ...g.chipBtn, ...(i === active ? g.chipBtnOn : {}) }} aria-pressed={i === active} onClick={() => setActive(i)}>{x.p}</button>
            ))}
          </div>

          <p style={g.noteLine}>
            <span style={{ ...g.nuance, color: nuance.color, background: `${nuance.color}1A`, borderColor: `${nuance.color}55` }} data-testid="nuance-badge">{nuanceText}</span>
            {" "}{note}
          </p>

          {!quizOpen ? (
            <button type="button" style={g.trapBtn} onClick={() => setQuizOpen(true)}>{ui.trap}</button>
          ) : (
            <div style={g.quiz} data-testid="trap-quiz">
              <p style={g.quizQ}>{quiz.q}</p>
              <div style={g.quizOpts}>
                {quiz.options.map((opt, i) => {
                  const done = picked !== null;
                  const style = done ? (i === quiz.answer ? g.optRight : i === picked ? g.optWrong : {}) : {};
                  return <button key={opt} type="button" style={{ ...g.opt, ...style }} disabled={done} onClick={() => setPicked(i)}>{opt}</button>;
                })}
              </div>
              {picked !== null && (
                <p style={picked === quiz.answer ? g.fbOk : g.fbBad} data-testid="trap-feedback">
                  {picked === quiz.answer ? ui.correct : ui.wrong(quiz.options[quiz.answer])}{text.why}
                  <button type="button" style={g.again} onClick={() => setPicked(null)}>{ui.again}</button>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// The text a search looks at for one similar-grammar pair: its title, the grammar forms, the difference and the sentences
function similarHaystack(group, lang) {
  return [group.title, group.pre, group.post, ...group.items.map(x => x.p), similarText(group, lang).diff].join(" ");
}

function SimilarList({ speed, query }) {
  const { lang } = useLang();
  const ui = hubUi(lang);
  const [stars, setStars] = useState(loadStars);         // ids of the saved pairs
  const [only, setOnly] = useState(false);               // show only My Confusing Grammars

  function toggleStar(id) {
    setStars(current => {
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      try { localStorage.setItem(STAR_KEY, JSON.stringify(next)); } catch { /* the list just is not remembered */ }
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const base = only ? SIMILAR_GRAMMAR.filter(x => stars.includes(x.id)) : SIMILAR_GRAMMAR;
  const groups = base.filter(x => !q || similarHaystack(x, lang).toLowerCase().includes(q));
  const seg = on => ({ ...g.miniTab, ...(on ? g.miniTabOn : {}) });

  return (
    <>
      <div style={g.toolbar}>
        <div style={g.tabRow} role="group" aria-label="Show">
          <button type="button" style={seg(!only)} aria-pressed={!only} onClick={() => setOnly(false)}>{ui.allPairs(SIMILAR_GRAMMAR.length)}</button>
          <button type="button" style={seg(only)} aria-pressed={only} onClick={() => setOnly(true)}>{ui.confusing(stars.length)}</button>
        </div>
      </div>
      {groups.length === 0 ? (
        q ? <SearchEmpty lang={lang} /> : <div style={g.placeholder} data-testid="confusion-empty">{ui.confusionEmpty}</div>
      ) : (
        <div style={g.accList} data-testid="similar-grammar-list">
          {groups.map(group => <SimilarCard key={group.id} group={group} starred={stars.includes(group.id)} onStar={() => toggleStar(group.id)} speed={speed} lang={lang} />)}
        </div>
      )}
    </>
  );
}

export default function GrammarMeaning() {
  const { lang } = useLang();
  const ui = hubUi(lang);
  const [skill, setSkill] = useState("reading");      // reading | listening | writing
  const [picked, setPicked] = useState("core");        // core | similar | meaning | idioms (the last list chosen)
  const [speed, setSpeed] = useState("normal");         // audio speed for both lists
  const [query, setQuery] = useState("");               // grammar search (the grammar tab)
  const searchUi = SEARCH_UI[lang] || SEARCH_UI.en;

  const tab = on => ({ ...g.tab, ...(on ? g.tabOn : {}) });
  const current = SKILLS.find(x => x.value === skill);
  // Keep the chosen list when the new skill has it too; otherwise fall back to the skill's first list.
  const view = current.views.includes(picked) ? picked : current.views[0];
  const isGrammar = view === "core" || view === "similar";

  return (
    <div style={g.layout}>
      <Sidebar />
      <main style={g.main}>
        <h2 style={g.title}>{ui.title}</h2>
        <div style={g.topRow}>
          <div style={g.tabs} role="tablist" aria-label="Reading, Listening or Writing">
            {SKILLS.map(x => (
              <button key={x.value} role="tab" aria-selected={skill === x.value} style={tab(skill === x.value)} onClick={() => setSkill(x.value)} data-testid={`skill-${x.value}`}>{ui[x.label]}</button>
            ))}
          </div>
          {isGrammar && (
            <input
              type="search"
              style={g.search}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchUi.placeholder}
              aria-label={searchUi.placeholder}
              data-testid="grammar-search"
            />
          )}
        </div>

        {current.views.length > 1 && (
          <select style={g.select} value={view} onChange={e => setPicked(e.target.value)} aria-label="Study list" data-testid="grammar-view-select">
            {current.views.map(v => <option key={v} value={v}>{ui[VIEW_LABELS[v]]}</option>)}
          </select>
        )}
        {current.note && <p style={g.note} role="note" data-testid="skill-note">{ui[current.note]}</p>}
        <SpeedToggle speed={speed} onChange={setSpeed} />
        {view === "core" ? <CoreList speed={speed} query={query} />
          : view === "similar" ? <SimilarList speed={speed} query={query} />
          : view === "meaning" ? <VocabList speed={speed} />
          : <IdiomNotebook speed={speed} />}
      </main>
    </div>
  );
}

const g = {
  layout: { display: "flex", minHeight: "100vh", background: "var(--bg)" },
  main: { marginLeft: "240px", flex: 1, minWidth: 0, padding: "24px 32px", boxSizing: "border-box" },
  title: { margin: "0 0 16px", color: "var(--text)" },
  topRow: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px" },
  search: { flex: "0 1 300px", minWidth: "180px", padding: "9px 12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "14px" },
  tabs: { display: "inline-flex", gap: "4px", padding: "4px", border: "1px solid var(--border)", borderRadius: "12px", background: "var(--surface)" },
  tab: { padding: "8px 22px", borderRadius: "9px", border: "none", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: "14px", cursor: "pointer" },
  tabOn: { background: "var(--primary)", color: "#fff" },
  note: { maxWidth: "640px", margin: "0 0 14px", padding: "10px 14px", borderRadius: "10px", border: "1px dashed var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.6 },
  select: { display: "block", width: "100%", maxWidth: "420px", padding: "10px 12px", marginBottom: "18px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "14px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px" },
  no: { minWidth: "24px", height: "24px", borderRadius: "50%", background: "var(--primary)", color: "#fff", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  chev: { marginLeft: "auto", color: "var(--text-muted)", fontSize: "12px" },
  badges: { display: "flex", flexWrap: "wrap", gap: "6px", margin: "8px 0" },
  badge: { padding: "2px 10px", borderRadius: "999px", background: "rgba(59,55,204,.12)", color: "var(--primary)", fontSize: "12px", fontWeight: 700 },
  chip: { padding: "2px 10px", borderRadius: "999px", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: "12px" },
  rule: { margin: "8px 0", padding: "9px 12px", borderRadius: "10px", border: "1px dashed var(--border)", background: "var(--surface-alt, transparent)", color: "var(--text)", fontSize: "13px", lineHeight: 1.55 },
  exRow: { display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "8px", padding: "8px 10px", borderRadius: "10px", background: "var(--surface-alt, transparent)" },
  senseLabel: { display: "inline-block", marginBottom: "2px", color: "var(--text-muted)", fontSize: "11px", fontWeight: 700 },
  exKo: { margin: 0, color: "var(--text)", fontWeight: 700, fontSize: "14px", lineHeight: 1.5 },
  exEn: { margin: "2px 0 0", color: "var(--text-muted)", fontSize: "13px" },
  pattern: { margin: "0 0 6px", color: "var(--primary)", fontSize: "17px" },
  shortMeaning: { margin: "0 0 8px", color: "var(--text)", fontSize: "15px", fontWeight: 600 },
  meaning: { margin: "0 0 8px", color: "var(--text)", fontSize: "13.5px", lineHeight: 1.55 },
  example: { margin: "0", color: "var(--text)", fontSize: "13.5px", lineHeight: 1.6 },
  muted: { color: "var(--text-muted)", fontWeight: 400 },
  rowList: { display: "flex", flexDirection: "column", gap: "10px" },
  row: { display: "flex", flexWrap: "wrap", gap: "16px 28px", alignItems: "flex-start", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "16px 20px" },
  colLeft: { flex: "1 1 200px", minWidth: 0 },
  colMid: { flex: "1.4 1 260px", minWidth: 0 },
  colRight: { flex: "1.8 1 300px", minWidth: 0 },
  rowTitle: { display: "flex", alignItems: "center", gap: "10px" },
  accList: { display: "flex", flexDirection: "column", gap: "10px" },
  acc: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" },
  accRow: { display: "flex", alignItems: "center", gap: "4px", padding: "4px 14px 4px 8px" },
  accHead: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px", padding: "10px 6px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" },
  accTitle: { color: "var(--primary)", fontWeight: 700, fontSize: "15px" },
  accDiff: { color: "var(--text-muted)", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  chevron: { color: "var(--text-muted)", fontSize: "20px", lineHeight: 1, transition: "transform .15s" },
  accBody: { padding: "4px 18px 18px 18px", borderTop: "1px solid var(--border)" },
  sentenceBox: { display: "flex", alignItems: "center", gap: "12px", marginTop: "14px", padding: "16px 18px", borderRadius: "12px", background: "var(--surface-alt, transparent)", border: "1px solid var(--border)" },
  sentence: { flex: 1, margin: 0, color: "var(--text)", fontSize: "18px", fontWeight: 600, lineHeight: 1.9 },
  pill: { display: "inline-block", margin: "0 3px", padding: "1px 12px", borderRadius: "999px", border: "1px solid", fontSize: "inherit", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  translation: { margin: "10px 2px 0", color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.6 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: "8px", margin: "14px 0 10px" },
  chipBtn: { padding: "6px 14px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13.5px", cursor: "pointer" },
  chipBtnOn: { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff", fontWeight: 700 },
  noteLine: { margin: "4px 2px 0", color: "var(--text)", fontSize: "13px", lineHeight: 1.6 },
  star: { border: "none", background: "transparent", color: "#F59E0B", fontSize: "22px", cursor: "pointer", lineHeight: 1 },
  toolbar: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "10px", marginBottom: "16px" },
  tabRow: { display: "flex", flexWrap: "wrap", gap: "6px", margin: "10px 0" },
  speedLabel: { color: "var(--text-muted)", fontSize: "12.5px", fontWeight: 600, marginRight: "2px" },
  miniTab: { padding: "5px 12px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "12.5px", cursor: "pointer" },
  miniTabOn: { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff", fontWeight: 700 },
  nuance: { padding: "1px 9px", borderRadius: "999px", border: "1px solid", fontSize: "11.5px", fontWeight: 700 },
  trapBtn: { marginTop: "12px", padding: "8px 14px", borderRadius: "10px", border: "1px dashed var(--primary)", background: "transparent", color: "var(--primary)", fontWeight: 700, fontSize: "13px", cursor: "pointer" },
  quiz: { marginTop: "12px", padding: "12px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface-alt, transparent)" },
  quizQ: { margin: "0 0 8px", color: "var(--text)", fontWeight: 700, fontSize: "14px" },
  quizOpts: { display: "flex", flexWrap: "wrap", gap: "8px" },
  opt: { padding: "7px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13.5px", cursor: "pointer" },
  optRight: { borderColor: "#22C55E", background: "rgba(34,197,94,.14)" },
  optWrong: { borderColor: "#EF4444", background: "rgba(239,68,68,.12)" },
  fbOk: { margin: "10px 0 0", color: "#15803D", fontSize: "13px", lineHeight: 1.55 },
  fbBad: { margin: "10px 0 0", color: "#B91C1C", fontSize: "13px", lineHeight: 1.55 },
  again: { marginLeft: "10px", border: "none", background: "transparent", color: "var(--primary)", fontWeight: 700, cursor: "pointer" },
  placeholder: { padding: "40px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "14px", color: "var(--text-muted)" },
};
