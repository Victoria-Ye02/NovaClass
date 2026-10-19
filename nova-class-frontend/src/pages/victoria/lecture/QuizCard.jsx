import { L } from "./lectureStyles";

const LETTERS = ["A", "B", "C", "D"];

// The pop-up check-in card: question, tappable options, instant feedback with
// the reason, then a choice between practising and moving on. Purely
// presentational — MaterialPreview owns what "continue" and "your turn" do.
export default function QuizCard({ quiz, onPick, onSkip, onNext, onYourTurn }) {
  if (!quiz || quiz.status === "idle") return null;

  if (quiz.status === "loading") {
    return <div style={L.quiz} role="status"><span style={L.quizEyebrow}>QUICK CHECK</span><span style={L.quizMuted}>Preparing a question…</span></div>;
  }
  if (quiz.status === "error") {
    return (
      <div style={L.quiz} role="alert">
        <span style={L.quizEyebrow}>QUICK CHECK</span>
        <span style={L.quizMuted}>Couldn't load the question just now.</span>
        <div style={L.quizButtons}><button type="button" style={L.ghost} onClick={onSkip}>Close</button></div>
      </div>
    );
  }

  const { data, picked, result } = quiz;
  const answered = quiz.status === "answered";
  const isTrueFalse = data.kind === "tf";

  return (
    <div style={L.quiz} role="group" aria-label="Quick check">
      <div style={L.quizHead}>
        <span style={L.quizEyebrow}>QUICK CHECK</span>
        {!answered && <button type="button" style={L.quizSkip} onClick={onSkip}>Skip</button>}
      </div>
      <div style={L.quizQuestion}>{data.question}</div>

      <div style={isTrueFalse ? L.quizRowOptions : L.quizOptions}>
        {data.options.map((option, index) => {
          const isPicked = picked === index;
          const isCorrect = answered && result.correctIndex === index;
          const isWrongPick = answered && isPicked && !result.correct;
          return (
            <button
              key={index}
              type="button"
              style={{
                ...L.quizOption,
                ...(isTrueFalse ? { flex: 1, justifyContent: "center" } : {}),
                ...(isCorrect ? L.quizCorrect : {}),
                ...(isWrongPick ? L.quizWrong : {}),
                ...(!answered && isPicked ? L.quizPicked : {}),
              }}
              onClick={() => onPick(index)}
              disabled={quiz.status !== "ready"}
              aria-label={`${isTrueFalse ? "" : `${LETTERS[index]}. `}${option}`}
            >
              {!isTrueFalse && <span style={L.quizLetter}>{LETTERS[index]}</span>}
              <span>{option}</span>
              {isCorrect && <span aria-hidden="true"> ✓</span>}
              {isWrongPick && <span aria-hidden="true"> ✗</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <>
          <div style={{ ...L.quizFeedback, ...(result.correct ? L.quizFeedbackOk : L.quizFeedbackBad) }} role="status">
            <strong>{result.correct ? "Correct!" : "Not quite."}</strong>{" "}
            {result.explanation}
          </div>
          <div style={L.quizButtons}>
            {result.practicePrompt && <button type="button" style={L.action} onClick={() => onYourTurn(result.practicePrompt)}>Your turn ✍️</button>}
            <button type="button" style={L.playBtnSmall} onClick={onNext}>Next slide →</button>
          </div>
        </>
      )}
    </div>
  );
}
