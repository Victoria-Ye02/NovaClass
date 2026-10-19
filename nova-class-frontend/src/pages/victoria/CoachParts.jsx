import { useState, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLang } from "../../LanguageContext";
import { useTheme } from "../../ThemeContext";
import Icon from "../../components/Icon";
import { s } from "./coachShared";

const COLLAPSE_KEY = "kmate_coach_sidebar_collapsed";

const CODE_KEYWORDS = new Set(["for","while","if","else","elif","in","range","return","def","class","import","from","let","const","var","function","int","String","public","static","void","new","true","false","True","False","None","null","and","or","not","print","console","System"]);
const CODE_COLORS = { keyword: "#F28FAD", func: "#7DC4F0", number: "#F6B26B", string: "#A6E3A1", comment: "#6C7086", plain: "#E6E4DF", ident: "#9DE5D9" };

// Tiny language-agnostic tokenizer (Python/JS/Java-ish) — enough to colour
// hints and the student's own code without pulling in a highlighter library.
function codeTokens(text) {
  const re = /(#.*|\/\/.*)|("[^"]*"|'[^']*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)|(\s+|.)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    let type = "plain";
    if (m[1]) type = "comment";
    else if (m[2]) type = "string";
    else if (m[3]) type = "number";
    else if (m[4]) type = CODE_KEYWORDS.has(m[4]) ? "keyword" : "func";
    else if (m[5]) type = CODE_KEYWORDS.has(m[5]) ? "keyword" : "ident";
    out.push({ text: m[0], type });
  }
  return out;
}

export function HighlightedCode({ text }) {
  return codeTokens(text).map((tok, i) => <span key={i} style={{ color: CODE_COLORS[tok.type] }}>{tok.text}</span>);
}

// Step-through execution view: code with the running line highlighted on the
// left, variable values in memory on the right (changed values are marked).
export function TraceView({ trace, t, onClose }) {
  const [idx, setIdx] = useState(0);
  const step = trace.steps[idx];
  const prev = idx > 0 ? trace.steps[idx - 1].memory : {};
  const lines = trace.code.split("\n");
  const names = Object.keys(step.memory);
  return (
    <div style={s.traceCard}>
      <div style={s.traceHead}>
        <span style={s.coachEyebrow}>{t("coachVisualize")}</span>
        <span style={s.traceStep}>{t("coachStep")} {idx + 1} / {trace.total}</span>
        <button type="button" style={s.traceClose} aria-label="close" onClick={onClose}>×</button>
      </div>
      <div style={s.traceBody}>
        <div style={s.tracePane}>
          <span style={s.tracePaneTitle}>{t("coachExecution")}</span>
          <pre style={s.traceCode}>
            {lines.map((line, i) => (
              <div key={i} style={{ ...s.traceLine, ...(i + 1 === step.line ? s.traceLineOn : {}) }}>
                <span style={s.traceNum}>{i + 1}</span>
                <span><HighlightedCode text={line || " "} /></span>
              </div>
            ))}
          </pre>
        </div>
        <div style={s.tracePane}>
          <span style={s.tracePaneTitle}>{t("coachMemory")}</span>
          <div style={s.traceMemory}>
            {names.length === 0 && <span style={s.nextStep}>—</span>}
            {names.map(name => (
              <div key={name} style={{ ...s.traceVar, ...(prev[name] !== step.memory[name] ? s.traceVarChanged : {}) }}>
                <span style={{ color: CODE_COLORS.ident }}>{name}</span>
                <strong>{step.memory[name]}</strong>
              </div>
            ))}
          </div>
          {step.printed && <pre style={s.tracePrinted}>{step.printed}</pre>}
        </div>
      </div>
      <p style={s.traceExplain}>{step.explanation}</p>
      <div style={s.coachActions}>
        <button type="button" style={s.coachSecondaryBtn} disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← {t("coachPrev")}</button>
        <button type="button" style={s.coachPrimaryBtn} disabled={idx === trace.steps.length - 1} onClick={() => setIdx(idx + 1)}>{t("coachNext")} →</button>
      </div>
    </div>
  );
}

// Chat-style answer box: a transparent textarea laid over a coloured <pre>, so
// the student's own code is syntax-coloured while they type.
export function ColoredCodeBox({ value, onChange, onKeyDown, placeholder, rows = 6, disabled, bare, autoFocus, lineNumbers }) {
  const preRef = useRef();
  const gutterRef = useRef();
  const shared = { margin: 0, padding: bare ? "8px 6px" : "14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "14px", lineHeight: 1.7, whiteSpace: "pre", boxSizing: "border-box", border: "none" };
  const height = `${rows * 1.7 * 14 + (bare ? 16 : 28)}px`;
  const lineCount = Math.max(1, String(value || "").split("\n").length);
  const box = (
    <div style={{ position: "relative", flex: 1, minWidth: 0, height, ...(bare ? {} : { background: "#0D0E10", border: "1px solid #343942", borderRadius: "10px" }) }}>
      <pre ref={preRef} aria-hidden="true" style={{ ...shared, position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", color: CODE_COLORS.plain }}>
        {value ? <HighlightedCode text={value} /> : <span style={{ color: "#5C6068" }}>{placeholder}</span>}
        {"\n"}
      </pre>
      <textarea
        className="coach-answer"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={e => {
          if (preRef.current) { preRef.current.scrollTop = e.target.scrollTop; preRef.current.scrollLeft = e.target.scrollLeft; }
          if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop;
        }}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoFocus={autoFocus}
        disabled={disabled}
        style={{ ...shared, position: "absolute", inset: 0, width: "100%", height: "100%", resize: "none", overflow: "auto", background: "transparent", color: "transparent", WebkitTextFillColor: "transparent", caretColor: "#F8FAFC", outline: "none" }}
      />
    </div>
  );
  if (!lineNumbers) return box;
  // Line numbers beside the code, so "line 3" in a hint or an error can be found.
  return (
    <div style={{ display: "flex", height }}>
      <pre ref={gutterRef} aria-hidden="true" data-line-numbers style={{ ...shared, width: "34px", flexShrink: 0, overflow: "hidden", textAlign: "right", color: "#5C6068", userSelect: "none", paddingRight: "10px" }}>
        {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
        {"\n"}
      </pre>
      {box}
    </div>
  );
}

const NAV_ITEMS = [
  { path: "/", icon: "dashboard", key: "dashboard" },
  { path: "/classroom", icon: "graduation-cap", key: "classroom" },
  { path: "/exam", icon: "exam", key: "examMode" },
  { path: "/settings", icon: "settings", key: "settings" },
];

// Replaces the app-wide nav on the Homework Coach page: New Chat, a saved
// history list, and a small footer (page links, profile, theme, logout).
export function CoachSidebar({ sessions, activeId, busy, onNew, onOpen, onDelete }) {
  const { t } = useLang();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const userName = localStorage.getItem("nova_name") || "Student";
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    return saved === null ? window.innerWidth < 900 : saved === "1";
  });

  function toggle() {
    setCollapsed(c => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }

  function logout() {
    ["nova_token", "nova_name", "nova_role", "nova_email"].forEach(key => localStorage.removeItem(key));
    navigate("/login");
  }

  return (
    <aside style={{ ...k.sidebar, width: collapsed ? 68 : 272 }} aria-label="K_MATE chats">
      <style>{`
        .coach-hist:hover{background:#1B1D21}
        .coach-hist:hover .coach-del{opacity:1}
        .coach-del{opacity:0}
        .coach-del:focus-visible{opacity:1}
      `}</style>
      <div style={{ ...k.sbHead, justifyContent: collapsed ? "center" : "flex-start" }}>
        <button
          type="button"
          style={k.iconBtn}
          onClick={toggle}
          aria-label={collapsed ? t("coachExpand") : t("coachCollapse")}
          aria-expanded={!collapsed}
          title={collapsed ? t("coachExpand") : t("coachCollapse")}
        >☰</button>
        {!collapsed && <span style={k.brand}>Nova Class</span>}
      </div>

      <button
        type="button"
        style={collapsed ? k.newChatIcon : k.newChatBtn}
        onClick={onNew}
        disabled={busy}
        title={t("coachNewChat")}
        aria-label={t("coachNewChat")}
      >
        <span style={{ fontSize: "18px", lineHeight: 1 }}>+</span>
        {!collapsed && <span>{t("coachNewChat")}</span>}
      </button>

      {!collapsed ? (
        <>
          <div style={k.histLabel}>{t("coachHistory")}</div>
          <div style={k.histList}>
            {sessions.length === 0 && <span style={k.histEmpty}>{t("coachNoHistory")}</span>}
            {sessions.map(session => (
              <div key={session.id} className="coach-hist" style={{ ...k.histRow, ...(session.id === activeId ? k.histRowOn : {}) }}>
                <button
                  type="button"
                  style={k.histBtn}
                  onClick={() => onOpen(session)}
                  disabled={busy}
                  aria-current={session.id === activeId ? "true" : undefined}
                  title={session.title}
                >{session.title}</button>
                <button
                  type="button"
                  className="coach-del"
                  style={k.histDel}
                  onClick={() => onDelete(session.id)}
                  disabled={busy}
                  aria-label={`${t("coachDeleteChat")}: ${session.title}`}
                >×</button>
              </div>
            ))}
          </div>
        </>
      ) : <div style={{ flex: 1 }} />}

      <nav style={{ ...k.navRow, flexDirection: collapsed ? "column" : "row" }} aria-label="Pages">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.path} to={item.path} end={item.path === "/"} style={k.navLink} title={t(item.key)} aria-label={t(item.key)}>
            <Icon name={item.icon} size={18} alt="" />
          </NavLink>
        ))}
      </nav>

      <div style={{ ...k.sbFoot, flexDirection: collapsed ? "column" : "row" }}>
        <div style={k.avatarUser} title={userName}>{userName[0]?.toUpperCase()}</div>
        {!collapsed && <span style={k.userName}>{userName}</span>}
        <button
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          style={k.themeSwitch}
          onClick={toggleTheme}
          title={theme === "dark" ? t("coachLightMode") : t("coachDarkMode")}
          aria-label={t("coachDarkMode")}
        >
          <span style={{ ...k.themeKnob, left: theme === "dark" ? "15px" : "2px" }} />
        </button>
        {!collapsed && <button type="button" style={k.logoutBtn} onClick={logout}>{t("logout")}</button>}
      </div>
    </aside>
  );
}

const k = {
  sidebar: { flexShrink: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px", padding: "14px 12px", background: "#0F1013", borderRight: "1px solid #23262B", transition: "width .2s ease", overflow: "hidden" },
  sbHead: { display: "flex", alignItems: "center", gap: "10px", minHeight: "40px" },
  iconBtn: { width: "40px", height: "40px", borderRadius: "10px", border: "1px solid transparent", background: "transparent", color: "#C7CBD2", fontSize: "20px", cursor: "pointer", flexShrink: 0 },
  brand: { fontWeight: 700, fontSize: "16px", color: "#F2F5F7", whiteSpace: "nowrap" },
  newChatBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "11px 14px", borderRadius: "12px", border: "1px solid #3C6F68", background: "rgba(92,200,184,.12)", color: "#9DE5D9", fontWeight: 700, fontSize: "14px", cursor: "pointer", boxShadow: "0 0 18px rgba(92,200,184,.12)", whiteSpace: "nowrap" },
  newChatIcon: { width: "44px", height: "44px", alignSelf: "center", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px", border: "1px solid #3C6F68", background: "rgba(92,200,184,.12)", color: "#9DE5D9", cursor: "pointer" },
  histLabel: { padding: "10px 8px 0", color: "#6F7580", fontSize: "11px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" },
  histList: { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" },
  histEmpty: { padding: "8px", color: "#6F7580", fontSize: "13px" },
  histRow: { display: "flex", alignItems: "center", borderRadius: "9px", border: "1px solid transparent" },
  histRowOn: { background: "#1B1D21", border: "1px solid #2E3137" },
  histBtn: { flex: 1, minWidth: 0, padding: "9px 10px", border: "none", background: "transparent", color: "#D4D8DE", fontSize: "13px", textAlign: "left", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  histDel: { width: "28px", height: "28px", border: "none", borderRadius: "7px", background: "transparent", color: "#9A9DA3", fontSize: "16px", cursor: "pointer", flexShrink: 0 },
  navRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", paddingTop: "10px", borderTop: "1px solid #23262B" },
  navLink: { width: "38px", height: "38px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: "#16181C", border: "1px solid #23262B" },
  sbFoot: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", paddingTop: "4px" },
  avatarUser: { width: "34px", height: "34px", borderRadius: "50%", background: "#5CC8B8", color: "#0F1717", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 },
  userName: { flex: 1, minWidth: 0, fontSize: "14px", fontWeight: 600, color: "#E6E4DF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  themeSwitch: { position: "relative", width: "32px", height: "18px", borderRadius: "9px", border: "none", background: "#3A3F46", cursor: "pointer", flexShrink: 0, padding: 0 },
  themeKnob: { position: "absolute", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left .15s" },
  logoutBtn: { border: "none", background: "transparent", color: "#F87171", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
};
