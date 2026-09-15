import { useCallback, useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import API from "../../services/api";
import PdfLessonViewer from "../../components/PdfLessonViewer";
import Icon from "../../components/Icon";
import PrivateCommentsPanel from "../../components/PrivateCommentsPanel";
import { useMaterialBookmarks } from "../../hooks/useMaterialBookmarks";
import { useMaterialHighlights } from "../../hooks/useMaterialHighlights";
import { useLang } from "../../LanguageContext";

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

// Checked live (not cached at module load) so tests can stub it per-case,
// and so the real app reflects whatever the current browser actually
// supports. Voice input records raw audio and transcribes it with Whisper
// (see /api/multimodal/transcribe) instead of the browser's own
// SpeechRecognition — SpeechRecognition doesn't cover every language this
// app supports (Burmese, notably; Whisper does), and using our own
// recording also means the exact same pipeline works for every language
// without per-browser/per-locale gaps.
function getVoiceInputSupport() {
  return typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof window.MediaRecorder !== "undefined";
}

const VOICE_STATUS_LABEL = {
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  ready: "Tap to talk",
};

// How long a run of silence has to last, once real speech has started, before
// a turn is considered finished and sent off for transcription. Lower feels
// snappier but risks cutting someone off mid-sentence during a natural
// pause; higher feels laggy. Lowered from 900ms after reports that even a
// single short word felt like a long wait before Nova responded.
const VOICE_SILENCE_TIMEOUT_MS = 600;
// Anything shorter than this run of speech is treated as noise, not an
// answer — a brief mic/speaker echo blip is unlikely to stay above the RMS
// threshold this long, real speech easily does.
const VOICE_MIN_SPEECH_MS = 500;
// Hard safety cap per turn so a stuck mic can't record forever.
const VOICE_MAX_TURN_MS = 20000;
// How long Nova waits in total silence — the student never started
// speaking at all — before she proactively continues the lesson herself,
// like a professor who keeps teaching the next point rather than waiting
// indefinitely to be asked a question. Deliberately much shorter than
// VOICE_MAX_TURN_MS, which stays as an unrelated absolute safety cap.
const VOICE_PROACTIVE_CONTINUE_MS = 4000;
// RMS amplitude (0..1) above which the mic is considered "someone is
// talking". Tuned for a typical laptop mic in a normal room; a very noisy
// room may need this raised to avoid false triggers. Raised from 0.02 after
// reports of the mic opening a "listening" turn on ambient room noise alone
// (fan hum, faint echo) — Whisper then hallucinates plausible filler text
// ("Thank you.", etc.) for that noise-only clip and Nova answers it,
// making the assistant seem to "hear and say whatever it wants."
const VOICE_RMS_THRESHOLD = 0.035;
// A separate, lower threshold used ONLY while Nova is speaking (barge-in
// detection), not while idly listening. The two situations have opposite
// risk profiles: while listening, a too-low threshold means ambient noise
// keeps opening false "someone spoke" turns (see VOICE_RMS_THRESHOLD above).
// While Nova is speaking, the mic's own echoCancellation/autoGainControl
// actively suppress input that resembles what's coming out of the speakers
// — on a laptop with no headset, this can shave real speech down well below
// 0.035 even when the student is genuinely talking. A student trying and
// failing to interrupt is a worse experience than an occasional false
// barge-in (worst case: Nova pauses briefly and resumes), so this threshold
// is deliberately looser.
const VOICE_BARGE_IN_RMS_THRESHOLD = 0.015;
function AIChatPanel({ materialId, currentPage, totalPages, panelVisible, onAdvancePage }) {
  const { lang } = useLang();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: lang === "my"
        ? "👋 မင်္ဂလာပါ။ ကျွန်ုပ်က ဒီသင်ခန်းစာကို ဦးဆောင်သင်ပေးမယ့် Professor Nova ပါ။"
        : "👋 Hello. I'm Professor Nova, ready to guide you through this lesson.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lessonStarted, setLessonStarted] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("ready");
  const [voiceQuestion, setVoiceQuestion] = useState("");
  const [voiceReply, setVoiceReply] = useState("");
  // Captions (the spoken text on screen) are a per-viewer preference — some
  // want to read along, others find it noisy. Remember the choice so it sticks
  // across turns and sessions. Wrapped in try/catch: localStorage can throw or
  // be empty (private windows, cleared storage) and the panel must still work.
  const [captionsOn, setCaptionsOn] = useState(() => {
    try { return localStorage.getItem("nova_voice_captions") !== "off"; } catch { return true; }
  });
  function toggleCaptions() {
    setCaptionsOn(prev => {
      const next = !prev;
      try { localStorage.setItem("nova_voice_captions", next ? "on" : "off"); } catch { /* ignore */ }
      return next;
    });
  }
  const bottomRef = useRef(null);
  const audioRef = useRef(null);
  // Sentences queued for TTS during a streamed reply — filled as SSE events
  // arrive (see sendMessageStreaming) and drained one at a time by
  // playNextQueuedSentence, so the first sentence starts playing while later
  // ones are still being generated instead of waiting for the whole reply.
  const speechQueueRef = useRef([]);
  const isDrainingQueueRef = useRef(false);
  // The in-flight fetch() reading a streamed reply's SSE body, if any — so an
  // interruption can actually cancel the network request (and stop the
  // backend from continuing to generate an answer nobody will hear), not
  // just ignore whatever it produces after the fact.
  const activeStreamAbortRef = useRef(null);
  // Monotonic counter bumped every time voice output is stopped — i.e. at every
  // interruption or new turn. An async reply (TTS/LLM) captures it before its
  // await and bails if it no longer matches after, so a stale answer that was
  // still in flight when the student moved on never plays over the new one.
  const playbackSeqRef = useRef(0);
  // Mic + recording plumbing, set up once per voice-mode session (not once
  // per turn) so the browser's permission prompt only ever appears the one
  // time, and re-armed as a fresh MediaRecorder per turn.
  const micStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const vadFrameRef = useRef(null);
  const turnStartedAtRef = useRef(0);
  const speechStartedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  // Read inside the voice-activity loop and async STT/TTS callbacks instead
  // of the `voiceOpen`/`voiceStatus` state values directly — those closures
  // capture whatever render created them, so a stale read would keep the
  // mic running after the panel closed, or miss a barge-in. Kept in sync
  // manually (not via an effect) so it's already correct on the very next
  // callback; voiceStatusRef only gates the voice-activity loop, where a
  // render's worth of lag is harmless.
  const voiceOpenRef = useRef(false);
  const voiceStatusRef = useRef(voiceStatus);
  useEffect(() => { voiceStatusRef.current = voiceStatus; }, [voiceStatus]);
  // Barge-in specifically turned out NOT to tolerate that lag: with the
  // streaming voice pipeline calling setMessages once per sentence (many
  // re-renders in quick succession while Nova is talking), the "a render's
  // worth of lag is harmless" assumption above stopped holding for the one
  // check that's actually time-critical — the VAD loop's "is Nova currently
  // speaking, so any voice detected should interrupt her" test. Set directly,
  // synchronously, at the exact same call sites that start/stop playback —
  // no React state or effect in the path — so the interrupt check in
  // runVoiceActivityLoop can never read a stale value.
  const isNovaSpeakingRef = useRef(false);
  // Whether the lesson-opening message has been read aloud yet this mount.
  // Text mode always auto-generates that opening message on mount (see the
  // effect below), whether or not the student ever opens voice — without
  // this flag, the first time they DO open voice, openVoiceMode would see an
  // existing assistant message already in `messages` and treat it as "lesson
  // already underway", jumping straight to continueLessonAloud (next concept)
  // and silently skipping the opening the student never actually heard.
  const introSpokenRef = useRef(false);
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
  const speechSupported = getVoiceInputSupport();

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

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

  // Voice mode's own mic/recording lifecycle must never survive the
  // component that owns it — closing the material or switching lessons
  // mid-conversation would otherwise leave the mic recording or a turn
  // still pending.
  useEffect(() => {
    return () => {
      releaseMic();
      stopAllVoiceOutput();
    };
  }, []);

  // AIChatPanel never unmounts when the chat sidebar is collapsed — the
  // parent only slides it out of view with CSS (chatSlideContent) — so an
  // open voice session would otherwise keep listening and replying
  // indefinitely in the background, invisible, after the student closes the
  // sidebar by its handle instead of the voice panel's own End Voice Chat/X
  // button. Collapsing the sidebar must end any active voice session too.
  const wasPanelVisibleRef = useRef(panelVisible);
  useEffect(() => {
    if (wasPanelVisibleRef.current && !panelVisible) closeVoiceMode();
    wasPanelVisibleRef.current = panelVisible;
  }, [panelVisible]);

  async function ensureMic() {
    if (micStreamRef.current) return micStreamRef.current;
    // Explicit, not just relying on the browser default: echoCancellation
    // matters most here — without it, the mic (especially laptop mic +
    // speakers, no headphones) can pick up Nova's own TTS audio right back
    // out of the speakers and misread it as the student talking.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micStreamRef.current = stream;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    return stream;
  }

  function releaseMic() {
    cancelAnimationFrame(vadFrameRef.current);
    recorderRef.current = null;
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  // Root-mean-square amplitude of the current mic input, 0 (silence) to
  // roughly 1 (loud) — a simple, cheap enough-for-this stand-in for real
  // voice-activity detection, checked on every animation frame.
  function currentVoiceVolume() {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    return Math.sqrt(sumSquares / data.length);
  }

  // Shared by the text input's Send button and voice mode, so a spoken
  // question gets the exact same assistant-mode request and history as a
  // typed one. Returns the reply text so voice mode knows what to speak.
  async function sendMessage(text, { voice = false, teachingIntent = null } = {}) {
    if (!text || sending) return null;
    setMessages(prev => [...prev, { role: "user", text }]);
    setSending(true);
    let replyText;
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
        voice,
      });
      replyText = data.reply || data.response || "...";
    } catch {
      replyText = "⚠️ Something went wrong. Please try again.";
    }
    setMessages(prev => [...prev, { role: "assistant", text: replyText }]);
    setSending(false);
    return replyText;
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !lessonStarted) return;
    setInput("");
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
      onAdvancePage(nextPage);
    }
  }

  async function continueLesson() {
    advanceToNextPage();
    await sendMessage("Continue the lesson with the next important concept.", { teachingIntent: "continue" });
  }

  async function simplifyLesson() {
    await sendMessage("Please explain the current concept more simply.", { teachingIntent: "simplify" });
  }

  async function checkUnderstanding() {
    await sendMessage("Check my understanding with one question.", { teachingIntent: "check" });
  }

  // Opens talking, not listening — a professor-led lesson shouldn't greet
  // the student with silence and wait to be asked something. If the lesson
  // hasn't produced anything to say yet (still loading), fall back to
  // listening rather than continuing on nothing.
  async function openVoiceMode() {
    voiceOpenRef.current = true;
    setVoiceOpen(true);
    // ensureMic() used to only ever get called from startListening() — fine
    // when that was the only way voice mode opened, but once opening could
    // also go straight into continueLessonAloud() (so Nova starts talking
    // immediately instead of opening into silence), that branch skipped mic
    // setup entirely. micStreamRef stayed null for the rest of the session,
    // so playNextQueuedSentence's `if (micStreamRef.current && ...)` guard
    // for starting the barge-in recorder was always false — the VAD loop
    // never started at all, not "started but insensitive". Call it here,
    // unconditionally, before either branch, so both paths always have a
    // live mic stream to watch for an interruption.
    try {
      await ensureMic();
    } catch {
      setVoiceStatus("ready");
      return;
    }
    if (!voiceOpenRef.current) return; // closed while the permission prompt was up
    const lastAssistantMessage = [...messagesRef.current].reverse().find(m => m.role === "assistant");
    if (lastAssistantMessage && !introSpokenRef.current) {
      // Text mode already auto-generated the lesson's opening on mount (see
      // the materialId effect above) — the student just hasn't heard it yet
      // because they opened voice mode instead of reading it. Read that
      // existing opening aloud instead of calling continueLessonAloud, which
      // would ask the LLM for the *next* concept and skip the opening
      // entirely.
      introSpokenRef.current = true;
      setVoiceQuestion("");
      setVoiceReply(lastAssistantMessage.text);
      await speak(lastAssistantMessage.text);
    } else if (lessonStarted && lastAssistantMessage) {
      await continueLessonAloud();
    } else {
      startListening();
    }
  }

  function closeVoiceMode() {
    voiceOpenRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* already stopped */ }
    }
    releaseMic();
    stopAllVoiceOutput();
    setVoiceOpen(false);
    setVoiceStatus("ready");
    setVoiceQuestion("");
    setVoiceReply("");
  }

  // Tapping the orb while Nova is talking cuts her off immediately — the
  // backup path for when voice barge-in (the voice-activity loop below)
  // either isn't confident enough to trigger on its own, no microphone is
  // available, or the student would rather just tap.
  function interruptAndListen() {
    stopAllVoiceOutput();
    if (recorderRef.current && recorderRef.current.state === "recording") {
      // speak() already has a recorder running in the background to watch
      // for exactly this — just relabel it as a real listening turn instead
      // of stopping and reopening the mic.
      const now = Date.now();
      turnStartedAtRef.current = now;
      speechStartedAtRef.current = now;
      lastVoiceAtRef.current = now;
      setVoiceStatus("listening");
    } else {
      startListening();
    }
  }

  // Once the panel is open, the mic re-opens itself after every reply (and
  // after a silent/no-speech timeout) so the conversation just keeps going —
  // the student never has to tap the orb again mid-conversation, only to
  // start it and to end it.
  async function startListening() {
    if (!speechSupported) return;
    try {
      await ensureMic();
    } catch {
      // Permission denied, no mic present, etc. — nothing to fall back to.
      setVoiceStatus("ready");
      return;
    }
    if (!voiceOpenRef.current) return; // closed while the permission prompt was up
    setVoiceReply("");
    turnStartedAtRef.current = Date.now();
    speechStartedAtRef.current = 0;
    lastVoiceAtRef.current = Date.now();
    setVoiceStatus("listening");
    beginRecordingSegment();
  }

  // Starts one MediaRecorder segment on the already-open mic stream and the
  // voice-activity loop that watches it. Used both to open a normal
  // listening turn and, from speak(), to watch for a barge-in while Nova
  // talks — same recording either way, only the current voiceStatus (read
  // fresh each frame in the loop below) decides what a detected voice means.
  function beginRecordingSegment() {
    const stream = micStreamRef.current;
    if (!stream) return;
    let recorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      return;
    }
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.onstop = finishTurn;
    recorderRef.current = recorder;
    recorder.start();
    runVoiceActivityLoop();
  }

  function runVoiceActivityLoop() {
    const tick = () => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        // TEMP DIAGNOSTIC — remove once barge-in is confirmed fixed. If this
        // fires while Nova is audibly speaking, the VAD loop has silently
        // died (no recorder, or it isn't "recording") and no amount of
        // fixing the interrupt *logic* will help until this prints nothing.
        console.log("[VAD] loop stopped — recorder:", recorder, "state:", recorder?.state);
        return;
      }
      const now = Date.now();
      const vol = currentVoiceVolume();
      // Barge-in uses a looser threshold than idle listening — see
      // VOICE_BARGE_IN_RMS_THRESHOLD's comment: echoCancellation/
      // autoGainControl actively suppress mic input that resembles Nova's
      // own voice coming out of the speakers, so genuine interrupting speech
      // can read much quieter than the same speech would during silence.
      const activeThreshold = isNovaSpeakingRef.current ? VOICE_BARGE_IN_RMS_THRESHOLD : VOICE_RMS_THRESHOLD;
      const isVoice = vol > activeThreshold;
      // TEMP DIAGNOSTIC — throttled to ~2/sec so it's readable. Reports the
      // three things that decide whether an interrupt fires: is Nova
      // considered to be speaking, how loud the mic reads right now, and
      // whether that loudness clears the threshold.
      if (!tick._lastLog || now - tick._lastLog > 500) {
        tick._lastLog = now;
        console.log("[VAD]", { isNovaSpeaking: isNovaSpeakingRef.current, vol: vol.toFixed(4), threshold: activeThreshold, isVoice, voiceStatus: voiceStatusRef.current });
      }

      if (isNovaSpeakingRef.current) {
        // The first sound of the student's voice interrupts Nova immediately
        // — the recording just keeps going, now capturing their question.
        if (isVoice) {
          console.log("[VAD] BARGE-IN TRIGGERED — calling stopAllVoiceOutput()");
          stopAllVoiceOutput();
          turnStartedAtRef.current = now;
          speechStartedAtRef.current = now;
          lastVoiceAtRef.current = now;
          setVoiceStatus("listening");
        }
      } else if (voiceStatusRef.current === "listening") {
        if (isVoice) {
          if (!speechStartedAtRef.current) speechStartedAtRef.current = now;
          lastVoiceAtRef.current = now;
        }
        const spokeLongEnough = speechStartedAtRef.current
          && (now - speechStartedAtRef.current) >= VOICE_MIN_SPEECH_MS;
        const silentFor = now - lastVoiceAtRef.current;
        const elapsed = now - turnStartedAtRef.current;
        // Never spoke at all this turn, and stayed quiet long enough that
        // Nova should stop waiting to be asked and continue teaching on her
        // own (see finishTurn's silence branch below).
        const staysSilentTooLong = !speechStartedAtRef.current && elapsed >= VOICE_PROACTIVE_CONTINUE_MS;
        if ((spokeLongEnough && silentFor >= VOICE_SILENCE_TIMEOUT_MS) || staysSilentTooLong || elapsed >= VOICE_MAX_TURN_MS) {
          try { recorder.stop(); } catch { /* already stopped */ }
          return; // onstop → finishTurn takes it from here; stop polling
        }
      }
      vadFrameRef.current = requestAnimationFrame(tick);
    };
    vadFrameRef.current = requestAnimationFrame(tick);
  }

  // The recorder's onstop handler — runs whether a turn ended because the
  // student finished talking, because it timed out, or because voice mode
  // was closed mid-turn.
  async function finishTurn() {
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];
    const hadSpeech = Boolean(speechStartedAtRef.current);
    if (!voiceOpenRef.current) return;

    if (!hadSpeech || chunks.length === 0) {
      // Silence or noise-only for the whole turn — a professor-led lesson
      // shouldn't just sit waiting to be asked something. This is
      // specifically "explained a page, gave the student a chance to ask
      // something, they didn't" — advance the actual PDF page here (not in
      // continueLessonAloud itself, which is also used just to resume
      // talking when voice mode reopens mid-conversation and shouldn't skip
      // a page just for that), then continue teaching from the new page.
      // The student can still interrupt any time (barge-in) once Nova
      // starts talking again.
      advanceToNextPage();
      continueLessonAloud();
      return;
    }

    setVoiceStatus("thinking");
    try {
      const mimeType = recorderRef.current?.mimeType || "audio/webm";
      const extension = mimeType.split("/")[1]?.split(";")[0] || "webm";
      const blob = new Blob(chunks, { type: mimeType });
      const form = new FormData();
      form.append("audio", blob, `voice-question.${extension}`);
      form.append("lang", lang);
      const { data } = await API.post("/multimodal/transcribe", form);
      const text = (data.text || "").trim();
      if (text) { await handleVoiceResult(text); return; }
    } catch { /* fall through to just listening again */ }
    if (voiceOpenRef.current) startListening();
    else setVoiceStatus("ready");
  }

  async function handleVoiceResult(text) {
    setVoiceQuestion(text);
    setVoiceStatus("thinking");
    const seq = playbackSeqRef.current;
    // sendMessageStreaming already speaks each sentence as it arrives (see
    // enqueueSentence inside it) — no separate speak(reply) call needed here,
    // that would just replay the whole thing a second time.
    const reply = await sendMessageStreaming(text, { teachingIntent: "answer" });
    // "End call" (closeVoiceMode) can land while the reply is still being
    // generated — don't keep captions from a closed panel. And if the student
    // already moved on to a newer question (the sequence was bumped), this
    // reply's own sentences were already dropped inside the queue, so just
    // skip updating state for it here too.
    if (!voiceOpenRef.current || seq !== playbackSeqRef.current) { setVoiceStatus("ready"); return; }
    if (!reply) { setVoiceStatus("ready"); return; }
    setVoiceReply(reply);
  }

  // Nova continuing the lecture on her own initiative — not the student
  // asking a question — used both when a listening turn goes by in total
  // silence (see finishTurn) and to kick voice mode off already talking
  // instead of opening into silent waiting.
  async function continueLessonAloud() {
    setVoiceQuestion("");
    setVoiceStatus("thinking");
    const seq = playbackSeqRef.current;
    const reply = await sendMessageStreaming("Continue the lesson with the next important concept.", { teachingIntent: "continue" });
    if (!voiceOpenRef.current || seq !== playbackSeqRef.current) { setVoiceStatus("ready"); return; }
    if (!reply) { startListening(); return; }
    setVoiceReply(reply);
  }

  // Shared by both TTS paths so listening always resumes the same way once
  // Nova finishes talking (or fails to).
  function resumeAfterSpeaking() {
    isNovaSpeakingRef.current = false;
    if (!voiceOpenRef.current) { setVoiceStatus("ready"); return; }
    if (recorderRef.current && recorderRef.current.state === "recording") {
      // The barge-in watcher speak() started was already running silently
      // through the whole reply with nothing detected — just relabel it as
      // the next listening turn instead of stopping and reopening the mic.
      const now = Date.now();
      turnStartedAtRef.current = now;
      lastVoiceAtRef.current = now;
      setVoiceStatus("listening");
    } else {
      startListening();
    }
  }

  // The ElevenLabs <audio> element and the browser's own speechSynthesis are
  // two entirely separate playback engines — nothing stops both from being
  // audible at once if one starts before the other's been told to stop.
  // Every path into either voice output goes through here first so a
  // fallback (or a fresh reply) never overlaps whatever was already playing.
  function stopAllVoiceOutput() {
    // Cleared immediately, synchronously — the moment an interrupt is
    // detected, Nova is no longer "speaking" as far as the VAD loop is
    // concerned, with no React render/effect in between to lag behind.
    isNovaSpeakingRef.current = false;
    // Bump first: any TTS/reply already awaiting a response is now stale and
    // must not play, even though its audio element doesn't exist yet for the
    // pause() below to catch. Every check against playbackSeqRef elsewhere
    // (queue draining, the streaming reader loop, enqueueSentence) uses this
    // same counter as the one source of truth for "does this still belong to
    // the current turn" — bumping it here is what invalidates all of them at
    // once, not each piece separately.
    playbackSeqRef.current += 1;
    // Drop anything queued for a reply that no longer matters, and reset the
    // draining flag so the queue isn't left permanently "stuck" thinking a
    // (now-abandoned) drain is still in progress — see playNextQueuedSentence.
    speechQueueRef.current = [];
    isDrainingQueueRef.current = false;
    // Actually cancel the network request, not just ignore its result — a
    // student interrupting mid-answer means the backend can stop generating
    // an answer nobody is going to hear.
    activeStreamAbortRef.current?.abort();
    activeStreamAbortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
  }

  function speakWithBrowserVoice(text) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { resumeAfterSpeaking(); return; }
    stopAllVoiceOutput();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.onend = resumeAfterSpeaking;
    utterance.onerror = resumeAfterSpeaking;
    setVoiceStatus("speaking");
    isNovaSpeakingRef.current = true;
    window.speechSynthesis.speak(utterance);
  }

  // Prefer the ElevenLabs voice (same one as the Nova agent) over the
  // browser's built-in speech synthesis — falls back to the browser voice
  // if ElevenLabs is unavailable (e.g. not configured, or plan limits)
  // rather than going silent.
  async function speak(text) {
    setVoiceStatus("speaking");
    stopAllVoiceOutput();
    isNovaSpeakingRef.current = true; // set after stopAllVoiceOutput, which clears it
    const seq = playbackSeqRef.current; // this reply's playback generation
    if (micStreamRef.current) beginRecordingSegment(); // watch for a barge-in while she talks
    // Every language — Burmese included — goes through /classroom/tts now: the
    // backend routes Burmese to Azure (my-MM-NilarNeural), which ElevenLabs
    // can't pronounce, and everything else to ElevenLabs. The browser voice
    // stays as a last-resort fallback below if the request or playback fails.
    try {
      const { data } = await API.post("/classroom/tts", { text }, { responseType: "blob" });
      // The TTS round-trip can outlast this reply's turn. Bail if the panel
      // closed (End call) OR a newer turn/interruption bumped the sequence
      // while the audio was in flight — otherwise this stale reply plays on
      // top of the new one, two voices at once.
      if (!voiceOpenRef.current || seq !== playbackSeqRef.current) return;
      const url = URL.createObjectURL(data);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); resumeAfterSpeaking(); };
      audio.onerror = () => { URL.revokeObjectURL(url); speakWithBrowserVoice(text); };
      await audio.play();
    } catch {
      if (voiceOpenRef.current && seq === playbackSeqRef.current) speakWithBrowserVoice(text);
    }
  }

  // Queues one sentence of a streamed reply and, if nothing is already
  // playing, starts draining the queue immediately — the first sentence to
  // arrive starts speaking right away instead of waiting for sendMessage's
  // whole reply. Later sentences just join the queue and play back to back
  // once whatever's currently speaking finishes. `seq` is the generation this
  // sentence was produced under (captured by the caller at the start of that
  // turn) — if the student has since interrupted (stopAllVoiceOutput bumps
  // playbackSeqRef), this sentence belongs to an abandoned reply and must
  // never be queued, no matter how far the SSE stream that produced it has
  // already gotten.
  function enqueueSentence(text, seq) {
    if (!text || seq !== playbackSeqRef.current) return;
    speechQueueRef.current.push(text);
    if (!isDrainingQueueRef.current) playNextQueuedSentence();
  }

  async function playNextQueuedSentence() {
    const next = speechQueueRef.current.shift();
    if (!next) { isDrainingQueueRef.current = false; resumeAfterSpeaking(); return; }
    isDrainingQueueRef.current = true;
    setVoiceStatus("speaking");
    isNovaSpeakingRef.current = true;
    const seq = playbackSeqRef.current;
    // Barge-in watcher only needs to start once per reply, not once per
    // sentence — starting a fresh MediaRecorder segment mid-reply would drop
    // whatever partial "is the student talking" state it had built up.
    // TEMP DIAGNOSTIC — remove once barge-in is confirmed fixed.
    console.log("[VAD] playNextQueuedSentence guard check:", {
      hasMicStream: Boolean(micStreamRef.current),
      recorderState: recorderRef.current?.state,
      willCallBeginRecordingSegment: Boolean(micStreamRef.current) && recorderRef.current?.state !== "recording",
    });
    if (micStreamRef.current && recorderRef.current?.state !== "recording") beginRecordingSegment();
    try {
      const { data } = await API.post("/classroom/tts", { text: next }, { responseType: "blob" });
      if (!voiceOpenRef.current || seq !== playbackSeqRef.current) {
        // Interrupted while this sentence's TTS was in flight. Don't play it
        // — but also don't leave the queue thinking a drain is still under
        // way forever; stopAllVoiceOutput already emptied the queue and
        // reset this flag itself, but reset it again defensively in case
        // this callback lands after some other path already reset it, so a
        // stray leftover `true` here can never block the next real turn's
        // first enqueueSentence from starting to drain.
        isDrainingQueueRef.current = false;
        return;
      }
      const url = URL.createObjectURL(data);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); playNextQueuedSentence(); };
      audio.onerror = () => { URL.revokeObjectURL(url); playNextQueuedSentence(); };
      await audio.play();
    } catch {
      if (voiceOpenRef.current && seq === playbackSeqRef.current) playNextQueuedSentence();
      else isDrainingQueueRef.current = false;
    }
  }

  // Streaming counterpart to sendMessage, used only for voice turns: reads
  // the backend's SSE reply (see materialAI's `voice` branch) sentence by
  // sentence, speaking each one as it arrives instead of waiting for the
  // whole reply before saying anything. `mySeq` — captured once at the top —
  // is this turn's generation; every SSE event re-checks it against
  // playbackSeqRef.current before touching shared state, so a student
  // interrupting mid-stream (stopAllVoiceOutput bumps the seq and aborts
  // the fetch below) reliably stops this turn from enqueueing more speech or
  // mutating the chat transcript, even for events already in flight when the
  // interrupt happened. Falls back to a plain non-streaming request only for
  // a genuine failure (stream never opened, connection dropped) — an
  // intentional abort is not a failure and must not trigger a retry.
  async function sendMessageStreaming(text, { teachingIntent = null } = {}) {
    if (!text || sending) return null;
    const mySeq = playbackSeqRef.current;
    setMessages(prev => [...prev, { role: "user", text }]);
    setSending(true);
    speechQueueRef.current = [];
    const controller = new AbortController();
    activeStreamAbortRef.current = controller;
    let fullReply = "";
    let assistantIndex = -1;
    let aborted = false;
    try {
      const history = buildRecentHistory();
      const token = localStorage.getItem("nova_token");
      const res = await fetch(`http://localhost:5001/api/classroom/materials/${materialId}/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "chat",
          mode: teachingIntent || lessonStarted ? "teacher" : "assistant",
          ...(teachingIntent || lessonStarted ? { teachingIntent: teachingIntent || "answer" } : {}),
          message: text,
          history,
          currentPage: currentPageRef.current,
          totalPages: totalPagesRef.current,
          lang,
          voice: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        if (mySeq !== playbackSeqRef.current) { aborted = true; break; } // interrupted between reads
        const { value, done } = await reader.read();
        if (done) break;
        if (mySeq !== playbackSeqRef.current) { aborted = true; break; } // interrupted while awaiting this chunk
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop(); // last (possibly incomplete) chunk stays buffered
        for (const line of lines) {
          const jsonStr = line.replace(/^data:\s*/, "").trim();
          if (!jsonStr) continue;
          let evt;
          try { evt = JSON.parse(jsonStr); } catch { continue; }
          if (evt.type === "sentence") {
            fullReply += (fullReply ? " " : "") + evt.text;
            enqueueSentence(evt.text, mySeq);
            if (mySeq === playbackSeqRef.current) {
              setMessages(prev => {
                if (assistantIndex === -1) {
                  assistantIndex = prev.length;
                  return [...prev, { role: "assistant", text: evt.text }];
                }
                const copy = [...prev];
                copy[assistantIndex] = { role: "assistant", text: fullReply };
                return copy;
              });
            }
          }
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        aborted = true;
      } else if (mySeq === playbackSeqRef.current) {
        // A genuine failure (not an interruption) with nothing spoken yet for
        // this turn — fall back to a plain single-shot request. Built
        // directly here (not via sendMessage) so it doesn't re-append the
        // user message sendMessageStreaming already added above, and so its
        // reply actually gets spoken — sendMessage on its own never calls
        // speak()/enqueueSentence, that's the caller's job in the normal
        // (streaming-succeeded) path, which never runs when we fall back
        // here.
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
            voice: true,
          });
          fullReply = data.reply || data.response || "";
          if (fullReply && mySeq === playbackSeqRef.current) {
            setMessages(prev => [...prev, { role: "assistant", text: fullReply }]);
            enqueueSentence(fullReply, mySeq);
          }
        } catch {
          fullReply = "";
          if (mySeq === playbackSeqRef.current) {
            setMessages(prev => [...prev, { role: "assistant", text: "⚠️ Something went wrong. Please try again." }]);
          }
        }
      } else {
        aborted = true;
      }
    }
    if (activeStreamAbortRef.current === controller) activeStreamAbortRef.current = null;
    setSending(false);
    return aborted ? null : (fullReply || null);
  }

  return (
    <div style={chatPanel}>
      <div style={chatHeader}>
        <span style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
          <Icon name="chat" size={16} alt="" /> Nova Teacher
        </span>
        <span style={{ fontSize: "11px", color: "#22c55e", fontWeight: 600 }}>{lessonStarted ? "● TEACHING" : "● READY"}</span>
      </div>
      <div style={chatMessages}>
        {!lessonStarted && (
          <div style={teacherStartCard}>
            <strong>Professor-led lesson</strong>
            <span>Nova is preparing your lesson — she'll explain this PDF step by step, use examples, and check your understanding.</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={m.role === "user" ? userBubbleWrap : aiBubbleWrap}>
            <div style={m.role === "user" ? userBubble : aiBubble}>{m.text}</div>
          </div>
        ))}
        {sending && (
          <div style={aiBubbleWrap}>
            <div style={{ ...aiBubble, color: "var(--text-faint)", fontStyle: "italic" }}>Thinking…</div>
          </div>
        )}
        {lessonStarted && (
          <div style={teacherActions} aria-label="Nova Teacher lesson actions">
            <button type="button" style={teacherActionButton} onClick={continueLesson} disabled={sending}>Continue lesson</button>
            <button type="button" style={teacherActionButton} onClick={simplifyLesson} disabled={sending}>Explain simply</button>
            <button type="button" style={teacherActionButton} onClick={checkUnderstanding} disabled={sending}>Check my understanding</button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={chatInputRow}>
        <input
          style={chatInput}
          placeholder={lessonStarted ? "Ask Professor Nova about this lesson…" : "Start the lesson to learn with Nova Teacher…"}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          disabled={sending || !lessonStarted}
        />
        {speechSupported && (
          // Also disabled while `sending` — lessonStarted flips true right as
          // the opening lecture request goes out, before its reply has
          // actually arrived. Without this, tapping the mic in that window
          // opens voice mode with no assistant message yet to speak, so
          // openVoiceMode falls back to silently listening — Nova never
          // makes a sound, and it looks like voice mode is just broken.
          <button type="button" style={micBtn} onClick={openVoiceMode} aria-label="Start voice chat" disabled={sending || !lessonStarted}>
            <Icon name="microphone" size={16} alt="" />
          </button>
        )}
        <button style={sendBtn} onClick={send} disabled={sending || !lessonStarted || !input.trim()} aria-label="Send message">
          <Icon name="sent" size={16} alt="" style={{ filter: "brightness(0) invert(1)" }} />
        </button>
      </div>

      {voiceOpen && (
        <div style={voiceOverlay}>
          <button
            type="button" onClick={closeVoiceMode} style={voiceCloseBtn} aria-label="Close voice chat"
            onMouseEnter={e => { e.currentTarget.style.background = "var(--border)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-alt)"; }}
          >✕</button>

          <div style={voiceOrbStage}>
            <button
              type="button"
              onClick={voiceStatus === "ready" ? startListening : voiceStatus === "speaking" ? interruptAndListen : undefined}
              disabled={voiceStatus === "thinking"}
              style={{
                ...voiceOrb,
                ...(voiceStatus === "listening" ? voiceOrbListening : {}),
                ...(voiceStatus === "thinking" ? voiceOrbThinking : {}),
                ...(voiceStatus === "speaking" ? voiceOrbSpeaking : {}),
              }}
              aria-label={voiceStatus === "ready" ? "Start talking" : voiceStatus === "speaking" ? "Interrupt and talk" : undefined}
            >
              <Icon name="microphone" size={30} alt="" style={{ filter: "brightness(0) invert(1)" }} />
            </button>
            <div
              aria-hidden="true"
              style={{
                ...voiceOrbHalo,
                ...(voiceStatus === "listening" ? voiceOrbHaloListening : {}),
                ...(voiceStatus === "thinking" ? voiceOrbHaloThinking : {}),
                ...(voiceStatus === "speaking" ? voiceOrbHaloSpeaking : {}),
              }}
            />
          </div>

          <div style={voiceStatusBlock}>
            <div style={voiceStatusRow}>
              {voiceStatus === "listening" && <span style={voiceStatusDot} />}
              <span style={voiceStatusText}>{VOICE_STATUS_LABEL[voiceStatus]}</span>
            </div>
            {voiceStatus === "speaking" && (
              <div style={voiceStatusHint}>Just start talking to interrupt</div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCaptions}
            style={voiceCaptionToggle}
            aria-pressed={captionsOn}
          >
            {captionsOn ? "Hide captions" : "Show captions"}
          </button>

          {captionsOn && voiceStatus !== "listening" && (voiceQuestion || voiceReply) && (
            <div style={voiceCaptionBox}>
              {voiceQuestion && <div style={voiceCaptionQuestion}>You: {voiceQuestion}</div>}
              {voiceReply && <div style={voiceCaptionReply}>{voiceReply}</div>}
            </div>
          )}

          <button type="button" onClick={closeVoiceMode} style={voiceEndBtn}>
            <Icon name="multiply" size={13} alt="" style={{ filter: "brightness(0) invert(1)" }} /> End Voice Chat
          </button>
        </div>
      )}
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

const chatHeader = {
  height: "48px", flexShrink: 0, display: "flex", alignItems: "center",
  justifyContent: "space-between", padding: "0 16px",
  borderBottom: "1px solid var(--border)", background: "var(--surface-alt)",
};

const chatMessages = {
  flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px",
  display: "flex", flexDirection: "column", gap: "10px",
};

const teacherStartCard = {
  display: "flex", flexDirection: "column", gap: "8px", padding: "14px",
  borderRadius: "12px", background: "linear-gradient(135deg, #EEF2FF, #F8FAFF)",
  border: "1px solid #C7D2FE", color: "#312E81", fontSize: "13px", lineHeight: 1.45,
};

const teacherActions = { display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "2px" };

const teacherActionButton = {
  background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", borderRadius: "999px",
  padding: "7px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer",
};

const aiBubbleWrap = { display: "flex", justifyContent: "flex-start" };
const userBubbleWrap = { display: "flex", justifyContent: "flex-end" };

const aiBubble = {
  maxWidth: "85%", background: "var(--surface-alt)", color: "var(--text)",
  borderRadius: "12px 12px 12px 2px", padding: "10px 12px",
  fontSize: "13px", lineHeight: 1.55, whiteSpace: "pre-wrap",
};

const userBubble = {
  maxWidth: "85%", background: "var(--primary)", color: "#fff",
  borderRadius: "12px 12px 2px 12px", padding: "10px 12px",
  fontSize: "13px", lineHeight: 1.55, whiteSpace: "pre-wrap",
};

const chatInputRow = {
  flexShrink: 0, display: "flex", gap: "8px", padding: "12px 14px",
  borderTop: "1px solid var(--border)", background: "var(--surface)",
};

const chatInput = {
  flex: 1, border: "1px solid var(--border)", borderRadius: "8px",
  padding: "8px 12px", fontSize: "13px", outline: "none",
  color: "var(--text)", background: "var(--surface)",
};

const sendBtn = {
  background: "var(--primary)", color: "#fff", border: "none", borderRadius: "8px",
  padding: "8px 14px", fontSize: "15px", cursor: "pointer", flexShrink: 0,
};

const micBtn = {
  background: "var(--surface-alt)", color: "var(--text-muted)", border: "1px solid var(--border)",
  borderRadius: "8px", padding: "8px 10px", cursor: "pointer", flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const voiceOverlay = {
  position: "absolute", inset: 0, background: "var(--surface)",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: "22px", padding: "32px",
  animation: "overlayFadeIn 200ms ease-out",
};

const voiceCloseBtn = {
  position: "absolute", top: "14px", right: "14px",
  width: "30px", height: "30px", borderRadius: "50%",
  background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text-muted)",
  fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  transition: "background 0.15s ease",
};

// The button and its halo share this stage so the halo can sit precisely
// behind it, independently sized and animated, without affecting layout.
const voiceOrbStage = {
  position: "relative", width: "180px", height: "180px",
  display: "flex", alignItems: "center", justifyContent: "center",
};

// A liquid, morphing blob rather than a static circle — border-radius (not
// width/height) is animated so the wobble is paint-only, never triggers
// layout. Each status runs the same wobble/gradient-shift pair at a
// different speed, so the orb's motion itself communicates idle vs.
// listening vs. thinking vs. speaking, the way a live voice assistant's
// orb does — no separate icon or waveform needed to convey status.
const voiceOrb = {
  position: "relative", zIndex: 2,
  width: "116px", height: "116px", border: "none",
  borderRadius: "42% 58% 65% 35% / 45% 45% 55% 55%",
  background: "linear-gradient(135deg, var(--primary-light), var(--primary), var(--primary-dark), var(--primary))",
  backgroundSize: "300% 300%",
  boxShadow: "0 12px 32px rgba(59, 55, 204, 0.35)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", transition: "transform 0.2s ease",
  animation: "voiceOrbWobble 7s ease-in-out infinite, voiceGradientShift 6s ease infinite",
};

const voiceOrbListening = {
  animation: "voiceOrbWobble 3.2s ease-in-out infinite, voiceGradientShift 4s ease infinite, voiceListenPulse 1.8s ease-in-out infinite",
  cursor: "default",
};

const voiceOrbThinking = {
  animation: "voiceOrbWobble 2s ease-in-out infinite, voiceGradientShift 2.6s ease infinite",
  cursor: "default", opacity: 0.88,
};

const voiceOrbSpeaking = {
  animation: "voiceOrbWobble 1.1s ease-in-out infinite, voiceGradientShift 1.4s ease infinite",
};

// A soft blurred halo behind the orb — bigger and hazier than the orb
// itself, breathing at its own slower rhythm. This is what makes the whole
// thing read as "a presence in the room" rather than just a button with a
// pulse animation on it.
const voiceOrbHalo = {
  position: "absolute", zIndex: 1, inset: "12px",
  borderRadius: "50%",
  background: "radial-gradient(circle, var(--primary-light) 0%, var(--primary) 55%, transparent 75%)",
  filter: "blur(22px)", opacity: 0.45,
  animation: "voiceHaloBreathe 5s ease-in-out infinite",
};

const voiceOrbHaloListening = { animation: "voiceHaloBreathe 2.4s ease-in-out infinite", opacity: 0.6 };
const voiceOrbHaloThinking = { animation: "voiceHaloBreathe 1.6s ease-in-out infinite", opacity: 0.4 };
const voiceOrbHaloSpeaking = { animation: "voiceHaloBreathe 0.9s ease-in-out infinite", opacity: 0.65 };

const voiceStatusBlock = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
};

const voiceStatusRow = {
  display: "flex", alignItems: "center", gap: "8px",
};

const voiceStatusDot = {
  width: "7px", height: "7px", borderRadius: "50%",
  background: "var(--success)",
  animation: "liveDotPulse 1.6s ease-in-out infinite",
};

const voiceStatusText = {
  fontSize: "14px", fontWeight: 600, color: "var(--text)", letterSpacing: "0.01em",
};

const voiceStatusHint = {
  fontSize: "12px", color: "var(--text-faint)",
};

const voiceCaptionToggle = {
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--text-faint)", borderRadius: "20px",
  padding: "5px 14px", fontSize: "11.5px", fontWeight: 600,
  cursor: "pointer", letterSpacing: "0.01em",
};

const voiceCaptionBox = {
  maxWidth: "100%", maxHeight: "160px", overflowY: "auto",
  display: "flex", flexDirection: "column", gap: "10px",
  padding: "14px 16px", borderRadius: "14px",
  background: "var(--surface-alt)", border: "1px solid var(--border)",
  animation: "overlayFadeIn 200ms ease-out",
};

const voiceCaptionQuestion = {
  fontSize: "12px", fontWeight: 600, color: "var(--text-faint)", textAlign: "center",
};

const voiceCaptionReply = {
  fontSize: "14px", color: "var(--text)", textAlign: "center", lineHeight: 1.5,
};

const voiceEndBtn = {
  display: "flex", alignItems: "center", gap: "6px",
  background: "var(--danger)", color: "#fff", border: "none", borderRadius: "20px",
  padding: "9px 18px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer",
  marginTop: "4px", letterSpacing: "0.01em",
};
