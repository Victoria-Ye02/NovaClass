const STORE_KEY = "kmate_coach_sessions_v2";
const MAX_SESSIONS = 30;

export function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_SESSIONS)));
  } catch {
    // storage full or blocked — history just won't persist
  }
}

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// The backend often responds with a clear reason (expired token, bad request…).
export function apiErrorMessage(err) {
  if (err.response) {
    const status = err.response.status;
    const serverMsg = err.response.data?.error || err.response.data?.message;
    if (status === 401) return "Your session has expired. Please log out and log back in.";
    if (serverMsg) return serverMsg;
    return `Server error (${status}). Please try again.`;
  }
  return "Cannot reach the server. Please check your connection or try again later.";
}

export const s = {
  coachShell: { flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(360px, .9fr)", gap: "16px" },
  coachWorkPanel: { minHeight: 0, overflowY: "auto", padding: "24px", background: "#1B1D21", border: "1px solid #2E3137", borderRadius: "16px", color: "#E6E4DF" },
  coachLessonPanel: { minHeight: 0, overflowY: "auto", padding: "24px", background: "linear-gradient(150deg, #182333, #11181F)", border: "1px solid #284154", borderRadius: "16px", color: "#DDEBFA" },
  coachPanelHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "22px" },
  coachEyebrow: { display: "block", color: "#5CC8B8", fontSize: "10px", fontWeight: 800, letterSpacing: "1.2px", marginBottom: "5px" },
  coachTitle: { margin: 0, fontSize: "20px", lineHeight: 1.2, color: "#F2F5F7" },
  codeOnlyBadge: { padding: "5px 8px", border: "1px solid #36535A", borderRadius: "999px", color: "#5CC8B8", fontSize: "10px", fontWeight: 800, whiteSpace: "nowrap" },
  professorBadge: { padding: "5px 8px", borderRadius: "999px", background: "rgba(34,197,94,.12)", color: "#86EFAC", fontSize: "10px", fontWeight: 800, whiteSpace: "nowrap" },
  coachLabel: { display: "block", marginBottom: "7px", color: "#B8BDC7", fontSize: "12px", fontWeight: 700 },
  coachBriefInput: { boxSizing: "border-box", width: "100%", resize: "vertical", marginBottom: "16px", padding: "12px", borderRadius: "10px", border: "1px solid #343942", background: "#131417", color: "#F2F5F7", fontSize: "13px", lineHeight: 1.5, outline: "none" },
  coachAttachmentRow: { display: "flex", alignItems: "center", gap: "10px", marginTop: "-7px", marginBottom: "16px", flexWrap: "wrap" },
  coachAttachBtn: { display: "inline-flex", alignItems: "center", gap: "7px", border: "1px solid #47616A", borderRadius: "8px", padding: "8px 10px", background: "#20272A", color: "#9DE5D9", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  coachAttachHelp: { color: "#9A9DA3", fontSize: "11px" },
  coachAttachmentChip: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "-7px", marginBottom: "16px", padding: "8px 10px", border: "1px solid #36535A", borderRadius: "8px", background: "rgba(92,200,184,.08)", color: "#BAE6DF", fontSize: "12px", fontWeight: 700 },
  codeEditor: { boxSizing: "border-box", width: "100%", resize: "vertical", padding: "14px", borderRadius: "10px", border: "1px solid #343942", background: "#0D0E10", color: "#BAE6FD", fontSize: "13px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.65, outline: "none" },
  hintCard: { marginTop: "16px", padding: "15px", border: "1px solid #36535A", borderLeft: "3px solid #5CC8B8", borderRadius: "10px", background: "rgba(92,200,184,.08)", display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", lineHeight: 1.5 },
  scaffold: { margin: 0, padding: "12px", borderRadius: "8px", background: "#0D0E10", border: "1px solid #2E3137", color: "#E6E4DF", overflowX: "auto", fontSize: "14px", lineHeight: 1.8 },
  prevHints: { color: "#9A9DA3", fontSize: "12px" },
  prevHintItem: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px", paddingLeft: "10px", borderLeft: "2px solid #2E3137", whiteSpace: "pre-wrap" },
  verdictCard: { display: "flex", flexDirection: "column", gap: "5px", marginTop: "12px", padding: "11px 13px", borderRadius: "10px", fontSize: "13px", lineHeight: 1.5 },
  verdictOk: { border: "1px solid #2F7A58", background: "rgba(74,222,128,.10)", color: "#BBF7D0" },
  verdictBad: { border: "1px solid #8A4B4B", background: "rgba(248,113,113,.10)", color: "#FECACA" },
  traceCard: { marginBottom: "18px", padding: "14px", borderRadius: "12px", border: "1px solid #36535A", background: "#0F1519" },
  traceHead: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" },
  traceStep: { marginLeft: "auto", color: "#9DE5D9", fontSize: "12px", fontWeight: 700 },
  traceClose: { border: "none", background: "transparent", color: "#9A9DA3", fontSize: "18px", cursor: "pointer", lineHeight: 1 },
  traceBody: { display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: "12px" },
  tracePane: { minWidth: 0 },
  tracePaneTitle: { display: "block", marginBottom: "6px", color: "#8A93A0", fontSize: "10px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" },
  traceCode: { margin: 0, padding: "8px 0", borderRadius: "8px", background: "#0D0E10", border: "1px solid #2E3137", overflowX: "auto", fontSize: "13px", lineHeight: 1.7, color: "#E6E4DF" },
  traceLine: { display: "flex", gap: "10px", padding: "0 10px", borderLeft: "3px solid transparent", whiteSpace: "pre" },
  traceLineOn: { background: "rgba(92,200,184,.16)", borderLeft: "3px solid #5CC8B8" },
  traceNum: { width: "16px", flexShrink: 0, textAlign: "right", color: "#5C6068" },
  traceMemory: { display: "flex", flexDirection: "column", gap: "6px" },
  traceVar: { display: "flex", justifyContent: "space-between", gap: "10px", padding: "7px 10px", borderRadius: "8px", background: "#161B20", border: "1px solid #2E3137", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px", color: "#E6E4DF" },
  traceVarChanged: { borderColor: "#5CC8B8", background: "rgba(92,200,184,.14)" },
  tracePrinted: { margin: "8px 0 0", padding: "8px 10px", borderRadius: "8px", background: "#0D0E10", border: "1px dashed #3A4048", color: "#A6E3A1", fontSize: "12px", whiteSpace: "pre-wrap" },
  traceExplain: { margin: "12px 0 0", color: "#DDEBFA", fontSize: "13px", lineHeight: 1.6 },
  nextStep: { color: "#B8BDC7", fontSize: "12px" },
  coachActions: { display: "flex", gap: "9px", flexWrap: "wrap", marginTop: "18px" },
  coachPrimaryBtn: { border: "none", borderRadius: "9px", padding: "11px 14px", background: "#5CC8B8", color: "#0F1717", fontWeight: 800, fontSize: "13px", cursor: "pointer" },
  coachSecondaryBtn: { border: "1px solid #4C5964", borderRadius: "9px", padding: "10px 13px", background: "transparent", color: "#D8E0E8", fontWeight: 700, fontSize: "13px", cursor: "pointer" },
  coachError: { marginTop: "12px", padding: "9px 11px", borderRadius: "8px", background: "rgba(239,68,68,.12)", color: "#FCA5A5", fontSize: "12px" },
  lessonContent: { display: "flex", flexDirection: "column", gap: "18px", fontSize: "14px", lineHeight: 1.7 },
  topicPill: { alignSelf: "flex-start", padding: "5px 10px", borderRadius: "999px", color: "#67E8F9", background: "rgba(103,232,249,.1)", border: "1px solid rgba(103,232,249,.28)", fontSize: "12px", fontWeight: 800 },
  whereUsed: { display: "flex", flexDirection: "column", gap: "4px", padding: "13px", borderRadius: "10px", background: "rgba(148,163,184,.08)", border: "1px solid rgba(148,163,184,.18)" },
  exampleBox: { padding: "13px", borderRadius: "10px", background: "#0B1118", border: "1px solid #284154", color: "#BAE6FD", fontSize: "12px" },
  lessonEmpty: { height: "70%", minHeight: "280px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: "10px", color: "#9CB2C8", fontSize: "13px" },
};
