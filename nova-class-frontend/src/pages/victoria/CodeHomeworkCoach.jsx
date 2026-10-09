import { useState, useRef, useEffect } from "react";
import { useLang } from "../../LanguageContext";
import Icon from "../../components/Icon";
import API from "../../services/api";
import { attachmentKind, isReadableCodeFile } from "./codeHomeworkAttachment";
import { s, apiErrorMessage, loadSessions, saveSessions, newId } from "./coachShared";
import { HighlightedCode, TraceView, ColoredCodeBox, CoachSidebar } from "./CoachParts";

// Two-panel homework coach: the left column protects student effort with
// incomplete scaffolds and progressively stronger hints; the right column
// teaches the concept (and shows the step-by-step code visualizer).
export default function CodeHomeworkCoach({ header }) {
  const { lang: uiLang, t } = useLang();
  const [homework, setHomework] = useState("");
  const [code, setCode] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [coach, setCoach] = useState(null);
  const [history, setHistory] = useState([]);
  const [verdict, setVerdict] = useState(null);
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const coachFileRef = useRef();
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(newId);
  const dirtyRef = useRef(false);

  function buildEntry() {
    const title = (homework || attachment?.file.name || "…").replace(/\s+/g, " ").slice(0, 48);
    return { id: activeId, title, updatedAt: Date.now(), homework, code, lesson, coach, history, verdict, trace };
  }

  function upsertSession(entry) {
    setSessions(prev => {
      const next = [entry, ...prev.filter(x => x.id !== entry.id)];
      saveSessions(next);
      return next;
    });
  }

  // Saved after each coach response (not on every keystroke), and again when
  // the student leaves the chat, so unsent code isn't lost.
  useEffect(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    upsertSession(buildEntry());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, coach, verdict, trace, history]);

  function leaveCurrentChat() {
    if (lesson) upsertSession(buildEntry());
  }

  function resetChat() {
    setActiveId(newId());
    setHomework("");
    setCode("");
    setAttachment(null);
    setLesson(null);
    setCoach(null);
    setHistory([]);
    setVerdict(null);
    setTrace(null);
    setError("");
  }

  function newChat() {
    leaveCurrentChat();
    resetChat();
  }

  function openSession(session) {
    if (session.id === activeId) return;
    leaveCurrentChat();
    setActiveId(session.id);
    setHomework(session.homework || "");
    setCode(session.code || "");
    setAttachment(null);
    setLesson(session.lesson || null);
    setCoach(session.coach || null);
    setHistory(session.history || []);
    setVerdict(session.verdict || null);
    setTrace(session.trace || null);
    setError("");
  }

  function deleteSession(id) {
    setSessions(prev => {
      const next = prev.filter(x => x.id !== id);
      saveSessions(next);
      return next;
    });
    if (id === activeId) resetChat();
  }

  async function selectHomeworkAttachment(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose a file smaller than 10 MB.");
      return;
    }

    const kind = attachmentKind(file);
    if (isReadableCodeFile(file)) {
      const source = await file.text();
      setCode(current => current ? `${current}\n\n${source}` : source);
      setAttachment({ file, kind, context: `Source file (${file.name}):\n${source.slice(0, 12000)}` });
    } else {
      setAttachment({ file, kind, context: "" });
    }
    setError("");
  }

  async function attachmentContext() {
    if (!attachment) return "";
    if (attachment.context) return attachment.context;

    const form = new FormData();
    form.append("file", attachment.file);
    form.append("question", "Extract only the coding homework requirements, code snippets, error messages, and programming concepts. Do not solve the homework or provide a complete answer.");
    const { data } = await API.post("/multimodal/analyze", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const context = `Attachment (${attachment.file.name}):\n${data.answer || "No readable coding context found."}`;
    setAttachment(current => current ? { ...current, context } : current);
    return context;
  }

  const hasWritten = code.trim().length > 0;

  async function runCoach(action) {
    if ((!homework.trim() && !code.trim() && !attachment) || loading) {
      setError("Write the homework, paste code, or attach a screenshot/file first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const fileContext = await attachmentContext();
      const fullHomework = [homework, fileContext].filter(Boolean).join("\n\n");
      const { data } = await API.post("/kmate/code-coach", { homework: fullHomework, code, action, language: uiLang });
      dirtyRef.current = true;
      if (action === "check") {
        setVerdict(data.check);
        return;
      }
      if (action === "trace") {
        setTrace({ ...data.trace, code: code.trim().slice(0, 4000) });
        return;
      }
      setVerdict(null);
      setLesson(data.lesson);
      if (coach && data.coach?.hint !== coach.hint) setHistory(h => [coach, ...h].slice(0, 5));
      setCoach(data.coach);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#131417" }}>
      <CoachSidebar
        sessions={sessions}
        activeId={activeId}
        busy={loading}
        onNew={newChat}
        onOpen={openSession}
        onDelete={deleteSession}
      />
      <main style={{ flex: 1, minWidth: 0, boxSizing: "border-box", height: "100vh", display: "flex", flexDirection: "column", padding: "24px 32px", background: "#131417" }}>
        {header}
        <div style={s.coachShell}>
      <section style={s.coachWorkPanel}>
        <div style={s.coachPanelHead}>
          <div>
            <h3 style={s.coachTitle}>Start the homework yourself</h3>
          </div>
          <span style={s.codeOnlyBadge}>CODE HOMEWORK</span>
        </div>

        <label style={s.coachLabel}>Coding homework or question</label>
        <textarea
          style={s.coachBriefInput}
          value={homework}
          onChange={e => setHomework(e.target.value)}
          placeholder="Example: Use a for loop to print numbers 0 to 4."
          rows={3}
        />
        <input
          ref={coachFileRef}
          type="file"
          accept="image/*,.pdf,.docx,.js,.jsx,.ts,.tsx,.py,.java,.c,.cc,.cpp,.cs,.php,.rb,.go,.rs,.html,.css,.sql,.txt"
          onChange={selectHomeworkAttachment}
          style={{ display: "none" }}
        />
        <div style={s.coachAttachmentRow}>
          <button type="button" style={s.coachAttachBtn} onClick={() => coachFileRef.current?.click()} disabled={loading}>
            <Icon name="attachment" size={15} alt="" /> Add photo or file
          </button>
          <span style={s.coachAttachHelp}>Screenshot, PDF, DOCX, or source file</span>
        </div>
        {attachment && (
          <div style={s.coachAttachmentChip}>
            <span><Icon name={attachment.kind === "photo" ? "camera" : "file"} size={14} alt="" /> {attachment.file.name}</span>
            <button type="button" aria-label="Remove attached homework" onClick={() => setAttachment(null)}>×</button>
          </div>
        )}
        {!coach && (
          <>
            <label style={s.coachLabel}>{t("coachYourAttempt")}</label>
            <textarea
              style={s.codeEditor}
              value={code}
              onChange={e => setCode(e.target.value)}
              spellCheck="false"
              placeholder={'for (let i = ___; i < ___; i++) {\n  console.log(___);\n}'}
              rows={10}
            />
          </>
        )}

        {coach && (
          <div style={s.hintCard}>
            <span style={s.coachEyebrow}>{t("coachNextHint")}</span>
            <strong>{coach.hint}</strong>
            {coach.nextStep && <span style={s.nextStep}>{t("coachTryNext")}: {coach.nextStep}</span>}
            <pre style={s.scaffold}><HighlightedCode text={coach.scaffold || ""} /></pre>
            {history.length > 0 && (
              <details style={s.prevHints}>
                <summary>{t("coachPrevHints")} ({history.length})</summary>
                {history.map((h, i) => (
                  <div key={i} style={s.prevHintItem}>
                    <span>{h.hint}</span>
                    <code>{h.scaffold}</code>
                  </div>
                ))}
              </details>
            )}
          </div>
        )}

        {coach && (
          <div style={{ marginTop: "16px" }}>
            <label style={s.coachLabel}>{t("coachYourAttempt")}</label>
            <ColoredCodeBox value={code} onChange={v => { setCode(v); setVerdict(null); }} placeholder={t("coachAnswerPlaceholder")} disabled={loading} />
          </div>
        )}

        <div style={s.coachActions}>
          {!lesson ? (
            <button type="button" style={s.coachPrimaryBtn} onClick={() => runCoach("start")} disabled={loading}>
              {loading ? "Professor Nova is preparing…" : "Start with Professor Nova →"}
            </button>
          ) : (
            !hasWritten ? (
              <span style={s.nextStep}>{t("coachFillFirst")}</span>
            ) : (
            <>
              <button type="button" style={s.coachPrimaryBtn} onClick={() => runCoach("hint")} disabled={loading}>{t("coachGiveHint")}</button>
              <button type="button" style={s.coachSecondaryBtn} onClick={() => runCoach("check")} disabled={loading}>{t("coachCheck")}</button>
              <button type="button" style={s.coachSecondaryBtn} onClick={() => runCoach("trace")} disabled={loading}>{t("coachVisualize")}</button>
            </>
            )
          )}
        </div>
        {loading && lesson && <div style={s.nextStep}>{t("coachChecking")}</div>}
        {verdict && (
          <div style={{ ...s.verdictCard, ...(verdict.isCorrect ? s.verdictOk : s.verdictBad) }} role="status">
            <strong>{verdict.isCorrect ? t("coachCorrect") : t("coachNotYet")}</strong>
            <span>{verdict.feedback}</span>
            {!verdict.isCorrect && verdict.nextHint && <span style={s.nextStep}>{t("coachNextHint")}: {verdict.nextHint}</span>}
          </div>
        )}
        {error && <div style={s.coachError}>{error}</div>}
      </section>

      <section style={s.coachLessonPanel}>
        <div style={s.coachPanelHead}>
          <div>
            <h3 style={{ ...s.coachTitle, color: "#F8FAFC" }}>Understand before you code</h3>
          </div>
          <span style={s.professorBadge}>● READY TO TEACH</span>
        </div>

        {trace && <TraceView key={trace.code + trace.total} trace={trace} t={t} onClose={() => setTrace(null)} />}
        {lesson ? (
          <div style={s.lessonContent}>
            <div style={s.topicPill}>{lesson.topic}</div>
            <p>{lesson.explanation}</p>
            <div style={s.whereUsed}><strong>{t("coachWhereUsed")}</strong><span>{lesson.whereUsed}</span></div>
            <div style={s.exampleBox}>
              <span>{t("coachExampleNote")}</span>
              <pre><HighlightedCode text={lesson.example || ""} /></pre>
            </div>
          </div>
        ) : (
          <div style={s.lessonEmpty}>
            <Icon name="source-code" size={38} alt="" />
            <strong>Your professor will teach the concept here.</strong>
            <span>Paste a coding task on the left, then start the coach.</span>
          </div>
        )}
      </section>
        </div>
      </main>
    </div>
  );
}
