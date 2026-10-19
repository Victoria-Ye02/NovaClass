import { BAR_COUNT } from "./useNarrationPlayer";
import { L } from "./lectureStyles";

// Rendered with plain divs (not a canvas) so it is trivial to test and stays
// crisp at any size. Bars left of the playhead are drawn in the accent colour,
// the rest muted — it doubles as the progress bar and is clickable to seek.
export default function AudioWaveform({ bars, progress = 0, active = false, onSeek }) {
  const percent = Math.round(progress * 100);

  function seekFromPointer(event) {
    if (!onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width > 0) onSeek((event.clientX - rect.left) / rect.width);
  }

  function seekFromKey(event) {
    if (!onSeek) return;
    if (event.key === "ArrowRight") { event.preventDefault(); onSeek(Math.min(progress + 0.05, 1)); }
    if (event.key === "ArrowLeft") { event.preventDefault(); onSeek(Math.max(progress - 0.05, 0)); }
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Audio progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={L.wave}
      onClick={seekFromPointer}
      onKeyDown={seekFromKey}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const value = active ? (bars?.[i] ?? 0.08) : 0.1 + 0.08 * Math.sin(i * 0.7);
        const played = (i + 0.5) / BAR_COUNT <= progress;
        return (
          <span
            key={i}
            data-bar
            style={{
              ...L.bar,
              height: `${Math.max(8, Math.round(value * 100))}%`,
              background: played ? "var(--primary)" : "var(--border)",
            }}
          />
        );
      })}
    </div>
  );
}
