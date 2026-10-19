import AudioWaveform from "./AudioWaveform";
import ProfessorAvatar from "./ProfessorAvatar";
import QuizCard from "./QuizCard";
import Teleprompter from "./Teleprompter";
import { LECTURE_KEYFRAMES, L } from "./lectureStyles";
import { formatClock } from "./lectureText";

const LANGUAGE_LABEL = { en: "English", ko: "한국어", my: "မြန်မာ", vi: "Tiếng Việt" };
const STATUS_COLOR = { speaking: "#6366F1", listening: "#14B8A6", thinking: "#F59E0B", paused: "#94A3B8", idle: "#22C55E" };

const icon = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true };
const PlayIcon = () => <svg {...icon}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>;
const PauseIcon = () => <svg {...icon}><rect x="6" y="5" width="4.2" height="14" rx="1.2" /><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" /></svg>;
const StopIcon = () => <svg {...icon}><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>;
const ReplayIcon = () => <svg {...icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>;
const MicIcon = () => <svg {...icon}><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 15z" /><path d="M5.5 11.5a1 1 0 1 1 2 0 4.5 4.5 0 0 0 9 0 1 1 0 1 1 2 0 6.5 6.5 0 0 1-5.5 6.42V20h2a1 1 0 1 1 0 2h-6a1 1 0 1 1 0-2h2v-2.08A6.5 6.5 0 0 1 5.5 11.5z" /></svg>;

function playLabel(status) {
  if (status === "playing") return "Pause presentation";
  if (status === "paused") return "Resume presentation";
  if (status === "loading") return "Loading voice…";
  if (status === "ended") return "Replay narration";
  return "Play narration";
}

// The right-hand "virtual professor" panel: avatar, live teleprompter script,
// audio player and the mic. Purely presentational — MaterialPreview owns the
// lesson logic and passes in state and callbacks.
export default function LectureStage({
  statusLabel, avatarState, level, page, totalPages, script, keyPoints, question, scriptLoading,
  narration, mic, actions, textFallback, notice, quiz, language,
}) {
  const color = STATUS_COLOR[avatarState] || STATUS_COLOR.idle;
  const playing = narration.status === "playing";
  const recording = mic.state === "recording";
  const showPlayhead = narration.status === "playing" || narration.status === "paused" || narration.status === "ended";

  return (
    <div style={L.root}>
      <style>{LECTURE_KEYFRAMES}</style>
      <div style={L.header}>
        <div style={{ lineHeight: 0 }}><ProfessorAvatar state={avatarState} level={level} size={34} /></div>
        <div>
          <div style={L.headerName}>Professor Nova</div>
          <div style={{ ...L.headerStatus, color }}><span style={{ ...L.dot, background: color }} />{statusLabel}</div>
        </div>
        {language && (
          <div style={L.langChip} title={language.overridden ? "You asked for this language. Click × to go back to your Settings language." : "Teaching language (from Settings). Ask Professor Nova to switch, e.g. “explain in English”."}>
            <span>{LANGUAGE_LABEL[language.code] || language.code}</span>
            {language.overridden && (
              <button type="button" style={L.langReset} onClick={language.onReset} aria-label="Back to my Settings language">×</button>
            )}
          </div>
        )}
      </div>

      <div style={L.stage}><ProfessorAvatar state={avatarState} level={level} size={112} /></div>

      <Teleprompter
        text={script}
        page={page}
        totalPages={totalPages}
        question={question}
        loading={scriptLoading}
        keyPoints={keyPoints}
        follow={showPlayhead}
        progress={narration.progress}
      />

      {quiz && <QuizCard quiz={quiz.state} onPick={quiz.onPick} onSkip={quiz.onSkip} onNext={quiz.onNext} onYourTurn={quiz.onYourTurn} />}

      <div style={L.controls}>
        <AudioWaveform bars={narration.viz.bars} progress={showPlayhead ? narration.progress : 0} active={playing} onSeek={narration.onSeek} />
        <div style={L.clockRow}>
          <span>{formatClock(narration.clock.current)}</span>
          <span>{formatClock(narration.clock.duration)}</span>
        </div>

        <div style={L.buttonRow}>
          <button type="button" style={L.iconBtn} onClick={narration.onReplay} disabled={!script} aria-label="Replay from the start" title="Replay from the start">
            <ReplayIcon />
          </button>
          <button
            type="button"
            style={{ ...L.playBtn, opacity: !script || narration.status === "loading" ? 0.6 : 1 }}
            onClick={narration.onToggle}
            disabled={!script}
            aria-label={playLabel(narration.status)}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
            {playLabel(narration.status)}
          </button>
          {mic.supported && (
            <button
              type="button"
              style={{ ...L.iconBtn, ...(recording ? L.micOn : {}) }}
              onClick={mic.onToggle}
              disabled={mic.disabled || mic.state === "transcribing"}
              aria-label={recording ? "Stop recording" : "Ask a question by voice"}
              aria-pressed={recording}
              title={recording ? "Tap to stop and send" : "Tap to ask by voice"}
            >
              {recording ? <StopIcon /> : <MicIcon />}
            </button>
          )}
        </div>

        {mic.supported && mic.state !== "idle" && (
          <div style={L.voiceDock} role="group" aria-label="Voice question">
            {recording && (
              <>
                <div style={L.voiceMeterRow}>
                  <span style={L.recDot} />
                  <span style={L.voiceText}>Listening… {formatClock(mic.seconds)}</span>
                  <div style={L.meterTrack} aria-hidden="true"><div style={{ ...L.meterFill, width: `${Math.round(mic.level * 100)}%` }} /></div>
                </div>
                <div style={L.voiceHint}>Speak your question, then tap the mic (or Done) to finish.</div>
                <div style={L.voiceButtons}>
                  <button type="button" style={L.action} onClick={mic.onToggle}>Done</button>
                  <button type="button" style={L.ghost} onClick={mic.onCancel}>Cancel</button>
                </div>
              </>
            )}
            {mic.state === "transcribing" && <div style={L.voiceText}>Turning your voice into text…</div>}
            {mic.state === "review" && (
              <>
                <label style={L.voiceHint} htmlFor="lecture-voice-draft">Here is what I heard — fix anything before asking:</label>
                <textarea
                  id="lecture-voice-draft"
                  style={L.draftBox}
                  rows={3}
                  value={mic.draft}
                  onChange={event => mic.onDraft(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); mic.onSend(); } }}
                  aria-label="What I heard"
                />
                <div style={L.voiceButtons}>
                  <button type="button" style={{ ...L.playBtnSmall, opacity: mic.draft.trim() && !mic.disabled ? 1 : 0.55 }} onClick={mic.onSend} disabled={!mic.draft.trim() || mic.disabled}>Ask Nova</button>
                  <button type="button" style={L.ghost} onClick={mic.onToggle}>Re-record</button>
                  <button type="button" style={L.ghost} onClick={mic.onCancel}>Discard</button>
                </div>
              </>
            )}
          </div>
        )}

        {mic.error && <div style={L.notice} role="alert">{mic.error}</div>}
        {notice && <div style={L.notice} role="status">{notice}</div>}

        <div style={L.actions} aria-label="Nova Teacher lesson actions">
          {actions.map(action => (
            <button key={action.label} type="button" style={{ ...L.action, opacity: action.disabled ? 0.55 : 1 }} onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </button>
          ))}
        </div>

        {textFallback && (
          <div style={L.textRow}>
            <input
              style={L.textInput}
              placeholder="Type your question…"
              value={textFallback.value}
              onChange={event => textFallback.onChange(event.target.value)}
              onKeyDown={event => event.key === "Enter" && !event.shiftKey && textFallback.onSubmit()}
              disabled={textFallback.disabled}
              aria-label="Type your question"
            />
            <button type="button" style={L.action} onClick={textFallback.onSubmit} disabled={textFallback.disabled || !textFallback.value.trim()}>Ask</button>
          </div>
        )}
      </div>
    </div>
  );
}
