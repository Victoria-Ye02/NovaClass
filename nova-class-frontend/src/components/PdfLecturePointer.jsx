const toPercent = fraction => `${fraction * 100}%`;

// The professor's "pointer": a soft highlighter stroke over the words she is
// explaining right now, with a small arrow tag at its left edge. Pure overlay —
// it never takes the mouse, so text selection underneath keeps working.
export default function PdfLecturePointer({ pointer }) {
  if (!pointer?.rects?.length) return null;
  return (
    <div
      data-testid="pdf-lecture-pointer"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }}
    >
      <style>{`
        @keyframes lecturePointerIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes lecturePointerGlow { 0%,100% { box-shadow: 0 0 0 2px rgba(99,102,241,.55), 0 0 10px rgba(99,102,241,.35); } 50% { box-shadow: 0 0 0 2px rgba(99,102,241,.85), 0 0 18px rgba(99,102,241,.55); } }
        @media (prefers-reduced-motion: reduce) { [data-lecture-pointer] { animation: none !important; } }
      `}</style>
      {pointer.rects.map((rect, index) => (
        <div
          key={`${pointer.key}-${index}`}
          data-lecture-pointer
          style={{
            position: "absolute",
            left: toPercent(rect.x),
            top: toPercent(rect.y),
            width: toPercent(rect.width),
            height: toPercent(rect.height),
            borderRadius: "5px",
            background: "rgba(129, 140, 248, 0.28)",
            animation: "lecturePointerIn .22s ease-out, lecturePointerGlow 1.8s ease-in-out infinite",
          }}
        >
          {index === 0 && (
            <span
              style={{
                position: "absolute",
                left: "-22px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "#4F46E5",
                color: "#fff",
                fontSize: "10px",
                lineHeight: 1,
                boxShadow: "0 2px 6px rgba(79,70,229,.5)",
              }}
            >
              ▶
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
