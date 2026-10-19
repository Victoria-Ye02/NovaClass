import { useState, useRef, useEffect } from "react";
import { useLang } from "../../LanguageContext";
import Icon from "../../components/Icon";
import { s } from "./coachShared";
import { HighlightedCode, TraceView } from "./CoachParts";
import { LANGUAGE_NAMES, lessonMatchesLanguage } from "./coachLanguage";

const SEVERITY_COLOR = { info: "#7DD3FC", warn: "#FCD34D", error: "#FCA5A5" };
const TABS = ["hint", "concepts", "visualizer", "review", "chat"];

// Right-hand panel, like Colab's: ONE menu button (the list icon) opens a dropdown of
// the helpers — Step-by-step Hints · Core Concepts · Code Visualizer · Code Review · Chat & History —
// and the bar beside it names the one that is open. A row of four tabs never fit this
// narrow panel (Burmese labels are long), so the last one used to be hidden.
export default function CoachAssistantPanel({
  lesson, coach, history, trace, onCloseTrace, onVisualize, vizLoading, homework, problems = [], reveal, onRegenerate, regenerating, onNextHint, hintLoading, review, onReview, reviewLoading,
  chat, asking, askError, onAsk, homeworkSet, attachment, onAttach, onRemoveAttachment,
  sessions, activeId, onOpenSession,
}) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState(homeworkSet ? "hint" : "chat");
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openQuestions, setOpenQuestions] = useState(() => new Set());
  // Problems whose guide and hints are folded away (all open by default).
  const [folded, setFolded] = useState(() => new Set());
  // After a first problem, a message is either a question about it or a new problem (the old one
  // moves up, it is never discarded).
  // `mode` is the student's explicit choice for the next message: "ask" (about this problem),
  // "new" (a new problem), or null — then the coach works out which one it is.
  const [mode, setMode] = useState(null);
  const hintBodyRef = useRef();
  const menuRef = useRef();
  const feedRef = useRef();
  const fileRef = useRef();

  // Jump to the Visualizer when a new trace arrives (state adjusted during
  // render, as React recommends, instead of in an effect).
  // Which problem the Hints / Concepts / Visualizer / Review sections show (one problem at a
  // time, switched with the arrows). null = the newest.
  const [viewed, setViewed] = useState(null);
  // The notebook asked to show a result for an earlier problem (e.g. a cell's "visualize").
  const [seenReveal, setSeenReveal] = useState(reveal);
  if (reveal !== seenReveal) {
    setSeenReveal(reveal);
    if (reveal) { setTab(reveal.tab); setViewed(reveal.index); }
  }
  const [seenTrace, setSeenTrace] = useState(trace);
  if (trace !== seenTrace) {
    setSeenTrace(trace);
    if (trace) { setTab("visualizer"); setViewed(null); }
  }

  // A new hint (asked for here or from the button beside the notebook) opens the
  // Hints section and scrolls to it, directly under the earlier ones.
  const [seenHints, setSeenHints] = useState(history.length);
  if (history.length !== seenHints) {
    setSeenHints(history.length);
    if (history.length > seenHints) { setTab("hint"); setViewed(null); setFolded(prev => { const next = new Set(prev); next.delete("active"); return next; }); }
  }
  const [seenProblems, setSeenProblems] = useState(problems.length);
  if (problems.length !== seenProblems) {
    setSeenProblems(problems.length);
    setViewed(null);
    if (problems.length > seenProblems) setTab("hint");
  }
  const newestHintRef = useRef();
  const newestBlockRef = useRef();
  const previousCounts = useRef({ problems: problems.length });
  useEffect(() => {
    const before = previousCounts.current;
    previousCounts.current = { problems: problems.length };
    if (tab !== "hint") return;
    // a new problem: show its start (question, guide, first hint); otherwise the newest hint
    if (problems.length > before.problems) newestBlockRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    else if (history.length > 0) newestHintRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [history.length, problems.length, tab]);

  const pageCount = problems.length + 1;
  const shown = Math.min(viewed ?? pageCount - 1, pageCount - 1);
  function turnPage(direction) {
    setViewed(Math.min(Math.max(shown + direction, 0), pageCount - 1));
    hintBodyRef.current?.scrollTo?.({ top: 0 });
  }

  useEffect(() => {
    if (!menuOpen) return undefined;
    const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitemradio"]') || [])];
    (items().find(el => el.getAttribute("aria-checked") === "true") || items()[0])?.focus();
    const onPointer = event => { if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false); };
    const onKey = event => {
      if (event.key === "Escape") { setMenuOpen(false); menuRef.current?.querySelector("button")?.focus(); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const list = items();
      if (!list.length) return;
      event.preventDefault();
      const at = list.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
      list[next].focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  useEffect(() => {
    if (tab === "chat") feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, asking, tab]);

  async function submit(text, { forceAsk = false } = {}) {
    const question = text.trim();
    if ((!question && !attachment) || asking) return;
    const wasFirst = !homeworkSet;
    const choice = homeworkSet ? (forceAsk ? "ask" : mode) : null;
    setDraft("");
    const ok = await (choice === "new" ? onAsk(question, { newProblem: true }) : choice === "ask" ? onAsk(question, { forceAsk: true }) : onAsk(question));
    if (ok === false) setDraft(current => current || question);
    else if (wasFirst || ok === "new" || choice === "new") { setTab("hint"); setMode(null); }
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  }

  const conceptsOf = l => (l?.concepts?.length
    ? l.concepts
    : l ? [{ name: l.topic, what: l.explanation, how: l.whereUsed, example: l.example }] : []);
  const labels = { hint: t("coachTabHint"), concepts: t("coachTabConcepts"), visualizer: t("coachTabViz"), review: t("coachTabReview"), chat: t("coachTabChat") };
  // A lesson saved in another language than Settings now would mix languages as new hints
  // arrive, so offer to rewrite it (the student decides — it replaces the hints so far).
  // Every problem of this chat, oldest first; the one being worked on is last.
  const problemList = [...problems, { id: "active", homework, lesson, coach, history }];
  const page = problemList[shown];
  const onNewestPage = shown === problemList.length - 1;
  const concepts = conceptsOf(page.lesson);
  const pageTrace = onNewestPage ? trace : page.trace;
  const pageReview = onNewestPage ? review : page.review;
  const langName = LANGUAGE_NAMES[lang] || lang;
  const languageNotice = lesson && onRegenerate && !lessonMatchesLanguage(lesson, coach, lang) && (
    <div style={p.langNotice} role="status">
      <span>{t("coachLangMismatch").replace("{lang}", langName)}</span>
      <button type="button" style={{ ...p.vizBtn, opacity: regenerating ? 0.5 : 1, alignSelf: "flex-start" }} onClick={onRegenerate} disabled={regenerating}>
        {regenerating ? t("coachPreparing") : t("coachRegenerate").replace("{lang}", langName)}
      </button>
    </div>
  );
  const suggestions = [t("coachSuggestStart"), t("coachSuggestFirst"), t("coachSuggestStuck")];
  const recent = sessions.filter(session => session.id !== activeId).slice(0, 5);

  return (
    <section style={p.panel}>
      <div style={p.bar} ref={menuRef}>
        <button
          type="button"
          style={{ ...p.menuBtn, ...(menuOpen ? p.menuBtnOn : {}) }}
          onClick={() => setMenuOpen(open => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("coachMenuTitle")}
          title={t("coachMenuTitle")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="6" r="1.8" /><circle cx="5" cy="12" r="1.8" /><circle cx="5" cy="18" r="1.8" />
            <rect x="9.5" y="5" width="11" height="2" rx="1" /><rect x="9.5" y="11" width="11" height="2" rx="1" /><rect x="9.5" y="17" width="11" height="2" rx="1" />
          </svg>
        </button>
        <span style={p.barTitle} aria-live="polite">{labels[tab]}</span>
        {tab !== "chat" && lesson && (
          <span style={p.arrows}>
            <button type="button" style={p.arrowBtn} onClick={() => turnPage(-1)} disabled={shown === 0} aria-label={t("coachPrevProblem")} title={t("coachPrevProblem")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
            </button>
            <span style={p.pageNo} aria-live="polite">{shown + 1}/{pageCount}</span>
            <button type="button" style={p.arrowBtn} onClick={() => turnPage(1)} disabled={shown === pageCount - 1} aria-label={t("coachNextProblem")} title={t("coachNextProblem")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </span>
        )}
        {menuOpen && (
          <div style={p.menu} role="menu" aria-label={t("coachMenuTitle")}>
            <div style={p.menuHead}>{t("coachMenuTitle")}</div>
            {TABS.map(key => (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={tab === key}
                style={{ ...p.menuItem, ...(tab === key ? p.menuItemOn : {}) }}
                onClick={() => { setTab(key); setMenuOpen(false); }}
              >
                <span>{labels[key]}</span>
                {tab === key && <span aria-hidden="true" style={p.menuCheck}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "hint" && (
        <div style={p.body} ref={hintBodyRef}>
          {!lesson ? (
            <div style={p.empty}>
              <Icon name="source-code" size={34} alt="" />
              <span>{t("coachTutorEmpty")}</span>
              <button type="button" style={p.linkBtn} onClick={() => setTab("chat")}>{t("coachGoChat")}</button>
            </div>
          ) : (
            problemList.map((problem, index) => {
              if (index !== shown) return null;
              const isNewest = index === problemList.length - 1;
              const many = problemList.length > 1;
              const questionOpen = openQuestions.has(index);
              const isFolded = folded.has(problem.id);
              const hints = problem.coach ? [...(problem.history || []), problem.coach] : [];
              return (
                <div
                  key={problem.id}
                  data-problem-block
                  ref={isNewest ? newestBlockRef : undefined}
                  style={p.problemBlock}
                >
                  {problem.homework && (
                    // Pinned to the top while this problem's hints scroll, so the student always
                    // knows which question the hints belong to.
                    <div style={{ ...p.question, ...(index === 0 ? p.questionFirst : {}) }}>
                      <span style={s.coachEyebrow}>{many ? t("coachProblemNum").replace("{n}", index + 1) : t("coachQuestionTitle")}</span>
                      <div style={questionOpen ? p.questionTextOpen : p.questionText}>{problem.homework}</div>
                      {(problem.homework.length > 150 || problem.homework.split("\n").length > 3) && (
                        <button
                          type="button"
                          style={p.questionToggle}
                          aria-expanded={questionOpen}
                          onClick={() => setOpenQuestions(prev => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; })}
                        >
                          {questionOpen ? t("coachShowLess") : t("coachShowMore")}
                        </button>
                      )}
                    </div>
                  )}

                  {isNewest && languageNotice}

                  {problem.lesson && (
                    <button
                      type="button"
                      style={p.foldBtn}
                      aria-expanded={!isFolded}
                      onClick={() => setFolded(prev => { const next = new Set(prev); if (next.has(problem.id)) next.delete(problem.id); else next.add(problem.id); return next; })}
                    >
                      <span aria-hidden="true" style={{ display: "inline-block", transform: isFolded ? "rotate(-90deg)" : "none" }}>▾</span> {t("coachFoldHints")}
                    </button>
                  )}

                  {!isFolded && problem.lesson?.steps?.length > 0 && (
                    <div style={p.card}>
                      <span style={s.coachEyebrow}>{t("coachGuideTitle")}</span>
                      <ol style={p.steps}>
                        {problem.lesson.steps.map((step, i) => <li key={i}>{step}</li>)}
                      </ol>
                    </div>
                  )}

                  {!isFolded && hints.map((h, i, all) => {
                    const newestHint = i === all.length - 1;
                    return (
                      <div key={`${i}-${h.hint}`} ref={isNewest && newestHint ? newestHintRef : undefined} style={{ ...p.hintBox,  }}>
                        <span style={s.coachEyebrow}>{t("coachHintNum").replace("{n}", i + 1)}</span>
                        {newestHint && isNewest ? <strong style={p.hintText}>{h.hint}</strong> : <span style={p.hintText}>{h.hint}</span>}
                        {newestHint && isNewest && h.nextStep && <span style={s.nextStep}>{t("coachTryNext")}: {h.nextStep}</span>}
                        {h.scaffold && <pre style={s.scaffold}><HighlightedCode text={h.scaffold} /></pre>}
                      </div>
                    );
                  })}

                  {isNewest && coach && (
                    <div style={p.nextHintRow}>
                      <button
                        type="button"
                        style={{ ...p.vizBtn, opacity: hintLoading ? 0.5 : 1 }}
                        onClick={onNextHint}
                        disabled={hintLoading}
                      >{t("coachGiveHint")}</button>
                      <button type="button" style={p.ghostBtn} onClick={() => { setMode("new"); setTab("chat"); }}>＋ {t("coachModeNew")}</button>
                      {hintLoading && <span style={p.thinking}>{t("coachPreparing")}</span>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "concepts" && (
        <div style={p.body}>
          {!lesson ? (
            <div style={p.empty}>
              <Icon name="source-code" size={34} alt="" />
              <span>{t("coachTutorEmpty")}</span>
              <button type="button" style={p.linkBtn} onClick={() => setTab("chat")}>{t("coachGoChat")}</button>
            </div>
          ) : (
            <>
              {languageNotice}
              {concepts.map((concept, i) => (
                <div key={`${concept.name}-${i}`} style={p.card}>
                  <div style={s.topicPill}>{concept.name}</div>
                  {/* Problem first: why it is worth learning, and how painful it is without it. */}
                  {concept.why && <div style={p.whyBlock}><strong>{t("coachConceptWhy")}</strong><span>{concept.why}</span></div>}
                  {concept.before && (
                    <div style={s.exampleBox}>
                      <span>{t("coachConceptBefore")}</span>
                      <pre><HighlightedCode text={concept.before} /></pre>
                    </div>
                  )}
                  {concept.what && <div style={p.block}><strong>{t("coachWhat")}</strong><span>{concept.what}</span></div>}
                  {concept.how && <div style={p.block}><strong>{t("coachHow")}</strong><span>{concept.how}</span></div>}
                  {concept.example && (
                    <div style={s.exampleBox}>
                      <span>{concept.before ? t("coachConceptAfter") : t("coachExampleNote")}</span>
                      <pre><HighlightedCode text={concept.example} /></pre>
                    </div>
                  )}
                  {concept.mistake && <div style={p.mistakeBlock}><strong>{t("coachConceptMistake")}</strong><span>{concept.mistake}</span></div>}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "visualizer" && (
        <div style={p.body}>
          <div style={p.vizBar}>
            <button type="button" style={{ ...p.vizBtn, opacity: vizLoading || !homeworkSet ? 0.5 : 1 }} onClick={() => onVisualize(shown)} disabled={vizLoading || !homeworkSet}>{t("coachVisualize")}</button>
            {vizLoading && <span style={p.thinking}>{t("coachPreparing")}</span>}
          </div>
          {pageTrace ? (
            <TraceView key={pageTrace.code + pageTrace.total} trace={pageTrace} t={t} onClose={onCloseTrace} />
          ) : (
            <div style={p.empty}>
              <Icon name="source-code" size={34} alt="" />
              <span>{t("coachVizEmpty")}</span>
            </div>
          )}
        </div>
      )}

      {tab === "review" && (
        <div style={p.body}>
          <div style={p.vizBar}>
            <button type="button" style={{ ...p.vizBtn, opacity: reviewLoading || !homeworkSet ? 0.5 : 1 }} onClick={() => onReview(shown)} disabled={reviewLoading || !homeworkSet}>{t("coachReviewBtn")}</button>
            {reviewLoading && <span style={p.thinking}>{t("coachPreparing")}</span>}
          </div>
          {pageReview ? (
            <>
              <div style={p.card}>
                <span style={s.coachEyebrow}>{t("coachReviewScore")}</span>
                <div style={p.scoreRow}>
                  <strong style={{ ...p.score, color: pageReview.score >= 80 ? "#86EFAC" : pageReview.score >= 50 ? "#FCD34D" : "#FCA5A5" }}>{pageReview.score}</strong>
                  <span style={p.scoreMax}>/ 100</span>
                </div>
                {pageReview.summary && <span>{pageReview.summary}</span>}
              </div>
              {pageReview.praise.length > 0 && (
                <div style={p.card}>
                  <span style={s.coachEyebrow}>{t("coachReviewPraise")}</span>
                  <ul style={p.steps}>{pageReview.praise.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              )}
              <span style={{ ...s.coachEyebrow, marginBottom: 0 }}>{t("coachReviewIssues")}</span>
              {pageReview.issues.length === 0 && <div style={p.card}>{t("coachReviewClean")}</div>}
              {pageReview.issues.map((issue, i) => (
                <div key={i} style={{ ...p.card, borderColor: SEVERITY_COLOR[issue.severity] }}>
                  <div style={p.issueHead}>
                    <span style={{ ...p.tag, color: SEVERITY_COLOR[issue.severity], borderColor: SEVERITY_COLOR[issue.severity] }}>{issue.category}</span>
                    {issue.line > 0 && <span style={p.lineTag}>{t("coachReviewLine")} {issue.line}</span>}
                  </div>
                  <span>{issue.message}</span>
                  {issue.suggestion && <pre style={s.scaffold}><HighlightedCode text={issue.suggestion} /></pre>}
                </div>
              ))}
            </>
          ) : (
            <div style={p.empty}>
              <Icon name="source-code" size={34} alt="" />
              <span>{t("coachReviewEmpty")}</span>
            </div>
          )}
        </div>
      )}

      {tab === "chat" && (
        <>
          <div ref={feedRef} style={p.body}>
            {chat.length === 0 && !asking && (
              <div style={p.empty}>
                <Icon name="source-code" size={34} alt="" />
                <span>{homeworkSet ? t("coachChatEmpty") : t("coachChatEmptyFirst")}</span>
                {recent.length > 0 && (
                  <div style={p.recent}>
                    <span style={s.coachEyebrow}>{t("coachRecentChats")}</span>
                    {recent.map(session => (
                      <button key={session.id} type="button" style={p.recentBtn} onClick={() => onOpenSession(session)} title={session.title}>{session.title}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {chat.map(m => (
              m.role === "user" ? (
                <div key={m.id} style={p.rowRight}><div style={p.userBubble}>{m.text}</div></div>
              ) : (
                <div key={m.id} style={p.rowLeft}>
                  <div style={p.avatar}><Icon name="source-code" size={15} alt="" /></div>
                  <div style={p.assistantCol}>
                    <div style={p.answer}>{m.answer.replace(/\s+(?=\d+\.\s)/g, "\n")}</div>
                    {(m.hint || m.hintCode) && (
                      <div style={p.hintBox}>
                        <span style={s.coachEyebrow}>{t("coachHintBox")}</span>
                        {m.hint && <span style={p.hintText}>{m.hint}</span>}
                        {m.hintCode && <pre style={s.scaffold}><HighlightedCode text={m.hintCode} /></pre>}
                      </div>
                    )}
                  </div>
                </div>
              )
            ))}
            {asking && (
              <div style={p.rowLeft}>
                <div style={p.avatar}><Icon name="source-code" size={15} alt="" /></div>
                <span style={p.thinking}>{t("coachPreparing")}</span>
              </div>
            )}
          </div>

          <div style={p.composerArea}>
            {askError && <div style={{ ...s.coachError, marginTop: 0, marginBottom: "8px" }} role="alert">{askError}</div>}
            {homeworkSet && (
              <div style={p.modeRow} role="group" aria-label={t("coachModeNew")}>
                <button type="button" style={{ ...p.modeChip, ...(mode === "ask" ? p.modeChipOn : {}) }} aria-pressed={mode === "ask"} onClick={() => setMode(current => (current === "ask" ? null : "ask"))}>{t("coachModeAsk")}</button>
                <button type="button" style={{ ...p.modeChip, ...(mode === "new" ? p.modeChipOn : {}) }} aria-pressed={mode === "new"} onClick={() => setMode(current => (current === "new" ? null : "new"))}>＋ {t("coachModeNew")}</button>
                {mode === null && <span style={p.modeHint}>{t("coachAutoHint")}</span>}
              </div>
            )}
            {!asking && homeworkSet && mode !== "new" && (
              <div style={p.pills}>
                {suggestions.map(text => (
                  <button key={text} type="button" style={p.pill} onClick={() => submit(text, { forceAsk: true })}>{text}</button>
                ))}
              </div>
            )}
            {attachment && (
              <div style={p.attachChip}>
                <span><Icon name={attachment.kind === "photo" ? "camera" : "file"} size={14} alt="" /> {attachment.file.name}</span>
                <button type="button" style={p.attachX} aria-label="Remove attachment" onClick={onRemoveAttachment}>×</button>
              </div>
            )}
            <div style={p.composer}>
              {(!homeworkSet || mode === "new") && (
                <>
                  <input ref={fileRef} type="file" accept="image/*,.pdf,.docx,.js,.jsx,.ts,.tsx,.py,.java,.c,.cc,.cpp,.cs,.php,.rb,.go,.rs,.html,.css,.sql,.txt" onChange={onAttach} style={{ display: "none" }} />
                  <button type="button" style={p.attach} onClick={() => fileRef.current?.click()} disabled={asking} aria-label={t("coachAttach")} title={t("coachAttach")}>
                    <Icon name="attachment" size={17} alt="" />
                  </button>
                </>
              )}
              <textarea
                style={p.input}
                value={draft}
                rows={homeworkSet && mode !== "new" ? 2 : 3}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={homeworkSet && mode !== "new" ? t("coachAskPlaceholder") : t("coachHomeworkHere")}
                aria-label={homeworkSet && mode !== "new" ? t("coachAskPlaceholder") : t("coachHomeworkHere")}
                disabled={asking}
              />
              <button type="button" style={{ ...p.send, opacity: asking || (!draft.trim() && !attachment) ? 0.45 : 1 }} onClick={() => submit(draft)} disabled={asking || (!draft.trim() && !attachment)} aria-label={t("coachSend")} title={t("coachSend")}>➤</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const p = {
  panel: { minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", padding: "10px 18px 16px", background: "linear-gradient(150deg, #182333, #11181F)", border: "1px solid #284154", borderRadius: "16px", color: "#DDEBFA", overflow: "hidden" },
  bar: { position: "relative", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, paddingBottom: "10px", borderBottom: "1px solid #284154" },
  menuBtn: { width: "40px", height: "40px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #2F4558", borderRadius: "12px", background: "#1B2A3A", color: "#DDEBFA", cursor: "pointer" },
  menuBtnOn: { background: "#22394D", borderColor: "#5CC8B8", color: "#9DE5D9" },
  barTitle: { minWidth: 0, fontSize: "14px", fontWeight: 700, lineHeight: 1.35, color: "#F8FAFC" },
  menu: { position: "absolute", top: "50px", left: 0, zIndex: 20, minWidth: "260px", maxWidth: "calc(100% - 4px)", padding: "6px", borderRadius: "14px", border: "1px solid #2F4558", background: "#12202C", boxShadow: "0 14px 34px rgba(0,0,0,.55)" },
  menuHead: { padding: "8px 12px 6px", fontSize: "11.5px", fontWeight: 700, letterSpacing: ".5px", color: "#6F8499" },
  menuItem: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "11px 12px", border: "none", borderRadius: "10px", background: "transparent", color: "#DDEBFA", fontSize: "13.5px", fontWeight: 600, lineHeight: 1.35, textAlign: "left", cursor: "pointer" },
  menuItemOn: { background: "rgba(92,200,184,.12)", color: "#F8FAFC" },
  menuCheck: { color: "#5CC8B8", fontWeight: 800 },
  body: { flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 2px", display: "flex", flexDirection: "column", gap: "14px", fontSize: "14px", lineHeight: 1.7 },
  empty: { margin: "auto", maxWidth: "360px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", textAlign: "center", color: "#8FA3B8", fontSize: "13px" },
  linkBtn: { padding: "8px 14px", borderRadius: "999px", border: "1px solid #36535A", background: "rgba(92,200,184,.10)", color: "#9DE5D9", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  recent: { width: "100%", display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px", textAlign: "left" },
  recentBtn: { padding: "9px 12px", borderRadius: "10px", border: "1px solid #2F4558", background: "rgba(255,255,255,.03)", color: "#BFD0E0", fontSize: "13px", textAlign: "left", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  card: { display: "flex", flexDirection: "column", gap: "10px", padding: "16px", borderRadius: "14px", background: "rgba(255,255,255,.04)", border: "1px solid #284154" },
  steps: { margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", color: "#E6EEF7" },
  whyBlock: { display: "flex", flexDirection: "column", gap: "4px", padding: "12px", borderRadius: "10px", background: "rgba(92,200,184,.10)", border: "1px solid #36535A", color: "#E6EEF7" },
  mistakeBlock: { display: "flex", flexDirection: "column", gap: "4px", padding: "12px", borderRadius: "10px", background: "rgba(252,211,77,.07)", border: "1px solid #6B5A2E", color: "#FDE9A8" },
  block: { display: "flex", flexDirection: "column", gap: "4px", padding: "12px", borderRadius: "10px", background: "rgba(255,255,255,.04)", border: "1px solid #284154" },
  vizBar: { display: "flex", alignItems: "center", gap: "12px" },
  vizBtn: { padding: "9px 14px", borderRadius: "10px", border: "none", background: "#5CC8B8", color: "#0F1717", fontSize: "13px", fontWeight: 800, cursor: "pointer" },
  rowLeft: { display: "flex", alignItems: "flex-start", gap: "10px" },
  rowRight: { display: "flex", justifyContent: "flex-end" },
  avatar: { width: "28px", height: "28px", borderRadius: "9px", background: "#1B2A3A", border: "1px solid #284154", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  assistantCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "10px" },
  answer: { whiteSpace: "pre-wrap", color: "#E6EEF7" },
  userBubble: { maxWidth: "85%", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", background: "#22313F", border: "1px solid #2F4558", whiteSpace: "pre-wrap" },
  hintBox: { display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: "12px", border: "1px solid #36535A", background: "rgba(92,200,184,.08)", boxShadow: "0 0 18px rgba(92,200,184,.10)" },
  question: { position: "sticky", top: "-16px", zIndex: 2, margin: "0 -2px", padding: "14px 2px 12px", display: "flex", flexDirection: "column", gap: "6px", background: "#152030", borderBottom: "1px solid #284154" },
  questionFirst: { marginTop: "-16px" },
  problemBlock: { display: "flex", flexDirection: "column", gap: "14px" },
  pageNo: { alignSelf: "center", padding: "0 6px", color: "#9DE5D9", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" },
  foldBtn: { alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", padding: "4px 2px", border: "none", background: "transparent", color: "#9DE5D9", fontSize: "13px", fontWeight: 800, cursor: "pointer" },
  arrows: { marginLeft: "auto", display: "flex", gap: "6px", flexShrink: 0 },
  arrowBtn: { width: "30px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #2F4558", borderRadius: "9px", background: "#1B2A3A", color: "#DDEBFA", cursor: "pointer" },
  ghostBtn: { padding: "9px 14px", borderRadius: "10px", border: "1px solid #36535A", background: "transparent", color: "#9DE5D9", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  modeRow: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" },
  modeChip: { padding: "6px 12px", borderRadius: "999px", border: "1px solid #2F4558", background: "transparent", color: "#8FA3B8", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  modeHint: { alignSelf: "center", fontSize: "11.5px", color: "#7C93A8" },
  modeChipOn: { borderColor: "#5CC8B8", background: "rgba(92,200,184,.14)", color: "#F8FAFC" },
  questionText: { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap", fontSize: "13.5px", lineHeight: 1.55, color: "#E6EEF7" },
  questionTextOpen: { maxHeight: "34vh", overflowY: "auto", whiteSpace: "pre-wrap", fontSize: "13.5px", lineHeight: 1.55, color: "#E6EEF7" },
  questionToggle: { alignSelf: "flex-start", padding: 0, border: "none", background: "transparent", color: "#9DE5D9", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
  langNotice: { display: "flex", flexDirection: "column", gap: "10px", padding: "12px 14px", borderRadius: "12px", border: "1px solid #6B5A2E", background: "rgba(252,211,77,.08)", color: "#FDE9A8", fontSize: "13px", lineHeight: 1.5 },
  nextHintRow: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" },
  scoreRow: { display: "flex", alignItems: "baseline", gap: "6px" },
  score: { fontSize: "36px", lineHeight: 1 },
  scoreMax: { color: "#8FA3B8", fontSize: "13px" },
  issueHead: { display: "flex", alignItems: "center", gap: "8px" },
  tag: { padding: "2px 9px", borderRadius: "999px", border: "1px solid", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px" },
  lineTag: { color: "#8FA3B8", fontSize: "12px" },
  hintText: { fontWeight: 600, color: "#F2F5F7" },
  thinking: { padding: "4px 0", color: "#9DE5D9", fontSize: "13px" },
  composerArea: { flexShrink: 0, paddingTop: "8px" },
  pills: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" },
  pill: { padding: "7px 12px", borderRadius: "999px", border: "1px solid #2F4558", background: "rgba(255,255,255,.03)", color: "#BFD0E0", fontSize: "12px", textAlign: "left", cursor: "pointer" },
  composer: { display: "flex", alignItems: "flex-end", gap: "8px", padding: "8px 8px 8px 14px", borderRadius: "16px", background: "#0F1519", border: "1px solid #36535A", boxShadow: "0 0 0 3px rgba(92,200,184,.08)" },
  input: { flex: 1, minWidth: 0, resize: "none", padding: "6px 0", border: "none", background: "transparent", color: "#F2F5F7", font: "inherit", fontSize: "14px", lineHeight: 1.5, outline: "none" },
  send: { width: "38px", height: "38px", borderRadius: "11px", border: "none", background: "#5CC8B8", color: "#0F1717", fontSize: "16px", fontWeight: 800, cursor: "pointer", flexShrink: 0 },
  attach: { width: "36px", height: "36px", borderRadius: "10px", border: "none", background: "#1B2A3A", cursor: "pointer", flexShrink: 0 },
  attachChip: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #36535A", background: "rgba(92,200,184,.08)", color: "#BAE6DF", fontSize: "12px", fontWeight: 700 },
  attachX: { border: "none", background: "transparent", color: "#BAE6DF", fontSize: "15px", cursor: "pointer" },
};
