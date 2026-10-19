import { useState, useRef, useEffect } from "react";
import { useLang } from "../../LanguageContext";
import API from "../../services/api";
import { attachmentKind, isReadableCodeFile } from "./codeHomeworkAttachment";
import { s, apiErrorMessage, loadSessions, saveSessions, newId } from "./coachShared";
import { CoachSidebar } from "./CoachParts";
import CoachAssistantPanel from "./CoachAssistantPanel";
import CoachNotebook from "./CoachNotebook";
import { runCode, restartRuntimes, detectLanguage, canRun, askProgramInput, LANGUAGE_NAMES } from "./codeRunner";

function newCell(code = "") {
  return { id: newId(), code, result: null };
}

// A saved chat comes back with its last cell as it was left (code, output). The student
// needs somewhere to write the next piece, so an empty cell always follows such a cell.
function withEmptyCellAtEnd(cells) {
  const last = cells[cells.length - 1];
  return last && (last.code.trim() || last.result) ? [...cells, newCell()] : cells;
}

// When `ranId` is the last cell and has code, put `spare` (an empty cell) after it.
function withTrailingCell(cells, ranId, spare) {
  const index = cells.findIndex(c => c.id === ranId);
  return index === cells.length - 1 && cells[index].code.trim() ? [...cells, spare] : cells;
}

// Colab-style coach: a notebook of code cells on the left (write, run, see the
// output) and Professor Nova on the right (concept tabs + chat). The homework
// is entered as the first chat message.
export default function CodeHomeworkCoach({ header }) {
  const { lang: uiLang, t } = useLang();
  const [homework, setHomework] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [cells, setCells] = useState(() => [newCell()]);
  // The cell that just appeared after a run; it takes the cursor so the student can keep typing.
  const [focusCellId, setFocusCellId] = useState("");
  const [runningId, setRunningId] = useState("");
  const [loadingPython, setLoadingPython] = useState(false);
  const [lesson, setLesson] = useState(null);
  const [coach, setCoach] = useState(null);
  const [history, setHistory] = useState([]);
  // Earlier problems of this chat (oldest first). The one being worked on is the loose
  // homework/lesson/coach/history above; a new problem moves it here, never discards it.
  const [problems, setProblems] = useState([]);
  const [checkingId, setCheckingId] = useState("");
  const [wrongStreak, setWrongStreak] = useState(0);
  const [trace, setTrace] = useState(null);
  const [review, setReview] = useState(null);
  const [chat, setChat] = useState([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  // Asks the panel to show a result that is not for the newest problem (a visualization of an earlier one).
  const [reveal, setReveal] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(newId);
  const dirtyRef = useRef(false);

  // Cells written for an earlier problem (`old`) stay visible but are never sent to the coach.
  const allCode = cells.filter(cell => !cell.old).map(cell => cell.code).filter(code => code.trim()).join("\n\n");

  // The language follows what is asked and what is written: each cell's own code
  // wins, then the language the coach read from the homework, then Python.
  const fallbackLanguage = lesson?.language || detectLanguage(homework) || "python";
  const languageFor = code => detectLanguage(code) || fallbackLanguage;
  const notebookLanguage = languageFor(allCode);

  async function execute(cell) {
    const language = languageFor(cell.code);
    if (!canRun(language)) {
      return { ok: false, unsupported: true, output: "", error: t("coachRunUnsupported").replace("{lang}", LANGUAGE_NAMES[language] || language) };
    }
    return runCode(language, cell.code, { onLoading: setLoadingPython });
  }
  const busy = Boolean(loading) || asking || Boolean(runningId);

  function buildEntry() {
    const firstQuestion = chat.find(m => m.role === "user")?.text || homework || "…";
    const title = firstQuestion.replace(/\s+/g, " ").slice(0, 48);
    return { id: activeId, title, updatedAt: Date.now(), homework, cells, wrongStreak, lesson, coach, history, problems, trace, chat };
  }

  function upsertSession(entry) {
    setSessions(prev => {
      const next = [entry, ...prev.filter(x => x.id !== entry.id)];
      saveSessions(next);
      return next;
    });
  }

  // Saved after each coach response or code run (not on every keystroke), and
  // again when the student leaves the chat, so unsent code isn't lost.
  useEffect(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    upsertSession(buildEntry());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, coach, trace, history, problems, chat, cells]);

  function leaveCurrentChat() {
    if (lesson || chat.length) upsertSession(buildEntry());
  }

  function resetChat() {
    setActiveId(newId());
    setHomework("");
    setAttachment(null);
    setCells([newCell()]);
    setLesson(null);
    setCoach(null);
    setHistory([]);
    setProblems([]);
    setReview(null);
    setTrace(null);
    setChat([]);
    setWrongStreak(0);
    setAskError("");
    setError("");
    restartRuntimes();
  }

  function newChat() {
    leaveCurrentChat();
    resetChat();
  }

  function openSession(session) {
    if (session.id === activeId) return;
    leaveCurrentChat();
    restartRuntimes();
    setActiveId(session.id);
    setHomework(session.homework || "");
    setAttachment(null);
    setCells(withEmptyCellAtEnd(session.cells?.length ? session.cells : [newCell(session.code || "")]));
    setWrongStreak(session.wrongStreak || 0);
    setLesson(session.lesson || null);
    setCoach(session.coach || null);
    setHistory(session.history || []);
    setProblems(session.problems || []);
    setReview(null);
    setTrace(session.trace || null);
    setChat(session.chat || []);
    setAskError("");
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

  // ---- notebook ----------------------------------------------------------
  function changeCode(id, code) {
    // a verdict belongs to the code that produced it, so editing clears it
    setCells(prev => prev.map(cell => (cell.id === id ? { ...cell, code, verdict: null } : cell)));
  }

  // Judges the notebook right after a run: right or wrong, where, why, and a
  // hint. Needs a homework to judge against; without one the run just shows output.
  // A cell is judged on its own code only, against the problem it was written for (an earlier problem's
  // cell against that problem). Cells are independent: nothing above it is added.
  function scopeOf(cell) {
    if (!cell.old) return { homework, code: cell.code, current: true };
    // cells marked before problem numbers were stored belong to the most recent earlier problem
    const earlier = problems[(cell.problemNo || problems.length) - 1];
    if (!earlier?.homework) return null;
    return { homework: earlier.homework, code: cell.code, current: false };
  }

  async function checkRun(cellId, scope, run) {
    if (!scope || !scope.homework || !scope.code.trim()) return;
    setCheckingId(cellId);
    try {
      // every wrong run in a row earns a more specific hint (levels 1 to 3)
      const { data } = await callCoach({ homework: scope.homework, code: scope.code, action: "check", run, attempt: scope.current ? wrongStreak + 1 : 1 });
      dirtyRef.current = true;
      if (scope.current) setWrongStreak(data.check.isCorrect ? 0 : wrongStreak + 1);
      setCells(prev => prev.map(c => (c.id === cellId ? { ...c, verdict: data.check } : c)));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCheckingId("");
    }
  }

  const runSummary = result => ({ output: result.output, error: result.error, timedOut: Boolean(result.timedOut), notRun: Boolean(result.unsupported) });

  async function runCell(id) {
    const cell = cells.find(c => c.id === id);
    if (!cell || busy) return;
    if (!cell.code.trim()) return;
    setError("");
    setRunningId(id);
    const result = await execute(cell);
    dirtyRef.current = true;
    // Like Colab: running the last cell opens a fresh one below it (only if there is not
    // one already, so re-running while fixing an error doesn't pile up empty cells).
    const next = newCell();
    setCells(prev => withTrailingCell(prev.map(c => (c.id === id ? { ...c, result, verdict: null } : c)), id, next));
    if (!cell.old) setFocusCellId(next.id);
    setRunningId("");
    await checkRun(id, scopeOf(cell), runSummary(result));
  }

  async function runAll() {
    if (busy) return;
    setError("");
    let last = null;
    const outputs = [];
    for (const cell of cells) {
      if (cell.old || !cell.code.trim()) continue;
      setRunningId(cell.id);
      const result = await execute(cell);
      dirtyRef.current = true;
      setCells(prev => prev.map(c => (c.id === cell.id ? { ...c, result, verdict: null } : c)));
      last = { id: cell.id, result };
      outputs.push(result.output);
      if (!result.ok) break;
    }
    setRunningId("");
    if (last) {
      const next = newCell();
      setCells(prev => withTrailingCell(prev, last.id, next));
      setFocusCellId(next.id);
      await checkRun(last.id, { homework, code: allCode, current: true }, { ...runSummary(last.result), output: outputs.join("") });
    }
  }

  // The student says which problem a cell belongs to (also fixes chats saved before cells were
  // tied to a problem). The newest problem's cells are the "current" ones.
  function assignCell(id, no) {
    setCells(prev => prev.map(c => (c.id !== id ? c : no === problems.length + 1
      ? { ...c, old: false, problemNo: undefined, verdict: null }
      : { ...c, old: true, problemNo: no, verdict: null })));
    dirtyRef.current = true;
  }

  function deleteCell(id) {
    setCells(prev => (prev.length > 1 ? prev.filter(c => c.id !== id) : prev));
  }

  function restartRuntime() {
    restartRuntimes();
    setCells(prev => prev.map(c => ({ ...c, result: null })));
  }

  // ---- attachments (homework photo / PDF / source file) -------------------
  async function selectAttachment(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setAskError("Choose a file smaller than 10 MB.");
      return;
    }
    const kind = attachmentKind(file);
    if (isReadableCodeFile(file)) {
      const source = await file.text();
      setCells(prev => (prev.every(c => !c.code.trim()) ? [{ ...prev[0], code: source }, ...prev.slice(1)] : [...prev, newCell(source)]));
      setAttachment({ file, kind, context: `Source file (${file.name}):\n${source.slice(0, 12000)}` });
    } else {
      setAttachment({ file, kind, context: "" });
    }
    setAskError("");
  }

  async function attachmentContext(att) {
    if (!att) return "";
    if (att.context) return att.context;
    const form = new FormData();
    form.append("file", att.file);
    form.append("question", "Extract only the coding homework requirements, code snippets, error messages, and programming concepts. Do not solve the homework or provide a complete answer.");
    const { data } = await API.post("/multimodal/analyze", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return `Attachment (${att.file.name}):\n${data.answer || "No readable coding context found."}`;
  }

  // ---- chat --------------------------------------------------------------
  function callCoach(body) {
    return API.post("/kmate/code-coach", { ...body, language: uiLang });
  }

  async function startHomework(text, { asNew = false } = {}) {
    setAsking(true);
    setAskError("");
    let fullHomework;
    try {
      const fileContext = await attachmentContext(attachment);
      fullHomework = [text, fileContext].filter(Boolean).join("\n\n");
    } catch (err) {
      setAskError(apiErrorMessage(err));
      setAsking(false);
      return false;
    }
    const userMessage = { id: newId(), role: "user", text: text || attachment?.file.name || "" };
    const sentAttachment = attachment;
    setChat(prev => [...prev, userMessage]);
    setAttachment(null);
    try {
      // A new problem starts clean: the notebook still holds the OLD problem's code, so it is
      // not sent (the first hint must be about the new problem), and the old problem is only
      // archived once the new one has really been set up.
      const { data } = await callCoach({ homework: fullHomework, code: asNew ? "" : allCode, action: "start" });
      dirtyRef.current = true;
      if (asNew) {
        setProblems(prev => [...prev, { id: newId(), homework, lesson, coach, history, trace, review }]);
        setHistory([]);
        setReview(null);
        setTrace(null);
        setWrongStreak(0);
        const fresh = newCell();
        setCells(prev => [...prev.filter(c => c.code.trim() || c.result).map(c => (c.old ? c : { ...c, old: true, problemNo: problems.length + 1, verdict: null })), fresh]);
        setFocusCellId(fresh.id);
      }
      setHomework(fullHomework);
      setLesson(data.lesson);
      setCoach(data.coach);
      setChat(prev => [...prev, { id: newId(), role: "assistant", answer: t("coachGuideReady") }]);
      return asNew ? "new" : true;
    } catch (err) {
      setAskError(apiErrorMessage(err));
      setChat(prev => prev.filter(m => m.id !== userMessage.id));
      setAttachment(sentAttachment);
      return false;
    } finally {
      setAsking(false);
    }
  }

  // Returns false on failure, "new" when the message started a new problem, true otherwise.
  // `newProblem` / `forceAsk` are the student's explicit choice; with neither, the coach
  // decides whether the message is a new problem or a question about the current one.
  async function askQuestion(text, { newProblem = false, forceAsk = false } = {}) {
    if (asking) return false;
    if (homework && newProblem) return startHomework(text, { asNew: true });
    if (!homework) {
      if (!text.trim() && !attachment) {
        setAskError(t("coachNeedHomework"));
        return false;
      }
      return startHomework(text);
    }
    setAskError("");
    setAsking(true);
    if (!forceAsk) {
      let isNewProblem = false;
      try {
        const { data } = await callCoach({ homework, code: "", action: "classify", question: text });
        isNewProblem = Boolean(data?.newProblem);
      } catch {
        // can't tell → treat it as an ordinary question
      }
      if (isNewProblem) {
        setAsking(false);
        return startHomework(text, { asNew: true });
      }
    }
    const userMessage = { id: newId(), role: "user", text };
    const turns = [];
    for (let i = 0; i < chat.length - 1; i++) {
      if (chat[i].role === "user" && chat[i + 1].role === "assistant") turns.push({ q: chat[i].text, a: chat[i + 1].answer });
    }
    setChat(prev => [...prev, userMessage]);
    try {
      const { data } = await callCoach({ homework, code: allCode, action: "ask", question: text, chat: turns.slice(-3) });
      dirtyRef.current = true;
      setChat(prev => [...prev, { id: newId(), role: "assistant", ...data.ask }]);
      return true;
    } catch (err) {
      setAskError(apiErrorMessage(err));
      setChat(prev => prev.filter(m => m.id !== userMessage.id));
      return false;
    } finally {
      setAsking(false);
    }
  }

  // ---- hint / check / visualize -----------------------------------------
  // Rebuild the lesson (guide, hint 1, concepts) in the language chosen in Settings.
  // The homework and the student's code stay; the old-language hints are replaced.
  async function regenerateLesson() {
    if (busy || !homework) return;
    setLoading("regenerate");
    setError("");
    try {
      const { data } = await callCoach({ homework, code: allCode, action: "start" });
      dirtyRef.current = true;
      setLesson(data.lesson);
      setCoach(data.coach);
      setHistory([]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading("");
    }
  }

  // Cells marked before problem numbers were stored belong to the most recent earlier problem.
  const cellProblem = c => c.problemNo || problems.length;
  const codeOfProblem = index => cells
    .filter(c => (index === problems.length ? !c.old : c.old && cellProblem(c) === index + 1))
    .map(c => c.code).filter(c => c.trim()).join("\n\n");

  // Python, JavaScript, Java, C and C++ are traced by really running them; a program that reads
  // the keyboard needs its input first.
  function traceOptions(code) {
    const codeLanguage = languageFor(code);
    return { codeLanguage, ...(["java", "c", "cpp"].includes(codeLanguage) ? { stdin: askProgramInput(code) } : {}) };
  }

  // `problemIndex`: the problem whose code to visualize / review (the one the panel is showing);
  // `onlyCode`: visualize just this code (the cell whose menu was used).
  async function runCoach(action, onlyCode, problemIndex = problems.length) {
    if (busy) return;
    const isCurrent = problemIndex === problems.length;
    const targetHomework = isCurrent ? homework : problems[problemIndex]?.homework || "";
    const targetCode = onlyCode ?? codeOfProblem(problemIndex);
    if ((action === "trace" || action === "review") && !targetCode.trim()) {
      setError(isCurrent && cells.some(c => c.old && c.code.trim()) ? t("coachNeedNewCode") : t("coachNeedCode"));
      return;
    }
    setLoading(action);
    setError("");
    try {
      // The next hint has to build on the ones already given, so they go with the request.
      const hints = action === "hint" ? [...history, coach].filter(Boolean).map(h => h.hint) : undefined;
      // ...and so do the "how to start" steps, so each hint is about one of them.
      const { data } = await callCoach({ homework: targetHomework, code: action === "hint" ? allCode : targetCode, action, ...(action === "trace" ? traceOptions(targetCode) : {}), ...(hints ? { hints, steps: lesson?.steps || [] } : {}) });
      dirtyRef.current = true;
      if (action === "trace" || action === "review") {
        const key = action === "trace" ? "trace" : "review";
        const value = action === "trace" ? { ...data.trace, code: targetCode.trim().slice(0, 4000) } : data.review;
        if (isCurrent) (action === "trace" ? setTrace : setReview)(value);
        else {
          setProblems(prev => prev.map((pr, i) => (i === problemIndex ? { ...pr, [key]: value } : pr)));
          setReveal({ tab: action === "trace" ? "visualizer" : "review", index: problemIndex, n: Date.now() });
        }
        return;
      }
      if (coach && data.coach?.hint !== coach.hint) setHistory(h => [...h, coach].slice(-19));
      setCoach(data.coach);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading("");
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#131417" }}>
      <CoachSidebar
        sessions={sessions}
        activeId={activeId}
        busy={busy}
        onNew={newChat}
        onOpen={openSession}
        onDelete={deleteSession}
      />
      <main style={{ flex: 1, minWidth: 0, boxSizing: "border-box", height: "100vh", display: "flex", flexDirection: "column", padding: "24px 32px", background: "#131417" }}>
        {header}
        <div style={s.coachShell}>
          <section style={s.coachWorkPanel}>
            <CoachNotebook
              cells={cells}
              focusCellId={focusCellId}
              language={notebookLanguage}
              onCode={changeCode}
              onRun={runCell}
              onRunAll={runAll}
              onAdd={() => setCells(prev => [...prev, newCell()])}
              onDelete={deleteCell}
              onRestart={restartRuntime}
              onHint={() => runCoach("hint")}
              onAssign={assignCell}
              problemCount={problems.length + 1}
              onVisualize={cell => runCoach("trace", cell.code, cell.old ? cellProblem(cell) - 1 : problems.length)}
              canCoach={Boolean(homework)}
              coachBusy={Boolean(loading) || asking}
              runningId={runningId}
              loadingPython={loadingPython}
              checkingId={checkingId}
            />

            {!homework && <div style={s.coachActions}><span style={s.nextStep}>{t("coachHomeworkRight")}</span></div>}
            {loading && <div style={s.nextStep}>{t("coachPreparing")}</div>}
            {error && <div style={s.coachError}>{error}</div>}
          </section>

          <CoachAssistantPanel
            key={activeId}
            lesson={lesson}
            coach={coach}
            history={history}
            trace={trace}
            homework={homework}
            problems={problems}
            onRegenerate={regenerateLesson}
            regenerating={loading === "regenerate"}
            reveal={reveal}
            onNextHint={() => runCoach("hint")}
            hintLoading={loading === "hint"}
            review={review}
            onReview={index => runCoach("review", undefined, index)}
            reviewLoading={loading === "review"}
            onVisualize={index => runCoach("trace", undefined, index)}
            vizLoading={loading === "trace"}
            sessions={sessions}
            activeId={activeId}
            onOpenSession={openSession}
            onCloseTrace={() => setTrace(null)}
            chat={chat}
            asking={asking}
            askError={askError}
            onAsk={askQuestion}
            homeworkSet={Boolean(homework)}
            attachment={attachment}
            onAttach={selectAttachment}
            onRemoveAttachment={() => setAttachment(null)}
          />
        </div>
      </main>
    </div>
  );
}
