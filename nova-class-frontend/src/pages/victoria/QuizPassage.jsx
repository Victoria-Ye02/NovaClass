import { useState, useRef } from "react";
import { scriptLines, speakLines, stopSpeaking } from "./speakKorean";

// The text a Smart Drill question is about. Reading and writing questions show their passage; a listening question shows a
// Listen button that reads the script aloud (ElevenLabs, line by line) and keeps the script hidden until the student asks for
// it or has answered.
export default function QuizPassage({ question, answered }) {
  const [playing, setPlaying] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [progress, setProgress] = useState(null);          // { at, total } while the script is being read
  const [note, setNote] = useState("");                   // what to tell the student when the ElevenLabs voice could not be used
  const stopped = useRef(false);
  if (!question.passage) return null;

  if (question.domain !== "listening") {
    return <div style={q.box} data-testid="quiz-passage">{question.passage}</div>;
  }

  async function listen() {
    if (playing) { stopped.current = true; stopSpeaking(); setPlaying(false); return; }
    stopped.current = false;
    setNote("");
    setPlaying(true);
    try {
      const used = await speakLines(scriptLines(question.passage), "normal", () => stopped.current, (at, total) => setProgress({ at, total }));
      if (!stopped.current && used === "browser") setNote("The ElevenLabs voice could not be loaded, so the browser voice was used. It may be silent: check the server and your volume.");
      if (!stopped.current && used === "none") setNote("The audio could not be played. Check that the server is running and that this tab is not muted.");
    } finally { setPlaying(false); setProgress(null); }
  }

  const visible = showScript || answered;
  return (
    <div style={q.listen} data-testid="quiz-listening">
      <div style={q.bar}>
        <button type="button" style={q.btn} onClick={listen} aria-pressed={playing}>{playing ? "⏹ Stop" : "🔊 Listen"}</button>
        {progress && <span style={q.status} data-testid="quiz-audio-progress">Playing {progress.at} / {progress.total}…</span>}
        {!answered && <button type="button" style={q.btn} onClick={() => setShowScript(s => !s)} aria-expanded={showScript}>{showScript ? "Hide script" : "Show script"}</button>}
      </div>
      {note && <p style={q.note} role="alert" data-testid="quiz-audio-note">{note}</p>}
      {visible && <div style={q.script} data-testid="quiz-script">{question.passage}</div>}
    </div>
  );
}

const q = {
  box: { margin: "0 0 14px", padding: "14px 16px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface-alt)", color: "var(--text)", fontSize: "15px", lineHeight: 1.8, whiteSpace: "pre-line" },
  listen: { margin: "0 0 14px" },
  bar: { display: "flex", gap: "8px", flexWrap: "wrap" },
  btn: { padding: "9px 16px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--primary)", fontWeight: 700, fontSize: "14px", cursor: "pointer" },
  status: { alignSelf: "center", color: "var(--text-muted)", fontSize: "13px" },
  note: { margin: "8px 0 0", color: "#B91C1C", fontSize: "13px" },
  script: { marginTop: "10px", padding: "12px 14px", borderRadius: "12px", border: "1px dashed var(--border)", background: "var(--surface-alt)", color: "var(--text)", fontSize: "14.5px", lineHeight: 1.8, whiteSpace: "pre-line" },
};
