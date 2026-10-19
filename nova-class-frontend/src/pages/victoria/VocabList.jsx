import { useState } from "react";
import PlayButton from "./PlayButton";
import { romanize } from "./romanize";
import { VOCAB, LEVELS } from "./vocabData";
import extras from "./vocabExtra.json";
import { useLang } from "../../LanguageContext";
import { meaningOf, exampleTranslation } from "./vocabText";
import { hubUi } from "./hubUi";

// TOPIK Hub › Grammar & Meaning › Meaning: TOPIK vocabulary by level (3 - 6) in three views:
//   List       full-width rows (star, number, word, synonym / antonym chips, Burmese meaning, speaker); a click opens the example
//   Flashcard  one 3D flip card at a time for the chosen level
//   Saved      only the starred words (all levels), in the same rows
// Synonyms, antonyms and the example sentence come from vocabExtra.json (written by Claude, scripts/gen_vocab_extras.js);
// a word without them simply shows no chips and no example.
const SAVED_KEY = "topik_saved_words";
const keyOf = (level, no) => `${level}:${no}`;
const extraOf = (level, no) => extras[keyOf(level, no)];

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch { return []; }
}

function Chips({ extra }) {
  if (!extra || (!extra.syn?.length && !extra.ant?.length)) return null;
  return (
    <span style={v.chipRow}>
      {extra.syn?.map(s => <span key={`s${s}`} style={{ ...v.tag, ...v.tagSyn }} data-testid="synonym-chip">유의어 {s}</span>)}
      {extra.ant?.map(a => <span key={`a${a}`} style={{ ...v.tag, ...v.tagAnt }} data-testid="antonym-chip">반의어 {a}</span>)}
    </span>
  );
}

function Star({ on, onClick, word }) {
  return (
    <button type="button" style={{ ...v.star, color: on ? "#F59E0B" : "var(--text-muted)" }} onClick={onClick} aria-pressed={on}
      aria-label={on ? `Remove ${word} from My Saved Words` : `Save ${word} to My Saved Words`} title="My Saved Words">{on ? "★" : "☆"}</button>
  );
}

function Example({ extra, translation, speed, ui }) {
  if (!extra?.example) return <p style={v.noExample}>{ui.noExample}</p>;
  return (
    <div style={v.example} data-testid="vocab-example">
      <div style={{ flex: 1 }}>
        <p style={v.exKo}>{extra.example.ko}</p>
        {translation && <p style={v.exMy} data-testid="example-translation">{translation}</p>}
      </div>
      <PlayButton text={extra.example.ko} speed={speed} />
    </div>
  );
}

function WordRow({ word, lang, saved, onStar, speed, showLevel }) {
  const [open, setOpen] = useState(false);
  const extra = extraOf(word.level, word.no);
  return (
    <div style={v.rowBox} data-testid="vocab-row">
      <div style={v.row}>
        <Star on={saved} onClick={onStar} word={word.ko} />
        <span style={v.no}>{showLevel ? `L${word.level}·${word.no}` : word.no}</span>
        <button type="button" style={v.rowMain} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${word.ko} — ${meaningOf(word, lang)}`}>
          <span style={v.ko}>{word.ko}</span>
          <span style={v.mid}>
            <span style={v.my} data-testid="vocab-meaning">{meaningOf(word, lang)}</span>
            <Chips extra={extra} />
          </span>
          <span style={{ ...v.chevron, transform: open ? "rotate(180deg)" : "none" }} aria-hidden="true">⌄</span>
        </button>
        <PlayButton text={word.ko} speed={speed} />
      </div>
      {open && <div style={v.detail}><Example extra={extra} translation={exampleTranslation(word, lang)} speed={speed} ui={hubUi(lang)} /></div>}
    </div>
  );
}

const PROGRESS_KEY = "topik_card_progress";
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch { return {}; }
}

function FlipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 0-15-6.7L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" /><path d="M21 21v-5h-5" />
    </svg>
  );
}

// One 3D flip card at a time. Front: level, the word, a reading hint. Back: meaning, example, synonyms / antonyms.
// A flipped card can be marked "Got it!" or "Review later" (remembered in the browser); the deck can show only the review-later cards.
function Flashcards({ words, lang, isSaved, toggle, speed }) {
  const ui = hubUi(lang);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [only, setOnly] = useState("all");                  // all | later
  const [progress, setProgress] = useState(loadProgress);   // "level:no" -> "got" | "later"

  const status = w => progress[keyOf(w.level, w.no)];
  const laterCount = words.filter(w => status(w) === "later").length;
  const gotCount = words.filter(w => status(w) === "got").length;
  const deck = only === "later" ? words.filter(w => status(w) === "later") : words;
  const at = Math.min(index, Math.max(deck.length - 1, 0));
  const word = deck[at];

  function mark(value) {
    const next = { ...progress, [keyOf(word.level, word.no)]: value };
    setProgress(next);
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(next)); } catch { /* the progress just is not remembered */ }
    setFlipped(false);
    // in the review-later deck a card marked "Got it" leaves it, so the next card takes its place
    const leaves = only === "later" && value === "got";
    setIndex(leaves ? at : (at + 1) % deck.length);
  }
  const go = step => { setIndex((at + step + deck.length) % deck.length); setFlipped(false); };
  const pick = value => { setOnly(value); setIndex(0); setFlipped(false); };

  const filterBtn = on => ({ ...v.filterBtn, ...(on ? v.filterOn : {}) });

  if (!word) {
    return (
      <div style={v.deck} data-testid="flashcards">
        <div style={v.filters}>
          <button type="button" style={filterBtn(false)} onClick={() => pick("all")}>{ui.allCards(words.length)}</button>
          <button type="button" style={filterBtn(true)} aria-pressed="true">{ui.reviewLater(laterCount)}</button>
        </div>
        <div style={v.empty} data-testid="later-empty">{ui.nothingToReview}</div>
      </div>
    );
  }
  const extra = extraOf(word.level, word.no);
  const current = status(word);

  return (
    <div style={v.deck} data-testid="flashcards">
      <div style={v.filters} role="group" aria-label="Deck">
        <button type="button" style={filterBtn(only === "all")} aria-pressed={only === "all"} onClick={() => pick("all")}>{ui.allCards(words.length)}</button>
        <button type="button" style={filterBtn(only === "later")} aria-pressed={only === "later"} onClick={() => pick("later")}>{ui.reviewLater(laterCount)}</button>
        <span style={v.tally} data-testid="card-tally">{ui.gotItTally(gotCount)}</span>
      </div>

      <div style={v.progressWrap}>
        <div style={v.progressText}>
          <span data-testid="card-counter">{at + 1} / {deck.length}</span> {ui.words}
        </div>
        <div style={v.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={deck.length} aria-valuenow={at + 1}>
          <div style={{ ...v.progressFill, width: `${((at + 1) / deck.length) * 100}%` }} data-testid="card-progress" />
        </div>
      </div>

      <div style={v.scene}>
        <div style={{ ...v.card, transform: flipped ? "rotateY(180deg)" : "none" }} data-testid="flashcard" data-flipped={flipped}>
          <div style={{ ...v.face, ...v.front }} onClick={() => setFlipped(true)} role="button" tabIndex={0} aria-label="Show the meaning" aria-hidden={flipped}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setFlipped(true); }}>
            <span style={v.levelBadge} data-testid="card-level">{ui.level(word.level)}</span>
            {current && <span style={current === "got" ? v.statusGot : v.statusLater}>{current === "got" ? ui.gotItMark : ui.reviewLaterMark}</span>}
            <span style={v.cardKo}>{word.ko}</span>
            <span style={v.reading} title={ui.readingHint} data-testid="card-reading">{romanize(word.ko)}</span>
            <span style={v.flipHint}><FlipIcon /> {ui.tapFlip}</span>
          </div>
          <div style={{ ...v.face, ...v.back }} onClick={() => setFlipped(false)} role="button" tabIndex={0} aria-label="Show the word" aria-hidden={!flipped}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setFlipped(false); }}>
            <span style={v.backKo}>{word.ko}</span>
            <span style={v.cardMy} data-testid="vocab-meaning">{meaningOf(word, lang)}</span>
            <Chips extra={extra} />
            {extra?.example && (
              <span style={v.cardEx}>
                <strong>{extra.example.ko}</strong>
                {exampleTranslation(word, lang) && <><br />{exampleTranslation(word, lang)}</>}
              </span>
            )}
          </div>
        </div>
      </div>

      {flipped && (
        <div style={v.assess} data-testid="self-assessment">
          <button type="button" style={{ ...v.assessBtn, ...v.later }} onClick={() => mark("later")}>{ui.reviewLaterBtn}</button>
          <button type="button" style={{ ...v.assessBtn, ...v.got }} onClick={() => mark("got")}>{ui.gotIt}</button>
        </div>
      )}

      <div style={v.controls}>
        <button type="button" style={v.ctrl} onClick={() => go(-1)}>{ui.prev}</button>
        <PlayButton text={word.ko} speed={speed} label={ui.playAudio} />
        <button type="button" style={{ ...v.ctrl, ...(isSaved(word) ? v.ctrlOn : {}) }} onClick={() => toggle(word)} aria-pressed={isSaved(word)}
          aria-label={isSaved(word) ? `Remove ${word.ko} from My Saved Words` : `Save ${word.ko} to My Saved Words`}>{isSaved(word) ? ui.saved : ui.bookmark}</button>
        <button type="button" style={v.ctrl} onClick={() => go(1)}>{ui.next}</button>
      </div>
    </div>
  );
}

export default function VocabList({ speed }) {
  const { lang } = useLang();
  const ui = hubUi(lang);                          // follows Settings: changing the language re-renders the meanings at once
  const [mode, setMode] = useState("list");               // list | cards | saved
  const [level, setLevel] = useState(3);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(loadSaved);          // "level:no" keys

  const withLevel = level => VOCAB[level].map(w => ({ ...w, level }));
  const isSaved = w => saved.includes(keyOf(w.level, w.no));
  function toggle(w) {
    setSaved(current => {
      const key = keyOf(w.level, w.no);
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* the saved words just are not remembered */ }
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const matches = w => !q || w.ko.includes(q) || meaningOf(w, lang).toLowerCase().includes(q);
  const levelWords = withLevel(level);
  const listWords = levelWords.filter(matches);
  const savedWords = LEVELS.flatMap(withLevel).filter(isSaved).filter(matches);

  const seg = on => ({ ...v.seg, ...(on ? v.segOn : {}) });
  const chip = on => ({ ...v.chip, ...(on ? v.chipOn : {}) });
  const rows = (words, showLevel) => (
    <div style={v.list}>
      {words.map(w => <WordRow key={keyOf(w.level, w.no)} word={w} saved={isSaved(w)} onStar={() => toggle(w)} speed={speed} showLevel={showLevel} lang={lang} />)}
    </div>
  );

  return (
    <section data-testid="vocab-list">
      <div style={v.modeBar} role="group" aria-label="View mode">
        <button type="button" style={seg(mode === "list")} aria-pressed={mode === "list"} onClick={() => setMode("list")}>{ui.listView}</button>
        <button type="button" style={seg(mode === "cards")} aria-pressed={mode === "cards"} onClick={() => setMode("cards")}>{ui.flashcardMode}</button>
        <button type="button" style={seg(mode === "saved")} aria-pressed={mode === "saved"} onClick={() => setMode("saved")}>{ui.savedWords(saved.length)}</button>
      </div>

      <div style={v.toolbar}>
        {mode !== "saved" ? (
          <div style={v.chips} role="group" aria-label="TOPIK level">
            {LEVELS.map(l => (
              <button key={l} type="button" style={chip(level === l)} aria-pressed={level === l} onClick={() => { setLevel(l); }}>
                {ui.level(l)} <span style={v.count}>({VOCAB[l].length})</span>
              </button>
            ))}
          </div>
        ) : <span />}
        {mode !== "cards" && (
          <input style={v.search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={ui.search} aria-label="Search vocabulary" />
        )}
      </div>

      {mode === "cards" && <Flashcards key={level} words={levelWords} lang={lang} isSaved={isSaved} toggle={toggle} speed={speed} />}
      {mode === "list" && (listWords.length ? rows(listWords, false) : <div style={v.empty} data-testid="vocab-empty">{ui.noWords}</div>)}
      {mode === "saved" && (savedWords.length ? rows(savedWords, true) : (
        <div style={v.empty} data-testid="saved-empty">{saved.length ? ui.noSavedMatch : ui.noSaved}</div>
      ))}
    </section>
  );
}

const v = {
  modeBar: { display: "inline-flex", flexWrap: "wrap", gap: "4px", padding: "4px", border: "1px solid var(--border)", borderRadius: "12px", background: "var(--surface)", marginBottom: "14px" },
  seg: { padding: "7px 16px", borderRadius: "9px", border: "none", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" },
  segOn: { background: "var(--primary)", color: "#fff" },
  toolbar: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "14px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px" },
  chip: { padding: "6px 14px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13px", cursor: "pointer" },
  chipOn: { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff", fontWeight: 700 },
  count: { opacity: 0.7, fontSize: "12px" },
  search: { flex: "0 1 280px", minWidth: "180px", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13.5px" },
  list: { display: "flex", flexDirection: "column", gap: "6px" },
  rowBox: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" },
  row: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 14px 6px 6px" },
  star: { border: "none", background: "transparent", fontSize: "20px", cursor: "pointer", lineHeight: 1, padding: "4px 6px" },
  no: { minWidth: "38px", color: "var(--text-muted)", fontSize: "12.5px", fontWeight: 600 },
  rowMain: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "16px", padding: "6px 4px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", color: "inherit" },
  ko: { flex: "0 0 170px", color: "var(--text)", fontWeight: 700, fontSize: "17px" },
  mid: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" },
  my: { color: "var(--text)", fontSize: "14.5px", lineHeight: 1.55 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: "5px" },
  tag: { padding: "1px 9px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 600, border: "1px solid" },
  tagSyn: { color: "#2563EB", background: "rgba(37,99,235,.08)", borderColor: "rgba(37,99,235,.3)" },
  tagAnt: { color: "#DC2626", background: "rgba(220,38,38,.07)", borderColor: "rgba(220,38,38,.3)" },
  chevron: { color: "var(--text-muted)", fontSize: "18px", lineHeight: 1, transition: "transform .15s" },
  detail: { padding: "0 16px 14px 62px" },
  example: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "10px", background: "var(--surface-alt, transparent)", border: "1px solid var(--border)" },
  exKo: { margin: 0, color: "var(--text)", fontWeight: 700, fontSize: "15.5px", lineHeight: 1.6 },
  exMy: { margin: "3px 0 0", color: "var(--text-muted)", fontSize: "13.5px", lineHeight: 1.6 },
  noExample: { margin: 0, color: "var(--text-muted)", fontSize: "13px" },
  empty: { padding: "30px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "14px", color: "var(--text-muted)" },
  deck: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", width: "100%" },
  filters: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", width: "100%", maxWidth: "680px" },
  filterBtn: { padding: "5px 12px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "12.5px", cursor: "pointer" },
  filterOn: { background: "var(--surface-alt)", borderColor: "var(--primary)", color: "var(--primary)", fontWeight: 700 },
  tally: { marginLeft: "auto", color: "var(--text-muted)", fontSize: "12.5px", fontWeight: 600 },
  progressWrap: { width: "100%", maxWidth: "680px" },
  progressText: { marginBottom: "6px", color: "var(--text-muted)", fontSize: "13px", fontWeight: 600 },
  progressTrack: { height: "6px", borderRadius: "999px", background: "var(--border)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: "999px", background: "var(--primary)", transition: "width .25s" },
  scene: { width: "100%", maxWidth: "680px", height: "380px", perspective: "1400px" },
  card: { position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform .55s cubic-bezier(.4,.2,.2,1)" },
  face: { position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "28px", borderRadius: "24px", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 12px 32px rgba(15,23,42,.12), 0 2px 6px rgba(15,23,42,.06)", cursor: "pointer", textAlign: "center", overflow: "auto" },
  front: { position: "absolute" },
  back: { transform: "rotateY(180deg)", background: "var(--surface-alt)" },
  levelBadge: { position: "absolute", top: "18px", left: "20px", padding: "3px 12px", borderRadius: "999px", background: "rgba(59,55,204,.12)", color: "var(--primary)", fontSize: "12.5px", fontWeight: 700 },
  statusGot: { position: "absolute", top: "18px", right: "20px", fontSize: "12.5px", fontWeight: 700, color: "#15803D" },
  statusLater: { position: "absolute", top: "18px", right: "20px", fontSize: "12.5px", fontWeight: 700, color: "#B91C1C" },
  cardKo: { color: "var(--text)", fontWeight: 800, fontSize: "52px", lineHeight: 1.2 },
  backKo: { color: "var(--text-muted)", fontWeight: 700, fontSize: "20px" },
  reading: { color: "var(--text-muted)", fontSize: "15px", letterSpacing: ".5px" },
  flipHint: { position: "absolute", bottom: "18px", display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "12.5px" },
  cardMy: { color: "var(--primary)", fontWeight: 800, fontSize: "26px", lineHeight: 1.4 },
  cardEx: { color: "var(--text)", fontSize: "15px", lineHeight: 1.7, marginTop: "4px" },
  assess: { display: "flex", gap: "12px", width: "100%", maxWidth: "680px" },
  assessBtn: { flex: 1, padding: "14px 16px", borderRadius: "14px", border: "1px solid", fontSize: "16px", fontWeight: 700, cursor: "pointer" },
  later: { color: "#B91C1C", background: "rgba(239,68,68,.08)", borderColor: "rgba(239,68,68,.4)" },
  got: { color: "#15803D", background: "rgba(34,197,94,.1)", borderColor: "rgba(34,197,94,.45)" },
  controls: { display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "12px", width: "100%", maxWidth: "680px" },
  ctrl: { flex: "1 1 130px", padding: "13px 16px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
  ctrlOn: { color: "#B45309", borderColor: "#F59E0B", background: "rgba(245,158,11,.1)" },
};
