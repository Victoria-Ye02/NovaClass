import { useEffect, useRef, useState } from "react";
import { useLang } from "../../LanguageContext";
import API from "../../services/api";

// A teacher gives a recording of their own voice (and says they allow it); the lessons of their classes are then read in that voice.
export default function TeacherVoiceCard({ cardStyle, titleStyle }) {
  const { t } = useLang();
  const [status, setStatus] = useState(null);            // { hasVoice, label } once known
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);          // { ok, text }
  const picker = useRef(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);

  // stop the microphone if the teacher leaves the page while recording
  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await API.get("/classroom/voice/me");
        if (alive && res?.data) setStatus(res.data);
      } catch { /* the card just offers to make a voice */ }
    })();
    return () => { alive = false; };
  }, []);

  const reasonOf = err => err?.response?.data?.error || t("voiceFailed");

  // Records the teacher's voice in the browser; the result becomes the same file the upload picker would give.
  function startRecording() {
    if (recording || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage({ ok: false, text: t("voiceNoMic") });
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(mic => {
      stream.current = mic;
      chunks.current = [];
      const rec = new MediaRecorder(mic);
      recorder.current = rec;
      rec.ondataavailable = e => { if (e.data?.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        setFile(new File([new Blob(chunks.current, { type })], `teacher-voice-${Date.now()}.${ext}`, { type }));
        if (picker.current) picker.current.value = "";
        mic.getTracks().forEach(track => track.stop());
        setRecording(false);
      };
      rec.start();
      setRecording(true);
      setMessage(null);
    }).catch(() => setMessage({ ok: false, text: t("voiceNoMic") }));
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function make() {
    if (!file || !consent || busy) return;
    setBusy(true); setMessage(null);
    try {
      const form = new FormData();
      form.append("sample", file);
      form.append("consent", "true");
      const res = await API.post("/classroom/voice/me", form);
      setStatus(res.data);
      setFile(null); setConsent(false);
      if (picker.current) picker.current.value = "";
      setMessage({ ok: true, text: t("voiceActive") });
    } catch (err) {
      setMessage({ ok: false, text: reasonOf(err) });
    }
    setBusy(false);
  }

  async function remove() {
    if (busy || !window.confirm(t("voiceConfirmRemove"))) return;
    setBusy(true); setMessage(null);
    try {
      const res = await API.delete("/classroom/voice/me");
      setStatus(res.data);
    } catch (err) {
      setMessage({ ok: false, text: reasonOf(err) });
    }
    setBusy(false);
  }

  return (
    <div style={cardStyle} data-testid="teacher-voice">
      <h3 style={titleStyle}>🎙️ {t("voiceTitle")}</h3>
      <p style={v.text}>{t("voiceIntro")}</p>
      {status?.hasVoice && (
        <div style={v.active}>
          <span>{t("voiceActive")}</span>
          <button type="button" style={v.link} onClick={remove} disabled={busy}>{t("voiceRemove")}</button>
        </div>
      )}
      <div style={v.row}>
        <button type="button" style={{ ...v.recordBtn, ...(recording ? v.recordOn : {}) }} disabled={busy}
          onClick={recording ? stopRecording : startRecording}>
          {recording ? t("voiceStop") : t("voiceRecord")}
        </button>
        {recording && <p role="status" style={v.recHint}>{t("voiceRecording")}</p>}
      </div>
      <div style={v.row}>
        <input ref={picker} id="teacher-voice-file" type="file" accept="audio/*,video/mp4,video/quicktime" aria-label={t("voiceChoose")}
          onChange={e => setFile(e.target.files?.[0] || null)} style={v.file} />
      </div>
      <label style={v.consent}>
        <input id="teacher-voice-consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>{t("voiceConsent")}</span>
      </label>
      <button type="button" style={{ ...v.btn, ...(!file || !consent || busy ? v.btnOff : {}) }} disabled={!file || !consent || busy} onClick={make}>
        {busy ? t("voiceMaking") : t("voiceMake")}
      </button>
      {message && <p role="status" style={{ ...v.message, color: message.ok ? "var(--success)" : "var(--danger)" }}>{message.text}</p>}
    </div>
  );
}

const v = {
  text: { fontSize: "13px", lineHeight: 1.6, color: "var(--text-muted)", marginBottom: "14px" },
  active: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "10px 12px", marginBottom: "14px", borderRadius: "10px", background: "var(--primary-tint)", color: "var(--primary)", fontSize: "13px", fontWeight: 600 },
  link: { background: "none", border: "none", color: "var(--danger)", fontSize: "13px", fontWeight: 600, textDecoration: "underline", cursor: "pointer" },
  row: { marginBottom: "12px" },
  recordBtn: { padding: "9px 14px", marginBottom: "10px", border: "1px solid var(--primary)", borderRadius: "10px", background: "transparent", color: "var(--primary)", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  recordOn: { background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" },
  recHint: { margin: "0 0 8px", fontSize: "13px", fontWeight: 600, color: "var(--danger)" },
  file: { width: "100%", fontSize: "13px", color: "var(--text)" },
  consent: { display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", lineHeight: 1.5, color: "var(--text)", marginBottom: "14px" },
  btn: { width: "100%", padding: "11px", border: "none", borderRadius: "10px", background: "var(--primary)", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer" },
  btnOff: { opacity: 0.5, cursor: "not-allowed" },
  message: { marginTop: "12px", fontSize: "13px", fontWeight: 600 },
};
