import { L } from "./lectureStyles";

const RING = {
  speaking: "#6366F1",
  listening: "#14B8A6",
  thinking: "#F59E0B",
  paused: "#94A3B8",
  idle: "#A5B4FC",
};

// The virtual professor. `level` (0..1) is the live audio loudness: it drives
// the mouth and the glow, so she visibly "speaks" in time with the narration.
export default function ProfessorAvatar({ state = "idle", level = 0, size = 112 }) {
  const color = RING[state] || RING.idle;
  const speaking = state === "speaking";
  const mouthOpen = speaking ? 1.6 + Math.min(level * 1.6, 1) * 6.5 : 0;
  const ringStyle = {
    ...L.ring,
    border: `2px solid ${color}`,
    boxShadow: `0 0 ${14 + (speaking ? level * 34 : 0)}px ${color}${speaking ? "" : "88"}`,
    transform: speaking ? `scale(${1 + level * 0.07})` : undefined,
    animation: speaking
      ? "none"
      : state === "thinking"
        ? "lectureThink 1.2s ease-in-out infinite"
        : state === "listening" || state === "idle"
          ? "lectureBreath 3.6s ease-in-out infinite"
          : "none",
  };

  return (
    <div style={{ ...L.avatarWrap, width: size, height: size }} data-avatar-state={state}>
      <div className="lecture-ring" style={ringStyle} aria-hidden="true" />
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Professor Nova">
        <defs>
          <linearGradient id="lectureAvatarBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4F46E5" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
          <clipPath id="lectureAvatarClip"><circle cx="60" cy="60" r="58" /></clipPath>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#lectureAvatarBg)" />
        <g clipPath="url(#lectureAvatarClip)">
          <path d="M14 124c3-26 22-36 46-36s43 10 46 36z" fill="#1F2937" />
          <path d="M50 88l10 14 10-14z" fill="#F8FAFC" />
          <rect x="52" y="74" width="16" height="16" rx="6" fill="#E8B88F" />
          <ellipse cx="60" cy="55" rx="22" ry="25" fill="#F2C9A5" />
          <path d="M38 52c0-17 10-25 22-25s22 8 22 25c-4-9-11-13-22-13s-18 4-22 13z" fill="#3B2F2F" />
          <path d="M28 30l32-13 32 13-32 13z" fill="#111827" />
          <path d="M43 38v9c0 4 8 8 17 8s17-4 17-8v-9" fill="#1F2937" />
          <path d="M91 30v15" stroke="#FBBF24" strokeWidth="2" />
          <circle cx="91" cy="47" r="2.6" fill="#FBBF24" />
          <circle cx="50" cy="58" r="7.5" fill="none" stroke="#374151" strokeWidth="1.8" />
          <circle cx="70" cy="58" r="7.5" fill="none" stroke="#374151" strokeWidth="1.8" />
          <path d="M57.5 58h5" stroke="#374151" strokeWidth="1.8" />
          <circle cx="50" cy="58" r="2" fill="#1F2937" />
          <circle cx="70" cy="58" r="2" fill="#1F2937" />
          {speaking
            ? <ellipse cx="60" cy="72" rx="6.5" ry={mouthOpen / 2} fill="#7F1D1D" />
            : <path d="M53 71c3 3.6 11 3.6 14 0" fill="none" stroke="#7F1D1D" strokeWidth="2" strokeLinecap="round" />}
        </g>
      </svg>
    </div>
  );
}
