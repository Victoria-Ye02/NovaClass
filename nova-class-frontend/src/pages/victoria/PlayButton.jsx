import { useState } from "react";
import { speakKorean, canSpeak } from "./speakKorean";

// The minimal speaker-icon button that reads a Korean text aloud (ElevenLabs; browser voice as a fallback).
function SpeakerIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

// `label` (optional) turns the round icon button into a wide button with text next to the icon.
export default function PlayButton({ text, speed = "normal", label }) {
  const [busy, setBusy] = useState(false);          // while the audio is being made or fetched
  async function play() {
    setBusy(true);
    try { await speakKorean(text, speed); } finally { setBusy(false); }
  }
  return (
    <button type="button" style={label ? p.wide : p.play} onClick={play} disabled={!canSpeak() || busy} aria-label={`Play: ${text}`} title="Listen">{busy ? <span aria-hidden="true">…</span> : <SpeakerIcon />}{label && <span>{label}</span>}</button>
  );
}

const p = {
  play: { flexShrink: 0, width: "34px", height: "34px", borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  wide: { flex: "1 1 130px", padding: "13px 16px", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--primary)", fontSize: "15px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
};
