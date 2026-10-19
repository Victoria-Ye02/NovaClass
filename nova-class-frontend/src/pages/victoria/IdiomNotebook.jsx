import { useState } from "react";
import PlayButton from "./PlayButton";
import { IDIOM_DATA, IDIOM_CATEGORIES } from "./idiomData";
import { idiomMeaning, speakable } from "./idiomText";
import { useLang } from "../../LanguageContext";

// TOPIK Hub › Idioms · Proverbs (관용 표현 · 속담 노트): idioms, proverbs and news metaphors in three views
//   List       full-width rows (star, number, expression, meaning, speaker); a click opens the Korean explanation (뜻 풀이)
//   Flashcard  one 3D flip card at a time, with shuffle
//   Saved      only the starred expressions of all categories
// The meaning follows the language chosen in Settings; the Korean explanation is always shown in the opened row.
const SAVED_KEY = "topik_saved_idioms";
const ALL = IDIOM_CATEGORIES.flatMap(c => IDIOM_DATA[c.key].map(r => ({ ...r, cat: c.key, id: `${c.key}:${r.n}` })));
const chipOf = key => IDIOM_CATEGORIES.find(c => c.key === key).chip;

const UI = {
  en: { note: "TOPIK II recipe: idioms (Reading 21~22) · proverbs (Writing 54 / Reading 21~22) · news metaphors (Reading 25~27)", search: "Search the Korean, the meaning or the explanation", explain: "Meaning in Korean", list: "📋 List View", cards: "🗂️ Flashcard Mode", saved: "⭐ Saved Expressions", none: "No results.", noSaved: "No saved expressions yet. Tap ☆ in the list to save one.", flip: "Tap to see the meaning", prev: "‹ Previous", next: "Next ›", shuffle: "🔀 Shuffle", bookmark: "☆ Bookmark", savedBtn: "★ Saved", play: "Play Audio" },
  my: { note: "TOPIK II အောင်မြင်ရေး ချက်ပြုတ်နည်း: 관용 표현 (Reading 21~22) · 속담 (Writing 54 / Reading 21~22) · သတင်းထဲက ဥပမာ စကားပုံ (Reading 25~27)", search: "ကိုရီးယား၊ အဓိပ္ပာယ် သို့မဟုတ် ရှင်းလင်းချက်နဲ့ ရှာပါ", explain: "ကိုရီးယားလို ရှင်းလင်းချက်", list: "📋 စာရင်း", cards: "🗂️ Flashcard", saved: "⭐ သိမ်းထားသော စကားစု", none: "ရလဒ် မတွေ့ပါ။", noSaved: "သိမ်းထားတာ မရှိသေးပါ။ စာရင်းထဲက ☆ ကိုနှိပ်ပြီး သိမ်းပါ။", flip: "နှိပ်ပြီး အဓိပ္ပာယ်ကြည့်ပါ", prev: "‹ ရှေ့", next: "နောက် ›", shuffle: "🔀 ရောနှောပါ", bookmark: "☆ သိမ်းမယ်", savedBtn: "★ သိမ်းပြီး", play: "အသံ ဖွင့်ပါ" },
  vi: { note: "Công thức đỗ TOPIK II: thành ngữ (Đọc 21~22) · tục ngữ (Viết 54 / Đọc 21~22) · ẩn dụ trên báo (Đọc 25~27)", search: "Tìm theo tiếng Hàn, nghĩa hoặc giải thích", explain: "Giải thích bằng tiếng Hàn", list: "📋 Danh sách", cards: "🗂️ Thẻ ghi nhớ", saved: "⭐ Đã lưu", none: "Không có kết quả.", noSaved: "Chưa lưu cụm nào. Nhấn ☆ trong danh sách để lưu.", flip: "Nhấn để xem nghĩa", prev: "‹ Trước", next: "Sau ›", shuffle: "🔀 Xáo trộn", bookmark: "☆ Lưu", savedBtn: "★ Đã lưu", play: "Phát âm" },
  ko: { note: "토픽 II 합격 레시피 — 관용 표현 (읽기 21~22) · 속담 (쓰기 54 / 읽기 21~22) · 신문 기사 비유 표현 (읽기 25~27)", search: "한국어 / 뜻 / 설명으로 검색", explain: "뜻 풀이", list: "📋 목록", cards: "🗂️ 플래시카드", saved: "⭐ 저장한 표현", none: "검색 결과가 없습니다.", noSaved: "아직 저장한 표현이 없습니다. 목록에서 별표를 눌러 저장하세요.", flip: "눌러서 뜻 보기", prev: "‹ 이전", next: "다음 ›", shuffle: "🔀 섞기", bookmark: "☆ 저장", savedBtn: "★ 저장됨", play: "듣기" },
};

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch { return []; }
}

function Star({ on, onClick, label }) {
  return <button type="button" style={{ ...n.star, color: on ? "#F59E0B" : "var(--text-muted)" }} onClick={onClick} aria-pressed={on} aria-label={label}>{on ? "★" : "☆"}</button>;
}

function IdiomRow({ entry, lang, ui, saved, onStar, speed, showCat }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={n.rowBox} data-testid="idiom-row">
      <div style={n.row}>
        <Star on={saved} onClick={onStar} label={`${saved ? "Remove" : "Save"} ${entry.kr} ${saved ? "from" : "to"} Saved Expressions`} />
        <span style={n.no}>{entry.n}</span>
        <button type="button" style={n.rowMain} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${entry.kr} — ${idiomMeaning(entry, lang)}`}>
          <span style={n.text}>
            <span style={n.kr}>{entry.kr}{showCat && <span style={n.chip} data-testid="idiom-chip">{chipOf(entry.cat)}</span>}</span>
            <span style={n.meaning} data-testid="idiom-meaning">{idiomMeaning(entry, lang)}</span>
          </span>
          <span style={{ ...n.chevron, transform: open ? "rotate(180deg)" : "none" }} aria-hidden="true">⌄</span>
        </button>
        <PlayButton text={speakable(entry.kr)} speed={speed} />
      </div>
      {open && (
        <div style={n.detail}>
          <div style={n.explain} data-testid="idiom-explanation">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={n.label}>{ui.explain}</div>
              <p style={n.explainText}>{entry.ko}</p>
            </div>
            <PlayButton text={speakable(entry.ko)} speed={speed} />
          </div>
        </div>
      )}
    </div>
  );
}

function Cards({ words, lang, ui, isSaved, toggle, speed }) {
  const [order, setOrder] = useState(() => words.map((_, i) => i));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const at = Math.min(index, words.length - 1);
  const entry = words[order[at]];
  const go = step => { setIndex((at + step + words.length) % words.length); setFlipped(false); };
  const shuffle = () => { setOrder(o => o.slice().sort(() => Math.random() - 0.5)); setIndex(0); setFlipped(false); };

  return (
    <div style={n.deck} data-testid="idiom-cards">
      <div style={n.progressWrap}>
        <div style={n.progressText}><span data-testid="idiom-counter">{at + 1} / {words.length}</span></div>
        <div style={n.track}><div style={{ ...n.fill, width: `${((at + 1) / words.length) * 100}%` }} /></div>
      </div>
      <div style={n.scene}>
        <div style={{ ...n.card, transform: flipped ? "rotateY(180deg)" : "none" }} data-testid="idiom-card" data-flipped={flipped}>
          <div style={n.face} onClick={() => setFlipped(true)} role="button" tabIndex={0} aria-label="Show the meaning" aria-hidden={flipped}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setFlipped(true); }}>
            <span style={n.levelChip}>{chipOf(entry.cat)} {entry.n}</span>
            <span style={n.cardKr}>{entry.kr}</span>
            <span style={n.hint}>↻ {ui.flip}</span>
          </div>
          <div style={{ ...n.face, ...n.back }} onClick={() => setFlipped(false)} role="button" tabIndex={0} aria-label="Show the expression" aria-hidden={!flipped}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setFlipped(false); }}>
            <span style={n.cardMy} data-testid="idiom-meaning">{idiomMeaning(entry, lang)}</span>
            {lang !== "ko" && <span style={n.cardKo}>{entry.ko}</span>}
          </div>
        </div>
      </div>
      <div style={n.controls}>
        <button type="button" style={n.ctrl} onClick={() => go(-1)}>{ui.prev}</button>
        <PlayButton text={speakable(entry.kr)} speed={speed} label={ui.play} />
        <button type="button" style={{ ...n.ctrl, ...(isSaved(entry) ? n.ctrlOn : {}) }} onClick={() => toggle(entry)} aria-pressed={isSaved(entry)}
          aria-label={`${isSaved(entry) ? "Remove" : "Save"} ${entry.kr} ${isSaved(entry) ? "from" : "to"} Saved Expressions`}>{isSaved(entry) ? ui.savedBtn : ui.bookmark}</button>
        <button type="button" style={n.ctrl} onClick={shuffle}>{ui.shuffle}</button>
        <button type="button" style={n.ctrl} onClick={() => go(1)}>{ui.next}</button>
      </div>
    </div>
  );
}

export default function IdiomNotebook({ speed }) {
  const { lang } = useLang();
  const ui = UI[lang] || UI.en;
  const [cat, setCat] = useState("idiom");
  const [mode, setMode] = useState("list");                 // list | cards | saved
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(loadSaved);            // "category:number" ids

  const isSaved = e => saved.includes(e.id);
  function toggle(e) {
    setSaved(current => {
      const next = current.includes(e.id) ? current.filter(x => x !== e.id) : [...current, e.id];
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* the saved expressions just are not remembered */ }
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const matches = e => !q || `${e.kr} ${e.ko} ${e.my} ${idiomMeaning(e, lang)}`.toLowerCase().includes(q);
  const pool = mode === "saved" ? ALL.filter(isSaved) : ALL.filter(e => e.cat === cat);
  const words = pool.filter(matches);

  const seg = on => ({ ...n.seg, ...(on ? n.segOn : {}) });
  const chip = on => ({ ...n.catBtn, ...(on ? n.catOn : {}) });

  return (
    <section data-testid="idiom-notebook">
      <p style={n.note}>{ui.note}</p>
      <div style={n.modeBar} role="group" aria-label="View mode">
        <button type="button" style={seg(mode === "list")} aria-pressed={mode === "list"} onClick={() => setMode("list")}>{ui.list}</button>
        <button type="button" style={seg(mode === "cards")} aria-pressed={mode === "cards"} onClick={() => setMode("cards")}>{ui.cards}</button>
        <button type="button" style={seg(mode === "saved")} aria-pressed={mode === "saved"} onClick={() => setMode("saved")}>{ui.saved} ({saved.length})</button>
      </div>

      <div style={n.toolbar}>
        {mode !== "saved" ? (
          <div style={n.cats} role="group" aria-label="Category">
            {IDIOM_CATEGORIES.map(c => (
              <button key={c.key} type="button" style={chip(cat === c.key)} aria-pressed={cat === c.key} onClick={() => setCat(c.key)}>
                {c.name} <span style={n.count}>({IDIOM_DATA[c.key].length})</span>
              </button>
            ))}
          </div>
        ) : <span />}
        <input style={n.search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={ui.search} aria-label="Search expressions" />
      </div>

      {words.length === 0 ? (
        <div style={n.empty} data-testid="idiom-empty">{mode === "saved" && !q ? ui.noSaved : ui.none}</div>
      ) : mode === "cards" ? (
        <Cards key={`${cat}|${q}|${lang}`} words={words} lang={lang} ui={ui} isSaved={isSaved} toggle={toggle} speed={speed} />
      ) : (
        <div style={n.list}>
          {words.map(e => <IdiomRow key={e.id} entry={e} lang={lang} ui={ui} saved={isSaved(e)} onStar={() => toggle(e)} speed={speed} showCat={mode === "saved"} />)}
        </div>
      )}
    </section>
  );
}

const n = {
  note: { margin: "0 0 14px", color: "var(--text-muted)", fontSize: "13.5px", lineHeight: 1.6 },
  modeBar: { display: "inline-flex", flexWrap: "wrap", gap: "4px", padding: "4px", border: "1px solid var(--border)", borderRadius: "12px", background: "var(--surface)", marginBottom: "14px" },
  seg: { padding: "7px 16px", borderRadius: "9px", border: "none", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" },
  segOn: { background: "var(--primary)", color: "#fff" },
  toolbar: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "14px" },
  cats: { display: "flex", flexWrap: "wrap", gap: "6px" },
  catBtn: { padding: "6px 14px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13px", cursor: "pointer" },
  catOn: { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff", fontWeight: 700 },
  count: { opacity: 0.7, fontSize: "12px" },
  search: { flex: "0 1 320px", minWidth: "180px", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13.5px" },
  list: { display: "flex", flexDirection: "column", gap: "6px" },
  rowBox: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" },
  row: { display: "flex", alignItems: "center", gap: "10px", padding: "6px 14px 6px 6px" },
  star: { border: "none", background: "transparent", fontSize: "20px", cursor: "pointer", lineHeight: 1, padding: "4px 6px" },
  no: { minWidth: "30px", color: "var(--text-muted)", fontSize: "12.5px", fontWeight: 600, textAlign: "right" },
  rowMain: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "12px", padding: "8px 4px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", color: "inherit" },
  text: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" },
  kr: { color: "var(--text)", fontWeight: 700, fontSize: "17px" },
  chip: { marginLeft: "8px", padding: "1px 8px", borderRadius: "999px", background: "rgba(59,55,204,.12)", color: "var(--primary)", fontSize: "11.5px", fontWeight: 600, verticalAlign: "2px" },
  meaning: { color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.7 },
  chevron: { color: "var(--text-muted)", fontSize: "18px", lineHeight: 1, transition: "transform .15s" },
  detail: { padding: "0 16px 14px 56px" },
  explain: { display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface-alt, transparent)" },
  label: { color: "var(--primary)", fontSize: "11px", fontWeight: 800, letterSpacing: ".6px" },
  explainText: { margin: "3px 0 0", color: "var(--text)", fontSize: "14.5px", lineHeight: 1.6 },
  empty: { padding: "36px 12px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "14px", color: "var(--text-muted)" },
  deck: { display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", width: "100%" },
  progressWrap: { width: "100%", maxWidth: "680px" },
  progressText: { marginBottom: "6px", color: "var(--text-muted)", fontSize: "13px", fontWeight: 600 },
  track: { height: "6px", borderRadius: "999px", background: "var(--border)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: "999px", background: "var(--primary)", transition: "width .25s" },
  scene: { width: "100%", maxWidth: "680px", height: "340px", perspective: "1400px" },
  card: { position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform .55s cubic-bezier(.4,.2,.2,1)" },
  face: { position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "28px", borderRadius: "24px", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 12px 32px rgba(15,23,42,.12), 0 2px 6px rgba(15,23,42,.06)", cursor: "pointer", textAlign: "center", overflow: "auto" },
  back: { transform: "rotateY(180deg)", background: "var(--surface-alt)" },
  levelChip: { position: "absolute", top: "18px", left: "20px", padding: "3px 12px", borderRadius: "999px", background: "rgba(59,55,204,.12)", color: "var(--primary)", fontSize: "12.5px", fontWeight: 700 },
  cardKr: { color: "var(--text)", fontWeight: 800, fontSize: "34px", lineHeight: 1.35 },
  hint: { position: "absolute", bottom: "18px", color: "var(--text-muted)", fontSize: "12.5px" },
  cardMy: { color: "var(--primary)", fontWeight: 800, fontSize: "22px", lineHeight: 1.6 },
  cardKo: { color: "var(--text-muted)", fontSize: "14.5px", lineHeight: 1.7 },
  controls: { display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "12px", width: "100%", maxWidth: "680px" },
  ctrl: { flex: "1 1 120px", padding: "13px 14px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
  ctrlOn: { color: "#B45309", borderColor: "#F59E0B", background: "rgba(245,158,11,.1)" },
};
