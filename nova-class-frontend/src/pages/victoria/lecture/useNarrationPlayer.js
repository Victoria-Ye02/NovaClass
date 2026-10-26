import { useCallback, useEffect, useRef, useState } from "react";
import API from "../../../services/api";

export const BAR_COUNT = 36;
const IDLE_VIZ = { bars: Array(BAR_COUNT).fill(0.08), level: 0 };
const FRAME_MS = 45;

// Plays a lecture narration (text -> /classroom/tts -> audio) for the lesson
// panel. Deliberately separate from the voice-chat plumbing: narration never
// needs the microphone, and the student can pause, resume, replay and seek it.
//
// status: idle | loading | playing | paused | ended | blocked | error
//   blocked = the browser refused autoplay (no user gesture yet) — the UI shows
//   a Play button instead of staying silent.
export default function useNarrationPlayer(materialId) {
  const [status, setStatus] = useState("idle");
  const [clock, setClock] = useState({ current: 0, duration: 0 });
  const [viz, setViz] = useState(IDLE_VIZ);

  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const seqRef = useRef(0);
  const textRef = useRef("");

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastFrameRef.current < FRAME_MS) return;
      lastFrameRef.current = now;
      const audio = audioRef.current;
      if (audio) {
        setClock({ current: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
      }
      const analyser = analyserRef.current;
      let bars;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        // Speech energy sits well below 6 kHz, so only the low bins are drawn.
        bars = Array.from({ length: BAR_COUNT }, (_, i) => Math.min(1, (data[i + 1] || 0) / 190));
      } else {
        // No Web Audio (old browser): a gentle synthetic wave keeps the player alive.
        bars = Array.from({ length: BAR_COUNT }, (_, i) => 0.22 + 0.2 * Math.sin(now / 130 + i * 0.55));
      }
      setViz({ bars, level: bars.reduce((sum, b) => sum + b, 0) / BAR_COUNT });
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

  const teardown = useCallback(() => {
    stopLoop();
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onloadedmetadata = null;
      audio.pause();
    }
    audioRef.current = null;
    analyserRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setViz(IDLE_VIZ);
  }, [stopLoop]);

  const connectAnalyser = useCallback((audio) => {
    const AudioContextClass = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AudioContextClass) return;
    try {
      if (!ctxRef.current) ctxRef.current = new AudioContextClass();
      const ctx = ctxRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaElementSource(audio).connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    } catch {
      analyserRef.current = null; // audio still plays; only the live bars fall back
    }
  }, []);

  const play = useCallback(async (text) => {
    const clean = String(text || "").trim();
    if (!clean) return;
    teardown();
    const seq = ++seqRef.current;
    textRef.current = clean;
    setStatus("loading");
    setClock({ current: 0, duration: 0 });

    let blob;
    try {
      ({ data: blob } = await API.post("/classroom/tts", { text: clean, style: "lecture", ...(materialId ? { materialId } : {}) }, { responseType: "blob" }));
    } catch {
      if (seq === seqRef.current) setStatus("error");
      return;
    }
    if (seq !== seqRef.current) return; // a newer slide/turn replaced this one while the audio was generating

    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onloadedmetadata = () => setClock({ current: 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    audio.onended = () => {
      if (audioRef.current !== audio) return;
      stopLoop();
      setViz(IDLE_VIZ);
      setStatus("ended");
      setClock(c => ({ current: c.duration, duration: c.duration }));
    };
    audio.onerror = () => {
      if (audioRef.current !== audio) return;
      stopLoop();
      setStatus("error");
    };
    connectAnalyser(audio);
    try {
      await ctxRef.current?.resume?.();
      await audio.play();
      if (seq !== seqRef.current) { audio.pause(); return; }
      setStatus("playing");
      startLoop();
    } catch (err) {
      if (seq === seqRef.current) setStatus(err?.name === "NotAllowedError" ? "blocked" : "error");
    }
  }, [teardown, stopLoop, startLoop, connectAnalyser, materialId]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    stopLoop();
    setStatus("paused");
  }, [stopLoop]);

  const resume = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await ctxRef.current?.resume?.();
      await audio.play();
      setStatus("playing");
      startLoop();
    } catch {
      setStatus("blocked");
    }
  }, [startLoop]);

  const stop = useCallback(() => {
    seqRef.current += 1;
    teardown();
    setStatus("idle");
    setClock({ current: 0, duration: 0 });
  }, [teardown]);

  // One button for the whole player: pause while playing, resume while paused,
  // otherwise (re)start narrating `currentText`.
  const toggle = useCallback((currentText) => {
    if (status === "playing") return pause();
    if (status === "paused") return resume();
    if (status === "loading") return undefined;
    return play(currentText || textRef.current);
  }, [status, pause, resume, play]);

  const seek = useCallback((fraction) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.min(Math.max(fraction, 0), 1) * audio.duration;
    setClock({ current: audio.currentTime, duration: audio.duration });
  }, []);

  useEffect(() => () => {
    seqRef.current += 1;
    teardown();
    ctxRef.current?.close?.().catch?.(() => {});
  }, [teardown]);

  const progress = clock.duration > 0 ? Math.min(clock.current / clock.duration, 1) : (status === "ended" ? 1 : 0);
  return { status, clock, progress, viz, play, pause, resume, stop, toggle, seek };
}
