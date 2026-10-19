import { useState, useEffect } from "react";
import API from "../../services/api";
import PlayButton from "./PlayButton";

// "Explain" for a grammar row: a structured explanation (pattern, meaning, explanation, usage notes, example) written by the
// model strictly in the language chosen in Settings (English, Burmese, Vietnamese or Korean). The server keeps each
// (grammar, language) answer, so only the first student to ask for a language waits for the model.
const UI = {
  en: { explain: "Explain", hide: "Hide", loading: "Writing the explanation… (the first time takes a little while)", error: "The explanation could not be loaded.", meaning: "Meaning", explanation: "Explanation", usage: "Usage notes", example: "Example" },
  my: { explain: "ရှင်းပြ", hide: "ဝှက်", loading: "ရှင်းလင်းချက် ရေးနေပါတယ်… (ပထမဆုံးအကြိမ် နည်းနည်းကြာမယ်)", error: "ရှင်းလင်းချက်ကို မဖွင့်နိုင်ပါ။", meaning: "အဓိပ္ပာယ်", explanation: "ရှင်းလင်းချက်", usage: "အသုံးပြုပုံ မှတ်ချက်", example: "ဥပမာ" },
  vi: { explain: "Giải thích", hide: "Ẩn", loading: "Đang viết phần giải thích… (lần đầu sẽ hơi lâu)", error: "Không tải được phần giải thích.", meaning: "Ý nghĩa", explanation: "Giải thích", usage: "Lưu ý khi dùng", example: "Ví dụ" },
  ko: { explain: "설명", hide: "닫기", loading: "설명을 만드는 중입니다… (처음에는 조금 걸려요)", error: "설명을 불러오지 못했어요.", meaning: "의미", explanation: "설명", usage: "사용 팁", example: "예문" },
};
const explainUi = lang => UI[lang] || UI.en;

export function ExplainButton({ open, onClick, lang }) {
  const ui = explainUi(lang);
  return <button type="button" style={x.btn} onClick={onClick} aria-expanded={open}>💬 {open ? ui.hide : ui.explain}</button>;
}

export function ExplainPanel({ pattern, lang, speed }) {
  const ui = explainUi(lang);
  const [results, setResults] = useState({});               // language -> { data } | { error: true }
  const result = results[lang];

  useEffect(() => {
    if (results[lang]) return undefined;
    let alive = true;
    API.get("/kmate/grammar/explain", { params: { content: pattern, language: lang } })
      .then(r => { if (alive) setResults(cur => ({ ...cur, [lang]: { data: r.data } })); })
      .catch(() => { if (alive) setResults(cur => ({ ...cur, [lang]: { error: true } })); });
    return () => { alive = false; };
  }, [lang, pattern, results]);

  const d = result?.data;
  return (
    <div style={x.panel} data-testid="grammar-explain">
      {!result && <p style={x.muted}>{ui.loading}</p>}
      {result?.error && <p style={x.muted}>{ui.error}</p>}
      {d && (
        <>
          <p style={x.pattern}>{d.grammarPattern}</p>
          <h5 style={x.h}>{ui.meaning}</h5>
          <p style={x.text} data-testid="explain-meaning">{d.meaningSummary}</p>
          <h5 style={x.h}>{ui.explanation}</h5>
          <p style={x.text}>{d.explanation}</p>
          <h5 style={x.h}>{ui.usage}</h5>
          <p style={x.text}>{d.usageNotes}</p>
          <h5 style={x.h}>{ui.example}</h5>
          <div style={x.example}>
            <div style={{ flex: 1 }}>
              <p style={x.ko}>{d.example.korean}</p>
              <p style={x.translation}>{d.example.translation}</p>
            </div>
            <PlayButton text={d.example.korean} speed={speed} />
          </div>
        </>
      )}
    </div>
  );
}

const x = {
  btn: { marginTop: "8px", padding: "5px 12px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--primary)", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" },
  panel: { flexBasis: "100%", marginTop: "4px", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface-alt, transparent)" },
  pattern: { margin: "0 0 4px", color: "var(--primary)", fontWeight: 800, fontSize: "16px" },
  h: { margin: "10px 0 3px", color: "var(--text-muted)", fontSize: "11.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase" },
  text: { margin: 0, color: "var(--text)", fontSize: "13.5px", lineHeight: 1.7, whiteSpace: "pre-line" },
  muted: { margin: 0, color: "var(--text-muted)", fontSize: "13px" },
  example: { display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)" },
  ko: { margin: 0, color: "var(--text)", fontWeight: 700, fontSize: "14.5px", lineHeight: 1.6 },
  translation: { margin: "2px 0 0", color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.6 },
};
