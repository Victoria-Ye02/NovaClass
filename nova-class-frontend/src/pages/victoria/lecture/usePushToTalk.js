import { useCallback, useEffect, useRef, useState } from "react";
import API from "../../../services/api";

export const MAX_RECORD_SECONDS = 30;
const MIN_RECORD_MS = 700;

export function isPushToTalkSupported() {
  return typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof window !== "undefined"
    && typeof window.MediaRecorder !== "undefined";
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  const isSupported = window.MediaRecorder?.isTypeSupported;
  if (typeof isSupported !== "function") return "";
  return candidates.find(type => isSupported.call(window.MediaRecorder, type)) || "";
}

const MESSAGES = {
  denied: "Microphone access was blocked. Allow it in your browser, or type your question instead.",
  unavailable: "No microphone was found. You can type your question instead.",
  short: "That was too short — hold on a little longer, then tap the mic again to finish.",
  empty: "I couldn't hear any speech. Try again a bit closer to the mic, or type your question.",
  failed: "Couldn't turn that into text. Try again, or type your question.",
};

// Push-to-talk for the lecture panel: tap the mic to start, tap again to stop.
// One recording → one Whisper transcription → an editable draft the student
// confirms before anything is sent. There is no always-on listening and no
// takeover screen; the mic is released after every recording.
//
// state: idle | recording | transcribing | review
export default function usePushToTalk({ lang, context = "" } = {}) {
  const [state, setState] = useState("idle");
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const startedAtRef = useRef(0);
  const seqRef = useRef(0);
  const discardRef = useRef(false);

  const release = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = 0;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    try { ctxRef.current?.close?.(); } catch { /* ignore */ }
    ctxRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => {
    seqRef.current += 1;
    discardRef.current = true;
    try { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); } catch { /* ignore */ }
    release();
  }, [release]);

  const watchLevel = useCallback((stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* the meter is optional */ }
  }, []);

  const transcribe = useCallback(async (blob, seq) => {
    setState("transcribing");
    try {
      const form = new FormData();
      const extension = (blob.type || "").includes("mp4") ? "m4a" : (blob.type || "").includes("ogg") ? "ogg" : "webm";
      form.append("audio", blob, `voice-question.${extension}`);
      if (lang) form.append("lang", lang);
      if (context) form.append("context", context);
      const { data } = await API.post("/multimodal/transcribe", form);
      if (seq !== seqRef.current) return;
      const text = (data?.text || "").trim();
      if (!text) { setError(MESSAGES.empty); setState("idle"); return; }
      setDraft(text);
      setState("review");
    } catch {
      if (seq !== seqRef.current) return;
      setError(MESSAGES.failed);
      setState("idle");
    }
  }, [lang, context]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (state === "recording" || state === "transcribing") return;
    setError("");
    setDraft("");
    const seq = ++seqRef.current;
    discardRef.current = false;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      setError(err?.name === "NotFoundError" ? MESSAGES.unavailable : MESSAGES.denied);
      setState("idle");
      return;
    }
    if (seq !== seqRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      release();
      setError(MESSAGES.unavailable);
      setState("idle");
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = event => { if (event.data?.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const elapsed = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      release();
      if (discardRef.current || seq !== seqRef.current) return;
      if (elapsed < MIN_RECORD_MS || blob.size === 0) { setError(MESSAGES.short); setState("idle"); return; }
      transcribe(blob, seq);
    };

    startedAtRef.current = Date.now();
    setSeconds(0);
    recorder.start();
    watchLevel(stream);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORD_SECONDS) stop();
    }, 250);
    setState("recording");
  }, [state, release, transcribe, watchLevel, stop]);

  // Throw the recording or draft away without sending anything.
  const cancel = useCallback(() => {
    seqRef.current += 1;
    discardRef.current = true;
    try { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); } catch { /* ignore */ }
    release();
    setDraft("");
    setError("");
    setState("idle");
  }, [release]);

  // The student sent the draft (or asked for a fresh take).
  const consume = useCallback(() => {
    const text = draft.trim();
    setDraft("");
    setState("idle");
    return text;
  }, [draft]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle" || state === "review") start();
  }, [state, start, stop]);

  return { state, level, seconds, draft, setDraft, error, start, stop, toggle, cancel, consume };
}
