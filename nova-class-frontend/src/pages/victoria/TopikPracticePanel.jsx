import { useState } from "react";
import { GuideContent, ExplanationContent } from "./TopikStudyParts";
import { t } from "./topikStyles";
import { practiceFocus } from "./useTopikPractice";

// What the K_MATE sidebar holds for TOPIK practice: the practice settings (question type, difficulty, explanation
// language), the Strategy Guide of the chosen type, and the student's weak points. The quiz itself opens in the
// main area; `onPractice(weaknesses)` asks it to make practice questions for those points.
const LANGUAGES = [["English", "EN"], ["Korean", "KO"], ["Burmese", "မြန်မာ"], ["Vietnamese", "VI"]];

function Section({ title, open, onToggle, testId, children }) {
  return (
    <section style={p.section} data-testid={testId}>
      <button type="button" style={p.sectionHead} onClick={onToggle} aria-expanded={open}>
        <span>{title}</span><span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={p.sectionBody}>{children}</div>}
    </section>
  );
}

export default function TopikPracticePanel({ practice, onPractice }) {
  const { options, loadOptions, weak, typeKey, setTypeKey, level, setLevel, lang, setLang, typeInfo, guide, openWeak, toggleWeak, explain } = practice;
  const [open, setOpen] = useState({ settings: true, guide: true, weak: true });
  const flip = key => () => setOpen(o => ({ ...o, [key]: !o[key] }));
  const chip = on => ({ ...p.chip, ...(on ? p.chipOn : {}) });

  return (
    <div style={p.panel} aria-label="TOPIK practice">
      <Section title="Practice settings" open={open.settings} onToggle={flip("settings")} testId="practice-settings">
        {options ? (
          <>
            <div style={p.label}>Question type</div>
            <div style={p.chips} data-testid="type-picker">
              <button style={chip(typeKey === "")} onClick={() => setTypeKey("")}>Any</button>
              {options.types.map(x => (
                <button key={x.key} title={x.description} style={chip(typeKey === x.key)} onClick={() => setTypeKey(x.key)}>
                  {x.label}<span style={p.ko}>{x.ko}</span>
                </button>
              ))}
            </div>
            <div style={p.label}>Difficulty</div>
            <div style={p.chips} data-testid="level-picker">
              <button style={chip(level === "")} onClick={() => setLevel("")}>Any</button>
              {options.difficulties.map(d => <button key={d.key} style={chip(level === d.key)} onClick={() => setLevel(d.key)}>{d.label}</button>)}
            </div>
          </>
        ) : <p style={t.muted}>The practice options could not be loaded. <button type="button" style={p.retry} onClick={loadOptions}>Try again</button></p>}
        <div style={p.label}>Explanation language</div>
        <div style={p.chips} data-testid="language-picker">
          {LANGUAGES.map(([name, short]) => <button key={name} aria-label={name} title={name} style={chip(lang === name)} onClick={() => setLang(name)}>{short}</button>)}
        </div>
      </Section>

      <Section title={`Strategy Guide${typeInfo ? ` · ${typeInfo.label}` : ""}`} open={open.guide} onToggle={flip("guide")} testId="strategy-guide">
        {!typeKey && <p style={t.muted}>Choose a question type above to see how to solve it.</p>}
        {typeKey && guide.loading && <p style={t.muted}>Writing the guide… (the first time takes a little while)</p>}
        {typeKey && guide.error && <p style={t.muted}>The guide could not be loaded.</p>}
        {guide.data && <GuideContent data={guide.data} />}
      </Section>

      {weak && weak.weaknesses.length > 0 && (
        <Section title="Your weak points" open={open.weak} onToggle={flip("weak")} testId="weak-points">
          <div style={t.muted}>{weak.attempts} quizzes · average {weak.averageScore}%{weak.examSessions > 0 ? ` · ${weak.examSessions} exam sections` : ""}</div>
          {weak.weaknesses.slice(0, 5).map(w => {
            const rowKey = `${w.source || "quiz"}|${w.weakness}`;       // a point without a source is a quiz point
            const isOpen = openWeak === rowKey;
            return (
              <div key={`${w.source}-${w.skillArea}-${w.weakness}`} style={p.weakItem}>
                <button style={p.weakName} aria-expanded={isOpen} title="What is this?" onClick={() => toggleWeak(rowKey)}>
                  <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span> {w.weakness}
                  {w.source === "exam" && <span style={p.examChip}>Exam · {w.skillArea}</span>}
                </button>
                <div style={p.weakRow}>
                  <span style={t.muted}>{w.wrong} wrong / {w.asked} · {w.accuracy}%</span>
                  <button style={p.practiceBtn} onClick={() => onPractice([practiceFocus(w)])}>Practice</button>
                </div>
                {isOpen && (
                  <div style={p.explainBox} data-testid="weak-explanation">
                    {explain.loading && <p style={t.muted}>Writing the explanation… (the first time takes a little while)</p>}
                    {explain.error && <p style={t.muted}>The explanation could not be loaded.</p>}
                    {explain.data && <ExplanationContent data={explain.data} />}
                  </div>
                )}
              </div>
            );
          })}
          <button style={p.allBtn} onClick={() => onPractice(weak.weaknesses.slice(0, 4).map(practiceFocus))}>🎯 Practice my weak points</button>
        </Section>
      )}
    </div>
  );
}

const p = {
  panel: { display: "flex", flexDirection: "column", gap: "10px" },
  section: { border: "1px solid var(--border)", borderRadius: "12px", background: "var(--surface-alt, transparent)", overflow: "hidden" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", width: "100%", padding: "10px 12px", border: "none", background: "transparent", color: "var(--text)", fontWeight: 700, fontSize: "13px", cursor: "pointer", textAlign: "left" },
  sectionBody: { padding: "0 12px 12px" },
  label: { margin: "8px 0 5px", color: "var(--text-muted, #8A8F98)", fontSize: "11px", fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase" },
  retry: { marginLeft: "6px", border: "none", background: "transparent", color: "var(--primary)", fontWeight: 700, cursor: "pointer", padding: 0 },
  select: { width: "100%", marginTop: "8px", padding: "7px 8px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "12.5px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "5px" },
  chip: { padding: "5px 9px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "12px", cursor: "pointer", textAlign: "left" },
  chipOn: { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff", fontWeight: 700 },
  ko: { marginLeft: "5px", fontSize: "10.5px", opacity: 0.7 },
  weakItem: { borderTop: "1px solid var(--border)", padding: "7px 0" },
  weakName: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, color: "var(--text)", fontWeight: 600, fontSize: "12.5px", cursor: "pointer", lineHeight: 1.4 },
  weakRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginTop: "3px" },
  examChip: { display: "inline-block", marginLeft: "6px", padding: "1px 7px", borderRadius: "999px", background: "rgba(59,55,204,.12)", color: "var(--primary)", fontSize: "10.5px", fontWeight: 700 },
  practiceBtn: { padding: "3px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--primary)", fontWeight: 700, fontSize: "12px", cursor: "pointer" },
  explainBox: { padding: "6px 2px 4px 14px" },
  allBtn: { width: "100%", marginTop: "8px", padding: "8px 10px", borderRadius: "10px", border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" },
};
