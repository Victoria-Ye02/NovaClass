import { useCallback, useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import API from "../../services/api";
import PdfLessonViewer from "../../components/PdfLessonViewer";
import Icon from "../../components/Icon";
import PrivateCommentsPanel from "../../components/PrivateCommentsPanel";
import { useMaterialBookmarks } from "../../hooks/useMaterialBookmarks";
import { useMaterialHighlights } from "../../hooks/useMaterialHighlights";
import { useLang } from "../../LanguageContext";
import { activeSentenceIndex, splitSentences } from "./lecture/lectureText";
import LectureStage from "./lecture/LectureStage";
import useNarrationPlayer from "./lecture/useNarrationPlayer";
import useQuickCheck from "./lecture/useQuickCheck";
import usePushToTalk, { isPushToTalkSupported } from "./lecture/usePushToTalk";

const API_ORIGIN = "http://localhost:5001";

const FILE_TYPE_LABEL = {
  pdf: "PDF", docx: "Word", pptx: "PowerPoint",
  png: "Image", jpg: "Image", jpeg: "Image", webp: "Image", gif: "Image",
  mp4: "Video", webm: "Video",
};

async function fetchMaterial(materialId) {
  const { data } = await API.get(`/classroom/materials/${materialId}`);
  return data;
}

function AIChatPanel({ materialId, currentPage, totalPages, panelVisible, onAdvancePage, onPoint }) {
  const { lang } = useLang();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: lang === "my"
        ? "👋 မင်္ဂလာပါ။ ကျွန်ုပ်က ဒီသင်ခန်းစာကို ဦးဆောင်သင်ပေးမယ့် Professor Nova ပါ။"
        : "👋 Hello. I'm Professor Nova, ready to guide you through this lesson.",
    },
  ]);
  const [textQuestion, setTextQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [lessonStarted, setLessonStarted] = useState(false);
  // The language the lesson is taught in: the Settings language by default, or
  // whatever the student last asked for ("explain in English", typed or spoken).
  // The server decides; the language it used comes back as `replyLang` and is
  // sent with every later request (and used for slide scripts and quick checks),
  // so a switch sticks. Refs let long-lived effects read the latest value.
  const [lessonLang, setLessonLang] = useState(null);
  const activeLang = lessonLang || lang;
  const lessonLangRef = useRef(null);
  lessonLangRef.current = lessonLang;
  const activeLangRef = useRef(activeLang);
  activeLangRef.current = activeLang;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Sent as conversation context on every AI request. Capped to the most
  // recent messages rather than the whole history — a long lesson taught
  // page-by-page (Continue lesson / voice auto-continue) accumulates
  // paragraph-length replies fast, and an unbounded history both risks
  // hitting request-size/LLM-context limits (a 51-page lesson genuinely did
  // — see the 413 "request entity too large" this was added to fix) and
  // makes every turn slower/pricier for no teaching benefit once earlier
  // pages have already been explained and moved past.
  const MAX_HISTORY_MESSAGES = 30;
  function buildRecentHistory() {
    return messagesRef.current
      .filter(m => m.role !== "system")
      .slice(-MAX_HISTORY_MESSAGES)
      .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
  }
  // The lesson auto-starts from a mount-only effect (see below) whose
  // sendMessage call was created at that mount's render — without this ref,
  // it would permanently use whatever page the student was on at that
  // instant, ignoring a page turn that lands before that first request
  // actually goes out.
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;
  const speechSupported = isPushToTalkSupported();

  // The lecture narration (it never needs the mic; the student can pause,
  // resume, replay and seek it).
  const narration = useNarrationPlayer(materialId);
  // Push-to-talk lives inside the panel: tap, speak, tap, check the text, ask.
  const ptt = usePushToTalk({ lang });
  // The panel only slides out of view when collapsed (it never unmounts), so a
  // recording or draft must be dropped explicitly or the mic would stay on.
  const cancelPtt = ptt.cancel;
  useEffect(() => {
    if (!panelVisible) cancelPtt();
  }, [panelVisible, cancelPtt]);
  // Pop-up check-ins: once a slide's narration finishes, one quick question
  // (once per slide) before the lesson moves on.
  const quickCheck = useQuickCheck({ materialId, lang: activeLang });
  const checkedPagesRef = useRef(new Set());
  const [scriptLoading, setScriptLoading] = useState(false);
  // A page the teacher turned herself ("Continue lesson") — her reply already
  // narrates it, so the slide-script fetch must skip that one page change.
  const teacherPageRef = useRef(0);
  const lastSeenPageRef = useRef(currentPage);
  const prefetchedPagesRef = useRef(new Set());
  useEffect(() => { prefetchedPagesRef.current = new Set(); }, [activeLang]);
  const lastNarratedRef = useRef(null);
  const pendingNarrationRef = useRef(null);

  function canAutoNarrate() {
    // Browsers refuse audio until the student has interacted with the page, so
    // only try when that is true; otherwise the Play button waits for a tap.
    return panelVisible && ptt.state === "idle" && navigator.userActivation?.hasBeenActive === true;
  }

  // Read each new lecture reply aloud. If the panel is collapsed when it
  // arrives (the lesson starts as soon as the page loads), hold it and start
  // narrating the moment the student opens the panel.
  useEffect(() => {
    const latest = [...messages].reverse().find(m => m.role === "assistant");
    if (!latest?.narrate || lastNarratedRef.current === latest) return;
    lastNarratedRef.current = latest;
    if (!panelVisible) { pendingNarrationRef.current = latest; return; }
    if (canAutoNarrate()) narration.play(latest.text);
  }, [messages]);

  useEffect(() => {
    if (!panelVisible) { narration.pause(); return; }
    const pending = pendingNarrationRef.current;
    pendingNarrationRef.current = null;
    if (pending && canAutoNarrate()) narration.play(pending.text);
  }, [panelVisible]);

  // Visual pointer: while a script plays, ask which words on the slide each
  // sentence is about (once per script, only when it actually starts playing)
  // and aim the pointer at them as the narration reaches each sentence.
  const cuesRef = useRef({ key: "", targets: null });
  const pointedRef = useRef("");
  function pointAt(page, phrase) {
    const key = `${page}|${phrase || ""}`;
    if (pointedRef.current === key) return;
    pointedRef.current = key;
    onPoint?.(page, phrase || null);
  }
  useEffect(() => {
    const latest = [...messages].reverse().find(m => m.role === "assistant");
    const page = latest?.page;
    if (narration.status !== "playing" && narration.status !== "paused") {
      if (narration.status !== "loading") pointAt(page || 0, null);
      return;
    }
    if (!latest?.text || !page) return;
    const key = `${materialId}|${page}|${latest.text}`;
    if (cuesRef.current.key !== key) {
      cuesRef.current = { key, targets: null };
      API.post(`/classroom/materials/${materialId}/lecture/${page}/cues`, { text: latest.text, lang })
        .then(({ data }) => {
          if (cuesRef.current.key === key && Array.isArray(data?.targets)) cuesRef.current.targets = data.targets;
        })
        .catch(() => {});
      return;
    }
    const targets = cuesRef.current.targets;
    if (!targets) return;
    const index = activeSentenceIndex(splitSentences(latest.text), narration.progress);
    pointAt(page, targets[index] || null);
  }, [narration.status, narration.progress, messages]);

  // The lecture part of a slide has just finished playing → test it. Only for
  // lecture content (not answers to the student's own questions) and only once
  // per slide.
  useEffect(() => {
    if (narration.status !== "ended") return;
    const latest = [...messagesRef.current].reverse().find(m => m.role === "assistant");
    if (!latest?.lecture || !latest.page || checkedPagesRef.current.has(latest.page)) return;
    checkedPagesRef.current.add(latest.page);
    quickCheck.open(latest.page);
  }, [narration.status]);

  // Slide sync: when the student turns the page themselves, the lecture moves
  // with them — fetch that slide's (cached) script, show it in the teleprompter
  // and narrate it. Debounced so flicking through pages doesn't fire a request
  // per page.
  useEffect(() => {
    const previous = lastSeenPageRef.current;
    lastSeenPageRef.current = currentPage;
    if (!lessonStarted || !currentPage || previous === currentPage) return undefined;
    if (teacherPageRef.current === currentPage) {
      teacherPageRef.current = 0;
      setScriptLoading(false);
      return undefined;
    }
    let cancelled = false;
    const slideUrl = page => `/classroom/materials/${materialId}/lecture/${page}`;
    const timer = setTimeout(async () => {
      setScriptLoading(true);
      narration.stop();
      quickCheck.dismiss();
      try {
        const { data } = await API.get(slideUrl(currentPage), { params: { lang: activeLangRef.current, total: totalPagesRef.current || undefined } });
        if (cancelled) return;
        if (data?.available && typeof data.narration === "string" && data.narration) {
          setMessages(prev => [...prev, {
            role: "assistant", text: data.narration, page: currentPage, keyPoints: data.keyPoints || [], narrate: true, lecture: true,
          }]);
        }
        // Warm the next slide's script so turning the page feels instant.
        const next = currentPage + 1;
        if (totalPagesRef.current && next <= totalPagesRef.current && !prefetchedPagesRef.current.has(next)) {
          prefetchedPagesRef.current.add(next);
          API.get(slideUrl(next), { params: { lang: activeLangRef.current, total: totalPagesRef.current } }).catch(() => {});
        }
      } catch {
        // the teleprompter simply keeps the previous script
      } finally {
        if (!cancelled) setScriptLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [currentPage, lessonStarted]);

  // AIChatPanel is remounted with key={materialId} (see MaterialPreview)
  // whenever the student switches lessons, so a plain mount-only effect here
  // already starts Nova Teacher automatically, without needing materialId as
  // a dependency or a "Start learning" button — the student never has to ask
  // to be taught. Deliberately does NOT restore any previously saved
  // chat-history/resume from a past session: every time the student opens
  // this lesson, Nova greets fresh, states what today's lesson covers, and
  // teaches from page 1 — not a silent "pick up where we left off" that skips
  // the opening. (Requested explicitly: no more history-based resuming.)
  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      setLessonStarted(true);
      await sendMessage("Start this lesson as my professor.", { teachingIntent: "start" });
    })();
    return () => { active = false; };
  }, [materialId]);

  // Shared by the text box and push-to-talk, so a spoken question gets the
  // exact same request and history as a typed one. Returns the reply text.
  async function sendMessage(text, { teachingIntent = null } = {}) {
    if (!text || sending) return null;
    setMessages(prev => [...prev, { role: "user", text, asked: !teachingIntent || teachingIntent === "answer" }]);
    setSending(true);
    let replyText;
    let failed = false;
    try {
      const history = buildRecentHistory();
      const { data } = await API.post(`/classroom/materials/${materialId}/ai`, {
        action: "chat",
        mode: teachingIntent || lessonStarted ? "teacher" : "assistant",
        ...(teachingIntent || lessonStarted ? { teachingIntent: teachingIntent || "answer" } : {}),
        message: text,
        history,
        currentPage: currentPageRef.current,
        totalPages: totalPagesRef.current,
        lang,
        ...(lessonLangRef.current ? { lessonLang: lessonLangRef.current } : {}),
      });
      replyText = data.reply || data.response || "...";
      // The server tells us which language it taught in (it follows an explicit
      // "switch language" request); back on the Settings language means no override.
      if (data.replyLang) setLessonLang(data.replyLang === lang ? null : data.replyLang);
    } catch {
      replyText = "⚠️ Something went wrong. Please try again.";
      failed = true;
    }
    setMessages(prev => [...prev, { role: "assistant", text: replyText, page: currentPageRef.current, narrate: !failed, lecture: !failed && (teachingIntent === "start" || teachingIntent === "continue") }]);
    setSending(false);
    return replyText;
  }

  async function sendTypedQuestion() {
    const text = textQuestion.trim();
    if (!text || sending || !lessonStarted) return;
    setTextQuestion("");
    await sendMessage(text, { teachingIntent: "answer" });
  }

  // Turns the actual PDF page forward before asking for the next
  // explanation, so "continue" means "move to the next page and explain
  // it" — not just a vague "next concept" while the viewer sits still. Sets
  // currentPageRef directly (not just calling onAdvancePage) so the
  // sendMessage call right after this already carries the new page number —
  // waiting for the prop round-trip through PdfLessonViewer's onPageChange
  // would still show the old page for this one request.
  function advanceToNextPage() {
    const page = currentPageRef.current;
    const total = totalPagesRef.current;
    if (onAdvancePage && page && total && page < total) {
      const nextPage = page + 1;
      currentPageRef.current = nextPage;
      teacherPageRef.current = nextPage;
      onAdvancePage(nextPage);
    }
  }

  // Two-way step: Nova hands the student a small task and waits for their
  // answer (typed or spoken), which then goes through the normal "answer" turn.
  function startYourTurn(prompt) {
    quickCheck.dismiss();
    setMessages(prev => [...prev, { role: "assistant", text: prompt, page: currentPageRef.current, narrate: true }]);
  }

  async function continueLesson() {
    quickCheck.dismiss();
    advanceToNextPage();
    await sendMessage("Continue the lesson with the next important concept.", { teachingIntent: "continue" });
  }

  async function simplifyLesson() {
    await sendMessage("Please explain the current concept more simply.", { teachingIntent: "simplify" });
  }

  async function checkUnderstanding() {
    await sendMessage("Check my understanding with one question.", { teachingIntent: "check" });
  }

  const latestAssistantIndex = messages.findLastIndex(m => m.role === "assistant");
  const latestAssistant = messages[latestAssistantIndex];
  const latestUserIndex = messages.findLastIndex(m => m.role === "user");
  // Only a genuine student question is worth echoing above the script — the
  // lesson's own prompts ("Continue the lesson…") are plumbing, not speech.
  const askedQuestion = latestUserIndex === latestAssistantIndex - 1 && messages[latestUserIndex]?.asked
    ? messages[latestUserIndex].text
    : null;
  const script = latestAssistant?.text || "";

  let stageState = "idle";
  if (ptt.state === "recording") {
    stageState = "listening";
  } else if (ptt.state === "transcribing" || sending || scriptLoading || narration.status === "loading") {
    stageState = "thinking";
  } else if (narration.status === "playing") {
    stageState = "speaking";
  } else if (narration.status === "paused") {
    stageState = "paused";
  }
  const STAGE_LABEL = { speaking: "SPEAKING", listening: "LISTENING", thinking: "PREPARING…", paused: "PAUSED" };
  const statusLabel = STAGE_LABEL[stageState] || (lessonStarted ? "TEACHING" : "READY");

  let notice = null;
  if (narration.status === "blocked") notice = "Your browser blocked autoplay — press Play to hear the lecture.";
  else if (narration.status === "error") notice = "Couldn't load the voice just now. You can keep reading along, or press Play to try again.";

  return (
    <div style={chatPanel}>
      <LectureStage
        statusLabel={statusLabel}
        avatarState={stageState}
        level={ptt.state === "recording" ? ptt.level : narration.viz.level}
        page={latestAssistant?.page || currentPage}
        totalPages={totalPages}
        script={script}
        keyPoints={latestAssistant?.keyPoints}
        question={askedQuestion}
        scriptLoading={scriptLoading || sending || !lessonStarted}
        narration={{
          status: narration.status,
          clock: narration.clock,
          progress: narration.progress,
          viz: narration.viz,
          onToggle: () => narration.toggle(script),
          onReplay: () => narration.play(script),
          onSeek: narration.seek,
        }}
        mic={{
          supported: speechSupported,
          state: ptt.state,
          level: ptt.level,
          seconds: ptt.seconds,
          draft: ptt.draft,
          error: ptt.error,
          // Also off while a reply is in flight — lessonStarted flips true as
          // the opening lecture request goes out, before it has an answer.
          disabled: sending || !lessonStarted,
          onToggle: () => {
            // Narration would bleed into the recording, so it stops first.
            if (ptt.state !== "recording") narration.stop();
            ptt.toggle();
          },
          onDraft: ptt.setDraft,
          onCancel: ptt.cancel,
          onSend: async () => {
            const text = ptt.consume();
            if (text) await sendMessage(text, { teachingIntent: "answer" });
          },
        }}
        actions={lessonStarted ? [
          { label: "Continue lesson", onClick: continueLesson, disabled: sending },
          { label: "Quick check", onClick: () => { narration.stop(); quickCheck.open(latestAssistant?.page || currentPage); }, disabled: sending || quickCheck.quiz.status === "loading" },
          { label: "Explain simply", onClick: simplifyLesson, disabled: sending },
          { label: "Check my understanding", onClick: checkUnderstanding, disabled: sending },
        ] : []}
        textFallback={{
          value: textQuestion,
          onChange: setTextQuestion,
          onSubmit: sendTypedQuestion,
          disabled: sending || !lessonStarted,
        }}
        notice={notice}
        language={{ code: activeLang, overridden: Boolean(lessonLang), onReset: () => setLessonLang(null) }}
        quiz={{
          state: quickCheck.quiz,
          onPick: quickCheck.pick,
          onSkip: quickCheck.dismiss,
          onNext: continueLesson,
          onYourTurn: startYourTurn,
        }}
      />

    </div>
  );
}

export default function MaterialPreview({ isOverlay = false }) {
  const { id, materialId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [material, setMaterial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [splitChat, setSplitChat] = useState(false);
  const [matAssignments, setMatAssignments] = useState([]);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [myId, setMyId] = useState(null);
  const [pdfPageState, setPdfPageState] = useState({ currentPage: 1, totalPages: 0 });
  // Stable identity is required here: PdfLessonViewer's onPageChange effect
  // lists this callback as a dependency, so a fresh inline function on every
  // render would re-fire that effect every render, call setPdfPageState
  // again, and re-render this component — an infinite loop. The same-value
  // bailout below is a second line of defense against reintroducing it.
  const handlePdfPageChange = useCallback((currentPage, totalPages) => {
    setPdfPageState((prev) => (
      prev.currentPage === currentPage && prev.totalPages === totalPages
        ? prev
        : { currentPage, totalPages }
    ));
  }, []);
  // Lets the AI teaching panel drive the actual PDF page — "explain this
  // page, then move to the next one" needs the viewer to physically turn the
  // page in sync with what Nova is now talking about, not just describe a
  // page number in text. Ref (not a prop) because turning the page is an
  // imperative action, not state PdfLessonViewer needs to re-render for.
  const pdfViewerRef = useRef(null);
  const advancePdfPage = useCallback((page) => {
    pdfViewerRef.current?.goToPage(page);
  }, []);
  // Aims the lecture pointer at a phrase on the page (null clears it).
  const pointPdfAt = useCallback((page, phrase) => {
    pdfViewerRef.current?.pointAt?.(page, phrase);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setMaterial(await fetchMaterial(materialId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    let active = true;
    fetchMaterial(materialId)
      .then((data) => {
        if (active) {
          setMaterial(data);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [materialId]);

  // Assignments tied to this specific lesson (material_id), so a student
  // sees them right where the lesson lives instead of only in the class's
  // general assignments list. Best-effort — a failed fetch just hides the
  // badge rather than blocking the lesson from loading.
  useEffect(() => {
    let active = true;
    API.get(`/classroom/materials/${materialId}/assignments`)
      .then(({ data }) => { if (active) setMatAssignments(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setMatAssignments([]); });
    return () => { active = false; };
  }, [materialId]);

  // Needed to tell "my own comment" apart from the teacher's/other students'
  // replies, and to decide whether to show the single-thread (student) or
  // grouped-by-student (teacher) comment view.
  useEffect(() => {
    if (!material?.class_id) return;
    let active = true;
    API.get(`/classroom/classes/${material.class_id}`)
      .then(({ data }) => { if (active) { setMyRole(data.my_role); setMyId(data.my_id); } })
      .catch(() => {});
    return () => { active = false; };
  }, [material?.class_id]);

  // Overlay mode: closing goes back to whatever pushed this route (the classroom
  // page underneath). Standalone mode (direct URL / refresh — no history to return
  // to within the app) goes to the classroom page explicitly instead.
  function goBack() {
    if (isOverlay) navigate(-1);
    else navigate(`/classroom/${id}`);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") goBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOverlay, id]);

  useEffect(() => {
    if (!isOverlay) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [isOverlay]);

  // A lesson's additional attachments (material_files) aren't separate
  // materials — they only exist as rows on this same material. Selecting one
  // via ?file=<id> reuses this same PDF viewer (AI chat, translate,
  // everything) instead of falling through to a plain external link, which
  // is all a bare <a href> to the raw upload could offer.
  const extraFileId = searchParams.get("file");
  const activeExtraFile = extraFileId
    ? (material?.files || []).find(f => String(f.id) === extraFileId)
    : null;

  const token = localStorage.getItem("nova_token");
  const fileUrl = activeExtraFile
    // Extra attachments are served from the unauthenticated /uploads static
    // route (see server.js) — no ?token needed, unlike the primary file's
    // auth-gated /api/classroom/materials/:id/file route.
    ? `${API_ORIGIN}/uploads/${activeExtraFile.file_path}`
    : material?.file_url
    ? `${API_ORIGIN}/api${material.file_url}?token=${encodeURIComponent(token)}`
    : null;
  // The `download` attribute on <a> is ignored cross-origin — force a real
  // download via the server's Content-Disposition instead (see getMaterialFile).
  const downloadUrl = activeExtraFile ? fileUrl : (fileUrl ? `${fileUrl}&download=1` : null);
  const ext = activeExtraFile
    ? (activeExtraFile.file_name.split(".").pop() || "").toLowerCase()
    : material?.file_ext;
  const previewTitle = activeExtraFile ? activeExtraFile.file_name : (material?.title || "Untitled");
  const typeLabel = FILE_TYPE_LABEL[ext] || "File";
  const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
  const isVideo = ["mp4", "webm"].includes(ext);
  const isPdf = ext === "pdf";
  // Bookmarks and highlights are page-indexed against the primary file's own
  // content — meaningless (and potentially page-mismatched) against a
  // different attached PDF, so both stay off while viewing an extra file.
  const {
    bookmarks,
    syncingPage,
    error: bookmarkError,
    toggleBookmark,
  } = useMaterialBookmarks({
    materialId,
    enabled: isPdf && Boolean(fileUrl) && !activeExtraFile,
  });
  const highlightState = useMaterialHighlights({ materialId, enabled: isPdf && !activeExtraFile });

  const content = (
    <>
      {/* Top bar */}
      <div style={topBar}>
        <button onClick={goBack} style={backBtn} aria-label="Back to classroom">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={fileNameStyle}>{loading ? "Loading…" : previewTitle}</div>
        </div>
        {matAssignments.length > 0 && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setAssignmentsOpen(v => !v)}
              style={assignmentsBadge}
              aria-expanded={assignmentsOpen}
              aria-label="Assignments for this lesson"
            >
              📝 {matAssignments.length}
            </button>
            {assignmentsOpen && (
              <div style={assignmentsDropdown}>
                <div style={assignmentsDropdownTitle}>Assignments for this lesson</div>
                {matAssignments.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(`/classroom/${id}?tab=classwork`)}
                    style={assignmentRow}
                  >
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{a.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "2px" }}>
                      {a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "No due date"}
                      {"my_submission" in a ? (a.my_submission ? " · Submitted" : " · Not submitted") : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {myRole && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setCommentsOpen(v => !v)}
              style={assignmentsBadge}
              aria-expanded={commentsOpen}
              aria-label="Private comments"
            >
              💬{commentCount > 0 ? ` ${commentCount}` : ""}
            </button>
            <div style={{ ...assignmentsDropdown, width: "320px", maxHeight: "70vh", overflowY: "auto", display: commentsOpen ? "block" : "none" }}>
              <div style={assignmentsDropdownTitle}>
                {myRole === "teacher" ? "Private comments" : "Private comment to your teacher"}
              </div>
              <PrivateCommentsPanel materialId={materialId} isTeacher={myRole === "teacher"} myId={myId} onCountChange={setCommentCount}
                containerStyle={myRole === "teacher" ? undefined : { padding: "0 10px" }} />
            </div>
          </div>
        )}
        {!loading && !error && (
          <span style={badge}>{typeLabel}</span>
        )}
        {fileUrl && (
          <a href={downloadUrl} download={previewTitle} style={downloadBtn}>
            ⬇ Download
          </a>
        )}
      </div>

      {/* Body */}
      <div style={body}>
        <div style={pdfPane}>
        {loading ? (
          <div style={skeleton}>
            <div style={skeletonBar} />
            <div style={{ ...skeletonBar, width: "60%" }} />
          </div>
        ) : error ? (
          <div style={centerMsg}>
            <div style={{ marginBottom: "12px" }}><Icon name="error" size={40} alt="" /></div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a2e", marginBottom: "16px" }}>
              Couldn't load this material.
            </div>
            <button onClick={load} style={retryBtn}>Retry</button>
          </div>
        ) : !fileUrl ? (
          <div style={centerMsg}>
            <div style={{ marginBottom: "12px" }}><Icon name="file" size={40} alt="" /></div>
            <div style={{ fontSize: "15px", color: "#6b7280" }}>No file attached to this lesson.</div>
          </div>
        ) : isPdf ? (
          <PdfLessonViewer
            ref={pdfViewerRef}
            fileUrl={fileUrl}
            title={previewTitle}
            bookmarks={bookmarks}
            syncingPage={syncingPage}
            bookmarkError={bookmarkError}
            onToggleBookmark={toggleBookmark}
            onDismissEmptySpace={isOverlay ? goBack : undefined}
            highlightState={highlightState}
            onPdfReady={highlightState.preparePdf}
            onPageChange={handlePdfPageChange}
          />
        ) : isImage ? (
          <div style={centerMsg}>
            <img src={fileUrl} alt={material.title} style={imgStyle} />
          </div>
        ) : isVideo ? (
          <div style={centerMsg}>
            <video src={fileUrl} controls style={videoStyle} />
          </div>
        ) : (
          <div style={centerMsg}>
            <div style={{ marginBottom: "12px" }}><Icon name="attach" size={40} alt="" /></div>
            <div style={{ fontSize: "15px", color: "#6b7280", marginBottom: "16px" }}>
              Preview isn't available for this file type.
            </div>
            <a href={downloadUrl} download={previewTitle} style={retryBtn}>Download</a>
          </div>
        )}
        </div>
        {isPdf && !loading && !error && fileUrl && (
          <div style={chatSidebarWrapper(splitChat)}>
            <button
              type="button"
              onClick={() => setSplitChat(v => !v)}
              style={chatHandle}
              aria-label={splitChat ? "Close AI chat" : "Open AI chat"}
              aria-pressed={splitChat}
            />
            <div style={chatSlideContent(splitChat)}>
              <AIChatPanel
                key={materialId}
                onPoint={pointPdfAt}
                materialId={materialId}
                currentPage={pdfPageState.currentPage}
                totalPages={pdfPageState.totalPages}
                panelVisible={splitChat}
                onAdvancePage={advancePdfPage}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (isOverlay) {
    return (
      <div className="material-overlay-backdrop" style={backdrop} onClick={goBack}>
        <div className="material-overlay-card" data-testid="material-overlay-card" style={overlayCard} onClick={e => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      {content}
    </div>
  );
}

const page = {
  height: "100vh", width: "100vw", display: "flex", flexDirection: "column",
  background: "#1a1a2e", position: "fixed", inset: 0,
};

const backdrop = {
  position: "fixed", inset: 0, zIndex: 50,
  background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer",
};

const overlayCard = {
  width: "100vw", maxWidth: "none", height: "100dvh",
  background: "#1a1a2e", borderRadius: 0, boxShadow: "none",
  overflow: "hidden", cursor: "default",
  display: "flex", flexDirection: "column",
};

const topBar = {
  height: "60px", flexShrink: 0, display: "flex", alignItems: "center", gap: "14px",
  padding: "0 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
};

const backBtn = {
  background: "none", border: "none", fontSize: "22px", color: "var(--text-muted)",
  cursor: "pointer", lineHeight: 1, flexShrink: 0,
};

const fileNameStyle = {
  fontSize: "15px", fontWeight: 700, color: "var(--text)",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const badge = {
  fontSize: "11px", fontWeight: 700, color: "var(--primary)", background: "var(--primary-tint)",
  padding: "4px 10px", borderRadius: "20px", flexShrink: 0,
};

const downloadBtn = {
  display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700,
  color: "#fff", background: "var(--primary)", padding: "8px 16px", borderRadius: "8px",
  flexShrink: 0, whiteSpace: "nowrap",
};

const assignmentsBadge = {
  fontSize: "12px", fontWeight: 700, color: "var(--primary)", background: "var(--primary-tint)",
  border: "1px solid var(--border)", padding: "6px 12px", borderRadius: "20px",
  cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
};

const assignmentsDropdown = {
  position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 20,
  width: "280px", background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "8px",
};

const assignmentsDropdownTitle = {
  fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase",
  letterSpacing: "0.5px", padding: "6px 10px",
};

const assignmentRow = {
  display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
  cursor: "pointer", padding: "8px 10px", borderRadius: "8px",
};

const body = {
  flex: 1, minHeight: 0, display: "flex", alignItems: "stretch", justifyContent: "center",
  background: "#525659",
};

const centerMsg = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", textAlign: "center", padding: "40px",
};

const imgStyle = { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "6px" };

const videoStyle = { maxWidth: "100%", maxHeight: "100%" };

const retryBtn = {
  background: "var(--primary)", color: "#fff", border: "none", borderRadius: "8px",
  padding: "10px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
  textDecoration: "none", display: "inline-block",
};

const skeleton = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: "12px", padding: "40px",
};

const skeletonBar = {
  width: "80%", maxWidth: "480px", height: "16px", borderRadius: "6px",
  background: "linear-gradient(90deg, #3a3a52 25%, #4a4a68 50%, #3a3a52 75%)",
  backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite",
};

const pdfPane = {
  flex: 1, minWidth: 0, display: "flex", alignItems: "stretch", justifyContent: "center",
  overflow: "hidden",
};

const CHAT_HANDLE_WIDTH = 14;
const CHAT_HANDLE_HEIGHT = 85;
const CHAT_SIDEBAR_WIDTH = 500;
const CHAT_COLLAPSED_WIDTH = 22;

const chatSidebarWrapper = (open) => ({
  position: "relative", flexShrink: 0,
  width: open ? `${CHAT_SIDEBAR_WIDTH}px` : `${CHAT_COLLAPSED_WIDTH}px`,
  transition: "width 300ms ease-in-out",
  background: "#525659",
  // `overflow: clip` (not "hidden"): the sliding child is moved via `transform`,
  // and Chromium counts a transformed element's post-transform box toward its
  // nearest scrollable ancestor's scrollable overflow. With "hidden" that makes
  // this wrapper an actual scroll container, and the browser auto-scrolls it to
  // reveal the transformed content — shifting everything inside (including the
  // always-visible handle) out of view. "clip" clips visually without ever
  // establishing a scroll container, so there is no scrollLeft to auto-adjust.
  overflow: "clip",
});

const chatHandle = {
  position: "absolute", top: "50%",
  left: `${(CHAT_COLLAPSED_WIDTH - CHAT_HANDLE_WIDTH) / 2}px`,
  transform: "translateY(-50%)",
  width: `${CHAT_HANDLE_WIDTH}px`, height: `${CHAT_HANDLE_HEIGHT}px`,
  borderRadius: "9999px", background: "#0f0f14", border: "none", padding: 0,
  cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.35)", zIndex: 2,
};

const chatSlideContent = (open) => ({
  position: "absolute", top: 0, bottom: 0,
  left: `${CHAT_COLLAPSED_WIDTH}px`,
  width: `${CHAT_SIDEBAR_WIDTH - CHAT_COLLAPSED_WIDTH}px`,
  transform: open ? "translateX(0)" : "translateX(100%)",
  transition: "transform 300ms ease-in-out",
  display: "flex", borderLeft: "1px solid var(--border)",
});

const chatPanel = {
  position: "relative",
  flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
  background: "var(--surface)", borderLeft: "1px solid var(--border)",
};
