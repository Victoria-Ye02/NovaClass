import { Fragment, useState } from "react";
import Sidebar from "../../components/Sidebar";
import { useLang } from "../../LanguageContext";
import { BOOSTER, SKILLS, TIP_KINDS, GENERAL_TIP, GUIDES } from "./boosterData";
import { subOf, stepsOf, tipOf, kindLabel, guideOf, generalTipOf } from "./boosterText";

// TOPIK Hub › TOPIK Booster: one collapsible box per TOPIK II question type. Opening a box shows a step-by-step solving
// guide and tips (🔍 Context First, ⏰ Tense Check, 💡 Grammar Nuance, ⏱️ Time Limit, ⚠️ Watch Out). The text follows the
// language chosen in Settings (Burmese, otherwise English).
const UI = {
  en: { title: "TOPIK Booster", intro: "Quick solving guides for the main TOPIK II question types. Open a box to see the steps and the expert tips.", all: "All", steps: "How to solve it", tips: "Expert tips", min: "min", target: s => `Target: ${s >= 120 ? `${Math.round(s / 60)} min` : `${s} sec`} per question`, question: "Q" },
  my: { title: "TOPIK Booster", intro: "TOPIK II အဓိကမေးခွန်းအမျိုးအစားတွေအတွက် မြန်မြန်ဖြေနည်း လမ်းညွှန်ပါ။ အကွက်ကိုဖွင့်ပြီး အဆင့်တွေနဲ့ ကျွမ်းကျင်သူ အကြံပြုချက်တွေကို ကြည့်ပါ။", all: "အားလုံး", steps: "ဖြေနည်း အဆင့်ဆင့်", tips: "ကျွမ်းကျင်သူ အကြံပြုချက်", min: "မိနစ်", target: s => `ပစ်မှတ်: မေးခွန်းတစ်ခုကို ${s >= 120 ? `${Math.round(s / 60)} မိနစ်` : `${s} စက္ကန့်`}`, question: "မေး" },
  vi: { title: "TOPIK Booster", intro: "Hướng dẫn giải nhanh cho các dạng câu hỏi chính của TOPIK II. Mở từng ô để xem các bước và mẹo của chuyên gia.", all: "Tất cả", steps: "Cách giải", tips: "Mẹo của chuyên gia", min: "phút", target: s => `Mục tiêu: ${s >= 120 ? `${Math.round(s / 60)} phút` : `${s} giây`} mỗi câu`, question: "Câu" },
  ko: { title: "TOPIK Booster", intro: "TOPIK II 주요 문제 유형별 빠른 풀이 가이드입니다. 상자를 열어 풀이 순서와 전문가 팁을 확인하세요.", all: "전체", steps: "풀이 방법", tips: "전문가 팁", min: "분", target: s => `목표: 문제당 ${s >= 120 ? `${Math.round(s / 60)}분` : `${s}초`}`, question: "문" },
};

// A card above the question types of a skill: an optional time table and a numbered list of key habits.
function GuideCard({ guide, lang }) {
  const ui = UI[lang] || UI.en;
  const text = guideOf(guide, lang);
  return (
    <section style={b.guide} data-testid="booster-guide" data-guide={guide.id}>
      <h3 style={b.guideTitle}><span aria-hidden="true">{guide.icon}</span> {text.title}</h3>
      {guide.table && (
        <table style={b.table} data-testid="guide-table">
          <thead><tr>{text.head.map(h => <th key={h} style={b.th}>{h}</th>)}</tr></thead>
          <tbody>
            {guide.table.rows.map(([, minutes], i) => (
              <tr key={i}><td style={b.td}>{text.rows[i]}</td><td style={b.td}>~ {minutes} {ui.min}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {text.listTitle && <h4 style={b.h}>{text.listTitle}</h4>}
      <ol style={b.steps}>
        {text.list.map((line, i) => (
          <li key={i} style={b.step}>{text.leads[i] && <strong>{text.leads[i]} – </strong>}{line}</li>
        ))}
      </ol>
    </section>
  );
}

function BoosterBox({ item, lang, open, onToggle }) {
  const ui = UI[lang] || UI.en;
  const skill = SKILLS[item.skill];
  const steps = stepsOf(item, lang);

  return (
    <article style={b.box} data-testid="booster-box">
      <button type="button" style={b.head} onClick={onToggle} aria-expanded={open}>
        <span style={b.range}>{ui.question} {item.range}</span>
        <span style={b.headText}>
          <span style={b.ko}>{item.ko}</span>
          <span style={b.sub}>{subOf(item, lang)}</span>
        </span>
        <span style={{ ...b.badge, color: skill.color, background: `${skill.color}1A`, borderColor: `${skill.color}55` }} data-testid="skill-badge">{skill.short}</span>
        {item.targetSeconds && <span style={b.time} data-testid="target-time">⏱️ {ui.target(item.targetSeconds)}</span>}
        <span style={{ ...b.chevron, transform: open ? "rotate(180deg)" : "none" }} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div style={b.body} data-testid="booster-body">
          {steps.length > 0 && (
            <>
              <h4 style={b.h}>{ui.steps}</h4>
              <ol style={b.steps}>
                {steps.map((step, i) => <li key={i} style={b.step}>{step}</li>)}
              </ol>
            </>
          )}

          <h4 style={b.h}>{ui.tips}</h4>
          <div style={b.tips}>
            {item.tips.map((tip, i) => {
              const kind = TIP_KINDS[tip.kind];
              return (
                <div key={i} style={{ ...b.tip, ...(tip.kind === "time" ? b.tipTime : {}) }} data-testid="booster-tip" data-kind={tip.kind}>
                  <span style={b.tipIcon} aria-hidden="true">{kind.icon}</span>
                  <div>
                    <div style={b.tipLabel}>{kindLabel(kind, lang)}</div>
                    <div style={b.tipText}>{tipOf(item, i, lang)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

export default function TopikBooster() {
  const { lang } = useLang();
  const ui = UI[lang] || UI.en;
  const [skill, setSkill] = useState("all");               // all | reading | writing | listening
  const [openId, setOpenId] = useState("");                // one box open at a time keeps the page short

  const items = BOOSTER.filter(x => skill === "all" || x.skill === skill);
  const chip = on => ({ ...b.chip, ...(on ? b.chipOn : {}) });

  return (
    <div style={b.layout}>
      <Sidebar />
      <main style={b.main}>
        <h2 style={b.title}>{ui.title}</h2>
        <p style={b.intro}>{ui.intro}</p>

        <div style={b.general} data-testid="general-tip">
          <span aria-hidden="true">{GENERAL_TIP.icon}</span> {generalTipOf(GENERAL_TIP, lang)}
        </div>

        <div style={b.chips} role="group" aria-label="Section">
          <button type="button" style={chip(skill === "all")} aria-pressed={skill === "all"} onClick={() => setSkill("all")}>{ui.all}</button>
          {Object.entries(SKILLS).map(([key, s]) => (
            <button key={key} type="button" style={chip(skill === key)} aria-pressed={skill === key} onClick={() => setSkill(key)}>{s.label}</button>
          ))}
        </div>

        <div style={b.list} data-testid="booster-list">
          {items.map((item, i) => (
            <Fragment key={item.id}>
              {items.findIndex(x => x.skill === item.skill) === i && GUIDES.filter(g => g.skill === item.skill).map(g => <GuideCard key={g.id} guide={g} lang={lang} />)}
              <BoosterBox item={item} lang={lang} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? "" : item.id)} />
            </Fragment>
          ))}
        </div>
      </main>
    </div>
  );
}

const b = {
  layout: { display: "flex", minHeight: "100vh", background: "var(--bg)" },
  main: { marginLeft: "240px", flex: 1, minWidth: 0, padding: "24px 32px", boxSizing: "border-box" },
  title: { margin: "0 0 6px", color: "var(--text)" },
  intro: { margin: "0 0 16px", color: "var(--text-muted)", fontSize: "14px" },
  general: { margin: "0 0 14px", padding: "10px 14px", borderRadius: "12px", border: "1px solid rgba(245,158,11,.5)", background: "rgba(245,158,11,.08)", color: "var(--text)", fontSize: "13.5px", lineHeight: 1.6 },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" },
  chip: { padding: "6px 14px", borderRadius: "999px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13px", cursor: "pointer" },
  chipOn: { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff", fontWeight: 700 },
  list: { display: "flex", flexDirection: "column", gap: "10px" },
  guide: { padding: "16px 20px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--surface)" },
  guideTitle: { margin: "0 0 10px", color: "var(--text)", fontSize: "16px" },
  table: { width: "100%", borderCollapse: "collapse", marginBottom: "6px", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" },
  th: { textAlign: "left", padding: "9px 14px", background: "var(--surface-alt, transparent)", color: "var(--text-muted)", fontSize: "13px", fontWeight: 700, borderBottom: "1px solid var(--border)" },
  td: { padding: "9px 14px", color: "var(--text)", fontSize: "14px", borderBottom: "1px solid var(--border)" },
  box: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" },
  head: { display: "flex", alignItems: "center", gap: "14px", width: "100%", padding: "14px 18px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", color: "inherit", flexWrap: "wrap" },
  range: { minWidth: "74px", padding: "3px 10px", borderRadius: "8px", background: "rgba(59,55,204,.12)", color: "var(--primary)", fontWeight: 800, fontSize: "13px", textAlign: "center" },
  headText: { flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" },
  ko: { color: "var(--text)", fontWeight: 700, fontSize: "16px" },
  sub: { color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.5 },
  badge: { padding: "2px 10px", borderRadius: "999px", border: "1px solid", fontSize: "12px", fontWeight: 700 },
  time: { color: "var(--text-muted)", fontSize: "12.5px", fontWeight: 600 },
  chevron: { color: "var(--text-muted)", fontSize: "20px", lineHeight: 1, transition: "transform .15s" },
  body: { padding: "4px 20px 20px", borderTop: "1px solid var(--border)" },
  h: { margin: "16px 0 8px", color: "var(--text)", fontSize: "14px" },
  steps: { margin: 0, paddingLeft: "22px", display: "flex", flexDirection: "column", gap: "6px" },
  step: { color: "var(--text)", fontSize: "14px", lineHeight: 1.65 },
  tips: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" },
  tip: { display: "flex", gap: "12px", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface-alt, transparent)" },
  tipTime: { borderColor: "rgba(245,158,11,.5)", background: "rgba(245,158,11,.08)" },
  tipIcon: { fontSize: "20px", lineHeight: 1.3 },
  tipLabel: { marginBottom: "2px", color: "var(--text)", fontWeight: 700, fontSize: "13px" },
  tipText: { color: "var(--text)", fontSize: "13.5px", lineHeight: 1.6, whiteSpace: "pre-line" },
};
