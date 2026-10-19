import { useEffect, useMemo, useRef } from "react";
import { L } from "./lectureStyles";
import { activeSentenceIndex, splitSentences } from "./lectureText";

// The live lecture script: one scrolling card with what Professor Nova is
// narrating right now, instead of a stack of chat bubbles. While the narration
// plays, the sentence being spoken is highlighted and kept in view.
export default function Teleprompter({ text, page, totalPages, question, loading, keyPoints = [], follow = false, progress = 0 }) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const activeIndex = follow ? activeSentenceIndex(sentences, progress) : -1;
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <section style={L.script} aria-label="Live lecture script">
      <div style={L.scriptHead}>
        <span style={L.chip}>{page ? `SLIDE ${page}${totalPages ? ` / ${totalPages}` : ""}` : "LECTURE"}</span>
        <span style={L.scriptLabel}>Live lecture script</span>
      </div>
      {question && <div style={L.question}>You asked: {question}</div>}
      <div style={L.scriptBody} role="log" aria-live="polite">
        {loading && !text ? (
          <div aria-label="Preparing the lecture">
            {[92, 100, 78, 96, 60].map((width, i) => <div key={i} style={{ ...L.skeleton, width: `${width}%` }} />)}
          </div>
        ) : follow ? (
          sentences.map((sentence, i) => (
            <span
              key={i}
              ref={i === activeIndex ? activeRef : undefined}
              data-active={i === activeIndex ? "true" : undefined}
              style={{ ...L.sentence, ...(i === activeIndex ? L.sentenceActive : {}), ...(i < activeIndex ? L.sentencePast : {}) }}
            >{sentence}</span>
          ))
        ) : (
          // Rendered as one piece of text when nothing is playing, so it
          // reads (and selects) as a normal paragraph.
          text
        )}
      </div>
      {keyPoints.length > 0 && (
        <div style={L.keyPoints} aria-label="Key points">
          {keyPoints.map(point => <span key={point} style={L.keyPoint}>{point}</span>)}
        </div>
      )}
    </section>
  );
}
