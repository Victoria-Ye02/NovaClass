import { useEffect, useRef, useState } from "react";
import { useLang } from "../../LanguageContext";
import { ColoredCodeBox } from "./CoachParts";
import { LANGUAGE_NAMES, canRun } from "./codeRunner";

// Colab-style notebook: a toolbar, then code cells that each have a Run button
// and show their output directly underneath.
export default function CoachNotebook({ cells, focusCellId, language, onCode, onRun, onRunAll, onAdd, onDelete, onRestart, onHint, onVisualize, onAssign, problemCount = 1, canCoach, coachBusy, runningId, loadingPython, checkingId, children }) {
  const { t } = useLang();
  const busy = Boolean(runningId) || Boolean(checkingId);

  function handleKey(event, cell) {
    if (event.nativeEvent.isComposing) return;
    const el = event.target;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      onRun(cell.id);
      return;
    }
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      onCode(cell.id, cell.code.slice(0, start) + "    " + cell.code.slice(end));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 4; });
      return;
    }
    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // keep the current indentation, and indent one level after ":" or "{"
      event.preventDefault();
      const lineStart = cell.code.lastIndexOf("\n", start - 1) + 1;
      const before = cell.code.slice(lineStart, start);
      const indent = before.match(/^\s*/)[0];
      const extra = /[:{([]\s*$/.test(before) ? "    " : "";
      const insert = "\n" + indent + extra;
      onCode(cell.id, cell.code.slice(0, start) + insert + cell.code.slice(end));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + insert.length; });
    }
  }

  return (
    <div style={n.wrap}>
      <div style={n.toolbar}>
        <button type="button" style={n.toolBtn} onClick={onAdd} disabled={busy}>+ {t("coachAddCode")}</button>
        <button type="button" style={n.toolBtn} onClick={onRunAll} disabled={busy}>▶ {t("coachRunAll")}</button>
        <button type="button" style={n.toolBtn} onClick={onRestart} disabled={busy} title={t("coachRestart")}>↺ {t("coachRestart")}</button>
        <span
          style={{ ...n.langBadge, ...(canRun(language) ? {} : n.langBadgeOff) }}
          title={canRun(language) ? "" : t("coachRunUnsupported").replace("{lang}", LANGUAGE_NAMES[language] || language)}
        >{LANGUAGE_NAMES[language] || language}</span>
      </div>

      {children}

      <div style={n.cells}>
        {cells.map((cell, index) => {
          const isRunning = runningId === cell.id;
          const lines = cell.code.split("\n").length;
          return (
            <div key={cell.id} style={{ ...n.cell }}>
              {cell.old && <div style={n.oldTag}>{cell.problemNo ? t("coachOldCellNo").replace("{n}", cell.problemNo) : t("coachOldCell")}</div>}
              <div style={n.cellRow}>
                <button
                  type="button"
                  style={{ ...n.runBtn, ...(isRunning ? n.runBtnOn : {}) }}
                  onClick={() => onRun(cell.id)}
                  disabled={busy}
                  aria-label={`${t("coachRun")} [${index + 1}]`}
                  title={`${t("coachRun")} (Shift+Enter)`}
                >{isRunning ? "…" : "▶"}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ColoredCodeBox
                    bare
                    lineNumbers
                    rows={Math.min(Math.max(lines, 1), 24)}
                    value={cell.code}
                    onChange={code => onCode(cell.id, code)}
                    onKeyDown={event => handleKey(event, cell)}
                    placeholder={t("coachCellPlaceholder")}
                    disabled={isRunning}
                    autoFocus={cell.id === focusCellId}
                  />
                </div>
                <CellMenu
                  index={index}
                  canDelete={cells.length > 1}
                  hintDisabled={busy || coachBusy || !canCoach || Boolean(cell.old)}
                  vizDisabled={busy || coachBusy || !canCoach || !cell.code.trim()}
                  deleteDisabled={busy}
                  onHint={onHint}
                  onVisualize={() => onVisualize(cell)}
                  onDelete={() => onDelete(cell.id)}
                  problemCount={problemCount}
                  problemNo={cell.old ? (cell.problemNo || problemCount - 1) : problemCount}
                  onAssign={no => onAssign(cell.id, no)}
                />
              </div>
              {isRunning && loadingPython && <div style={n.status}>{t("coachLoadingPython")}</div>}
              {checkingId === cell.id && <div style={n.status}>{t("coachChecking")}</div>}
              {cell.result && (
                <pre style={{ ...n.output, ...(cell.result.ok ? {} : n.outputError) }} aria-label="Output">
                  {cell.result.output}
                  {cell.result.timedOut ? t("coachTimeout") : cell.result.error}
                  {!cell.result.output && !cell.result.error && !cell.result.timedOut ? "✓" : ""}
                </pre>
              )}
              {cell.verdict && (
                <div style={{ ...n.verdict, ...(cell.verdict.isCorrect ? n.verdictOk : n.verdictBad) }} role="status">
                  <strong>{cell.verdict.isCorrect ? `✓ ${t("coachCorrect")}` : `✗ ${t("coachNotYet")}`}</strong>
                  {cell.verdict.feedback && <span>{cell.verdict.feedback}</span>}
                  {!cell.verdict.isCorrect && cell.verdict.where && <span><b>{t("coachWhere")}:</b> <code style={n.inline}>{cell.verdict.where}</code></span>}
                  {!cell.verdict.isCorrect && cell.verdict.why && <span><b>{t("coachWhy")}:</b> {cell.verdict.why}</span>}
                  {!cell.verdict.isCorrect && cell.verdict.nextHint && <span style={n.hintLine}><b>{t("coachHintBox")}{cell.verdict.hintLevel ? ` ${cell.verdict.hintLevel}/3` : ""}:</b> {cell.verdict.nextHint}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Colab-style "⋮" menu in the corner of a cell: next hint, visualize, delete.
function CellMenu({ index, canDelete, hintDisabled, vizDisabled, deleteDisabled, onHint, onVisualize, onDelete, problemCount, problemNo, onAssign }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function onKey(event) {
    if (event.key === "Escape") { setOpen(false); box.current?.querySelector("button")?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...box.current.querySelectorAll('[role^="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
  }

  const pick = (fn) => () => { setOpen(false); fn(); };
  const items = [
    { key: "hint", label: t("coachGiveHint"), disabled: hintDisabled, run: onHint },
    { key: "viz", label: t("coachVisualize"), disabled: vizDisabled, run: onVisualize },
    ...(canDelete ? [{ key: "del", label: t("coachDeleteCell"), disabled: deleteDisabled, run: onDelete, danger: true }] : []),
  ];

  return (
    <div ref={box} style={n.menuWrap} onKeyDown={onKey}>
      <button
        type="button"
        style={n.menuBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("coachCellMenu")} [${index + 1}]`}
        title={t("coachCellMenu")}
        onClick={() => setOpen(v => !v)}
      >⋮</button>
      {open && (
        <div role="menu" style={n.menu}>
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              style={{ ...n.menuItem, ...(item.danger ? n.menuDanger : {}), ...(item.disabled ? n.menuOff : {}) }}
              disabled={item.disabled}
              onClick={pick(item.run)}
            >{item.label}</button>
          ))}
          {problemCount > 1 && (
            <>
              <div style={n.menuSep} role="separator" />
              {Array.from({ length: problemCount }, (_, i) => i + 1).map(no => (
                <button
                  key={no}
                  type="button"
                  role="menuitemradio"
                  aria-checked={problemNo === no}
                  style={n.menuItem}
                  onClick={pick(() => onAssign(no))}
                >{problemNo === no ? "✓ " : ""}{t("coachCellProblem").replace("{n}", no)}</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const n = {
  wrap: { display: "flex", flexDirection: "column", gap: "12px", minHeight: 0 },
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" },
  toolBtn: { padding: "7px 12px", borderRadius: "8px", border: "1px solid #343942", background: "#22252A", color: "#E6E4DF", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  langBadge: { marginLeft: "auto", padding: "5px 10px", borderRadius: "999px", border: "1px solid #36535A", color: "#9DE5D9", fontSize: "11px", fontWeight: 800, letterSpacing: ".4px", cursor: "default" },
  langBadgeOff: { borderColor: "#5C4A3A", color: "#E5B98A" },
  cells: { display: "flex", flexDirection: "column", gap: "12px" },
  cell: { borderRadius: "12px", border: "1px solid #2E3137", background: "#0D0E10" },
  oldTag: { padding: "6px 14px 0", color: "#E5B98A", fontSize: "11px", fontWeight: 700 },
  cellRow: { display: "flex", alignItems: "flex-start", gap: "8px", padding: "10px 10px 10px 10px" },
  runBtn: { width: "34px", height: "34px", marginTop: "2px", borderRadius: "50%", border: "none", background: "#5CC8B8", color: "#0F1717", fontSize: "13px", fontWeight: 800, cursor: "pointer", flexShrink: 0 },
  runBtnOn: { background: "#3A4A48", color: "#9DE5D9" },
  menuWrap: { position: "relative", flexShrink: 0 },
  menuBtn: { width: "28px", height: "28px", border: "none", borderRadius: "7px", background: "transparent", color: "#A9AEB7", fontSize: "18px", fontWeight: 800, lineHeight: 1, cursor: "pointer" },
  menu: { position: "absolute", top: "30px", right: 0, zIndex: 20, minWidth: "190px", display: "flex", flexDirection: "column", padding: "6px", borderRadius: "10px", border: "1px solid #343942", background: "#1B1E23", boxShadow: "0 10px 28px rgba(0,0,0,.45)" },
  menuItem: { padding: "9px 12px", border: "none", borderRadius: "7px", background: "transparent", color: "#E6E4DF", fontSize: "13px", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap" },
  menuSep: { height: "1px", margin: "5px 4px", background: "#343942" },
  menuDanger: { color: "#FCA5A5" },
  menuOff: { opacity: 0.4, cursor: "not-allowed" },
  status: { padding: "0 14px 10px 52px", color: "#9DE5D9", fontSize: "12px" },
  output: { margin: 0, padding: "12px 16px 12px 52px", borderTop: "1px solid #23262B", background: "#0A0B0D", color: "#E6E4DF", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowX: "auto", borderRadius: "0 0 12px 12px" },
  outputError: { color: "#FCA5A5" },
  verdict: { display: "flex", flexDirection: "column", gap: "5px", margin: "0", padding: "12px 16px 12px 52px", borderTop: "1px solid #23262B", fontSize: "13px", lineHeight: 1.6, borderRadius: "0 0 12px 12px" },
  verdictOk: { background: "rgba(74,222,128,.08)", color: "#BBF7D0" },
  verdictBad: { background: "rgba(248,113,113,.08)", color: "#FECACA" },
  inline: { padding: "1px 6px", borderRadius: "5px", background: "rgba(0,0,0,.35)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", color: "#F2F5F7" },
  hintLine: { marginTop: "4px", padding: "8px 10px", borderRadius: "8px", background: "rgba(92,200,184,.10)", color: "#BAE6DF" },
};
