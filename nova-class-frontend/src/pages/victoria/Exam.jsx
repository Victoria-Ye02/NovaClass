import { useState, useEffect, useRef } from "react";
import Sidebar from "../../components/Sidebar";
import Icon from "../../components/Icon";
import API from "../../services/api";

const symbols = ["①", "②", "③", "④"];
const ROUNDS = ["102nd", "96th", "91st"];
// Reading/Writing are drawn randomly across ALL exam rounds regardless of any
// round choice, so a round only actually matters for Listening (tied to one
// specific recording) — question counts are fixed by the TOPIK II blueprint,
// so they're hardcoded here rather than needing a fetch before showing the picker.
const SECTIONS = [
  { key: "reading",   label: "Reading",   icon: "book",       minutes: 70, questionCount: 50 },
  { key: "listening", label: "Listening", icon: "headphones", minutes: 60, questionCount: 50 },
  { key: "writing",   label: "Writing",   icon: "pencil",     minutes: 50, questionCount: 4  },
];

function formatText(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// Listening prompts embed the full dialogue transcript alongside the direction
// line and printed options (ingested from the Transcript PDF for grading) —
// showing that on screen while the audio plays defeats the point of a
// listening test, so keep only the "※ ..." direction line(s) and the
// "①②③④" option line(s) and drop everything else (the transcript itself).
function listeningPromptForDisplay(prompt) {
  const lines = String(prompt || "").split("\n");
  const kept = lines.filter(line => /^\s*※/.test(line) || /[①②③④]/.test(line));
  return kept.length ? kept.join("\n") : prompt;
}

// Prompts keep the source exam's own printed question number (e.g. "2.",
// "4.") at the start of the sentence — since questions are pulled from
// different original papers, that number has nothing to do with this app's
// own "Question N of 50" position and is just confusing to show, so drop it.
function stripLeadingQuestionNumber(text) {
  return String(text || "").replace(/^\s*\d+\.\s*/gm, "");
}

// Splits a question's prompt text (instruction header + passage/question line(s),
// then the ①②③④ options — all one block of text, since reading/listening questions
// carry no separately structured options field) into { stem, options }, for the
// review screen where each of the 4 options needs to render as its own row rather
// than the compact symbol-only buttons used while taking the exam. Falls back to
// options: null (render the raw stem only) if the text doesn't cleanly split into
// exactly 4 options, e.g. an unusual/malformed prompt.
function splitPromptIntoStemAndOptions(text) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  const optionLineIdx = lines.findIndex(l => /[①②③④]/.test(l));
  if (optionLineIdx === -1) return { stem: raw.trim(), options: null };

  const stem = lines.slice(0, optionLineIdx).join("\n").trim();
  const optionsBlock = lines.slice(optionLineIdx).join(" ");
  const options = [...optionsBlock.matchAll(/[①②③④]\s*([^①②③④]*)/g)].map(m => m[1].trim());
  return { stem, options: options.length === 4 && options.every(Boolean) ? options : null };
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Exam() {
  const [step, setStep]     = useState("home"); // home | loading | picker | listeningRounds | exam | grading | results
  const [examData, setExamData] = useState(null);
  const [section, setSection]   = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // The round a listening attempt was fetched with — the only part of the
  // exam where "round" is a meaningful choice at all.
  const [listeningRound, setListeningRound] = useState(null);

  const [readingAnswers, setReadingAnswers]     = useState({});
  const [listeningAnswers, setListeningAnswers] = useState({});
  const [writingAnswers, setWritingAnswers]     = useState({});

  // Each of the 3 parts is graded as its own separate mock test — this keeps
  // the latest submission result per section so the picker screen can show
  // which parts are done, and results always reflect just the part you took.
  const [sectionResults, setSectionResults] = useState({});
  const [result, setResult]     = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [analytics, setAnalytics]         = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const submitRef = useRef(null);

  useEffect(() => {
    if (step !== "exam") return;
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(id);
          submitRef.current?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  function answersFor(key) {
    if (key === "reading") return [readingAnswers, setReadingAnswers];
    if (key === "listening") return [listeningAnswers, setListeningAnswers];
    return [writingAnswers, setWritingAnswers];
  }

  function answeredCountFor(key) {
    const [answers] = answersFor(key);
    if (key === "writing") return Object.values(answers).filter(v => (v || "").trim()).length;
    return Object.keys(answers).length;
  }

  function sectionLabel(key) {
    if (key === "listening") {
      return `TOPIK II - Listening${listeningRound ? ` (${listeningRound} round)` : ""} - Mock Test`;
    }
    return `TOPIK II - ${SECTIONS.find(s => s.key === key).label} - Mock Test`;
  }

  // Reading/Writing only need to be fetched once (any round works, the
  // content doesn't depend on it). Listening always fetches fresh against
  // whichever round was just chosen, since that's the one real choice here.
  async function enterSection(key, opts = {}) {
    const needsFetch = key === "listening" || !examData?.[key];
    if (needsFetch) {
      setStep("loading");
      const round = key === "listening" ? (opts.round || listeningRound || "102nd") : "102nd";
      try {
        const res = await API.get("/topik/exam/fresh", { params: { listening_round: round } });
        setExamData(prev => ({ ...(prev || {}), exam_id: prev?.exam_id || res.data.exam_id, [key]: res.data[key] }));
        if (key === "listening") {
          setListeningRound(round);
          setListeningAnswers({});
        }
      } catch (err) {
        setStep("picker");
        alert("❌ Failed to load the exam. " + (err.response?.data?.error?.message || "Make sure the exam service is running."));
        return;
      }
    }
    setSection(key);
    setSecondsLeft(SECTIONS.find(s => s.key === key).minutes * 60);
    setShowReview(false);
    setStep("exam");
  }

  async function submitExam() {
    if (!examData || !section) return;
    setStep("grading");
    try {
      const payload = { exam_id: examData.exam_id, reading_answers: [], listening_answers: [], writing_answers: [] };
      const [answers] = answersFor(section);
      const questions = examData[section].questions;
      if (section === "writing") {
        payload.writing_answers = questions
          .filter(q => (answers[q.id] || "").trim())
          .map(q => ({ question_id: q.id, question_number: q.question_number, user_answer: answers[q.id] }));
      } else {
        const list = questions
          .filter(q => answers[q.id])
          .map(q => ({ question_id: q.id, question_number: q.question_number, selected_option: answers[q.id] }));
        payload[`${section}_answers`] = list;
        // Sent alongside the answered list so the backend can still log/explain
        // questions the student skipped, not just the ones they answered.
        payload[`${section}_unanswered_ids`] = questions.filter(q => !answers[q.id]).map(q => q.id);
      }

      const res = await API.post("/topik/exam/submit", payload);
      setResult(res.data);
      setSectionResults(prev => ({ ...prev, [section]: res.data }));
      setStep("results");
      loadAnalytics({ silent: true });
    } catch (err) {
      setStep("exam");
      alert("❌ Submission failed. " + (err.response?.data?.error?.message || err.response?.data?.error || ""));
    }
  }

  useEffect(() => {
    submitRef.current = submitExam;
  });

  async function loadAnalytics(opts = {}) {
    setAnalyticsLoading(true);
    try {
      const res = await API.get("/topik/analytics");
      setAnalytics(res.data);
    } catch (err) {
      if (!opts.silent) {
        alert("❌ Failed to load study plan. " + (err.response?.data?.error?.message || err.response?.data?.error || ""));
      }
    }
    setAnalyticsLoading(false);
  }

  // Shared "study guide" block — used on both the section-picker screen (manual
  // button, checked against overall history) and, retitled, right on the results
  // screen after a submission (auto-loaded via loadAnalytics({ silent: true })
  // in submitExam above).
  function renderStudyGuide(title) {
    return (
      <div style={s.explanationCard}>
        {!analytics ? (
          <button style={s.retryBtn} onClick={() => loadAnalytics()} disabled={analyticsLoading}>
            <Icon name="bot" size={14} style={{ marginRight: "4px" }} />
            {analyticsLoading ? "Loading..." : "View My Study Plan"}
          </button>
        ) : (
          <>
            <h3 style={s.expTitle}><Icon name="bot" size={16} style={{ marginRight: "6px" }} />{title}</h3>
            <div style={s.expText} dangerouslySetInnerHTML={{ __html: formatText(analytics.study_plan.summary_myanmar) }} />
            <div style={s.weeklyPlan}>
              {analytics.study_plan.weekly_plan.map((d, i) => (
                <div key={i} style={s.dayCard}>
                  <div style={s.dayLabel}>{d.day}</div>
                  <div style={s.dayFocus}>{d.focus_topic}</div>
                  <div style={s.dayTask}>{d.practice_task}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  function startExam() {
    setExamData(null);
    setSection(null);
    setListeningRound(null);
    setReadingAnswers({});
    setListeningAnswers({});
    setWritingAnswers({});
    setSectionResults({});
    setResult(null);
    setAnalytics(null);
    setShowReview(false);
    setStep("picker");
  }

  function reset() {
    setStep("home");
    setExamData(null);
    setSection(null);
    setResult(null);
    setSectionResults({});
    setAnalytics(null);
  }

  // ── HOME ──────────────────────────────
  if (step === "home") return (
    <div style={s.layout}>
      <Sidebar />
      <main style={s.main}>
        <div style={s.hero}>
          <Icon name="test-passed" size={48} style={s.heroIcon} />
          <h1 style={s.heroTitle}>TOPIK II Practice Exam</h1>
          <p style={s.heroSub}>Full-length past TOPIK II exam — real Reading, Listening &amp; Writing questions, graded by K.MATE.</p>

          <div style={s.statRow}>
            <div style={s.statChip}><div style={s.statNum}>104</div><div style={s.statLabel}>Questions</div></div>
            <div style={s.statChip}><div style={s.statNum}>180</div><div style={s.statLabel}>Minutes</div></div>
            <div style={s.statChip}><div style={s.statNum}>300</div><div style={s.statLabel}>Total Points</div></div>
          </div>

          <button style={s.startHeroBtn} onClick={startExam}>
            <Icon name="rocket" size={16} style={{ marginRight: "6px" }} />Start Test
          </button>
        </div>
      </main>
    </div>
  );

  // ── LOADING / GRADING ─────────────────
  if (step === "loading" || step === "grading") return (
    <div style={s.layout}>
      <Sidebar />
      <main style={{ ...s.main, ...s.center }}>
        <div style={s.loadingBox}>
          <Icon name="hourglass" size={48} style={s.loadingIcon} />
          <h3 style={s.loadingText}>{step === "loading" ? "Loading exam..." : "Grading your answers..."}</h3>
          <p style={s.loadingSub}>{step === "loading" ? "Fetching the real question bank" : "K.MATE is grading your writing answers"}</p>
        </div>
      </main>
    </div>
  );

  // ── PICKER — choose which part to take ─
  if (step === "picker") return (
    <div style={s.layout}>
      <Sidebar />
      <main style={s.main}>
        <div style={s.pickerHeader}>
          <div style={s.examTitle}>TOPIK II — Choose a Part</div>
          <button style={s.homeLinkBtn} onClick={reset}>← Exam Home</button>
        </div>
        <p style={s.pickerSub}>Each part has its own timer and is graded separately. Listening lets you pick which past round's recording to use.</p>

        <div style={s.sectionTabs}>
          {SECTIONS.map(sTab => {
            const doneStat = sectionResults[sTab.key]?.sections?.find(sc => sc.section === sTab.key);
            const fullPoints = examData?.[sTab.key]?.total_points;
            const isListening = sTab.key === "listening";

            return (
              <button key={sTab.key}
                style={s.sectionCard}
                onClick={() => isListening ? setStep("listeningRounds") : enterSection(sTab.key)}
              >
                <span style={s.sectionCardText}>
                  <Icon name={sTab.icon} size={16} style={{ marginRight: "8px" }} />
                  {sectionLabel(sTab.key)}
                  <span style={s.sectionCardCount}>{sTab.questionCount} questions · {sTab.minutes} min</span>
                  {doneStat && (
                    <span style={s.sectionCardDone}>
                      <Icon name="checkmark-yes" size={12} style={{ marginRight: "3px" }} />
                      {Math.round(doneStat.total_score)}/{Math.round(fullPoints)} pts
                    </span>
                  )}
                </span>
                <span style={s.sectionCardArrow}>→</span>
              </button>
            );
          })}
        </div>

        {Object.keys(sectionResults).length > 0 && renderStudyGuide("K.MATE's Study Plan")}
      </main>
    </div>
  );

  // ── LISTENING ROUND PICKER — its own page since Listening is the only
  //    part where a round choice is meaningful ─
  if (step === "listeningRounds") return (
    <div style={s.layout}>
      <Sidebar />
      <main style={s.main}>
        <div style={s.pickerHeader}>
          <div style={s.examTitle}>
            <button style={s.backBtn} onClick={() => setStep("picker")}>←</button>
            TOPIK II — Choose a Listening Round
          </div>
        </div>
        <p style={s.pickerSub}>Each round uses that exam's own recording, so pick which one to listen to.</p>

        <div style={s.sectionTabs}>
          {ROUNDS.map(r => (
            <button key={r} style={s.sectionCard} onClick={() => enterSection("listening", { round: r })}>
              <span style={s.sectionCardText}>
                <Icon name="headphones" size={16} style={{ marginRight: "8px" }} />
                {r} TOPIK II - Listening - Mock Test
                <span style={s.sectionCardCount}>50 questions · 60 min</span>
              </span>
              <span style={s.sectionCardArrow}>→</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );

  // ── EXAM ──────────────────────────────
  if (step === "exam" && examData && examData[section] && section) {
    const sec = examData[section];
    const [answers, setAnswers] = answersFor(section);
    const totalAnswered = answeredCountFor(section);

    return (
      <div style={s.layout}>
        <Sidebar />
        <main style={s.examMain}>
          <div style={s.stickyBar}>
            <div style={s.stickyTop}>
              <div style={s.examTitle}>
                <button style={s.backBtn} onClick={() => setStep("picker")}>←</button>
                {sectionLabel(section).replace(" - Mock Test", "")}
              </div>
              <div style={s.examMeta}>
                <span style={s.metaChip}>{totalAnswered}/{sec.question_count} answered</span>
                <span style={{ ...s.metaChip, ...(secondsLeft < 300 ? s.metaChipDanger : {}) }}>
                  <Icon name="hourglass" size={13} style={{ marginRight: "4px" }} />{formatClock(secondsLeft)}
                </span>
                <button style={s.navSubmit} onClick={submitExam}>Submit Answers</button>
              </div>
            </div>
            {section === "listening" && examData.listening.audio_path && (
              <div style={s.audioBox}>
                <Icon name="headphones" size={16} style={{ marginRight: "8px" }} />
                <audio controls src={examData.listening.audio_path} style={{ flex: 1 }} />
              </div>
            )}
          </div>

          <div style={s.qList}>
            {sec.questions.map((q, idx) => (
              <div key={q.id} style={s.qCard}>
                {/* q.question_number is the question's own printed number from its original
                    exam paper (rounds are mixed together), not its position in this list —
                    labeling by idx keeps the header in the same order the cards are shown. */}
                <div style={s.qNum}>Question {idx + 1} of {sec.questions.length} <span style={s.qPoints}>({q.points} pts)</span></div>
                {q.image_url && <img src={q.image_url} alt="" style={s.qImage} />}
                <pre style={s.qText}>{stripLeadingQuestionNumber(section === "listening" ? listeningPromptForDisplay(q.prompt) : q.prompt)}</pre>

                {section === "writing" ? (
                  <textarea
                    style={s.writingArea}
                    placeholder="한국어로 답을 쓰세요..."
                    value={answers[q.id] || ""}
                    onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                ) : (
                  <div style={s.optionsGrid}>
                    {symbols.map((sym, i) => (
                      <button key={i}
                        style={{ ...s.optChoice, ...(answers[q.id] === i + 1 ? s.optChosen : {}) }}
                        onClick={() => setAnswers({ ...answers, [q.id]: i + 1 })}>
                        <span style={s.optSymbol}>{sym}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={s.bottomSubmitRow}>
            <button style={s.navSubmit} onClick={submitExam}>
              <Icon name="checkmark-yes" size={14} style={{ marginRight: "4px" }} />Submit Answers
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── RESULTS — for the part just submitted ─
  if (step === "results" && result && section) {
    const sTab = SECTIONS.find(x => x.key === section);
    const sc = result.sections.find(x => x.section === section) || result.sections[0];
    // topik-ai-prep only grades questions actually submitted, so sc.max_score/
    // total_questions reflect just those (e.g. 49/98 if one was skipped) — the
    // real section size/points come from examData instead, so a skipped
    // question counts against you (0 pts) rather than shrinking the total.
    const fullTotal = examData[section].question_count;
    const fullMax = examData[section].total_points;
    const reviews = sc.question_reviews || [];
    // Reading/Listening now submit every question (answered + unanswered), so the
    // backend logs one review per question -- skipped is derived from those rather
    // than a count diff. Writing doesn't get question_reviews, so keep the old diff.
    const skipped = reviews.length
      ? reviews.filter(r => r.user_answer === null).length
      : fullTotal - sc.total_questions;
    const pct = Math.round((sc.total_score / fullMax) * 100);
    const grade = pct >= 80 ? { label: "Excellent!", icon: "party-popper", color: "#10b981" }
      : pct >= 60 ? { label: "Good Job!", icon: "thumbs-up", color: "var(--primary)" }
      : { label: "Keep Studying", icon: "flexed-biceps", color: "#f59e0b" };
    const [answers] = answersFor(section);
    // Question content (stem/passage, instruction header, options) for the review
    // screen is mapped straight from examData -- already in hand from taking the
    // exam -- keyed by id, no extra fetch needed.
    const questionById = Object.fromEntries(examData[section].questions.map(q => [q.id, q]));

    return (
      <div style={s.layout}>
        <Sidebar />
        <main style={s.main}>
          <div style={s.resultHero}>
            <div style={s.resultLabel}>{sectionLabel(section)}</div>
            <div style={s.bigScore}>{Math.round(sc.total_score)}<span style={s.bigScoreTotal}>/{Math.round(fullMax)}</span></div>
            <div style={{ color: grade.color, fontSize: "20px", fontWeight: 700 }}>
              {grade.label} <Icon name={grade.icon} size={18} />
            </div>
            <div style={s.pctBar}>
              <div style={{ ...s.pctFill, width: `${pct}%`, background: grade.color }} />
            </div>
            <div style={s.pctLabel}>{pct}% Score &nbsp;·&nbsp; {sc.correct_count}/{fullTotal} correct</div>
          </div>

          {skipped > 0 && (
            <div style={s.warningBox}>⚠️ {skipped} question{skipped > 1 ? "s" : ""} left unanswered — counted as incorrect.</div>
          )}
          {result.warnings?.length > 0 && (
            <div style={s.warningBox}>
              {result.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
            </div>
          )}

          <div style={s.resultBtns}>
            <button style={s.retryBtn} onClick={() => setShowReview(v => !v)}>
              <Icon name="note" size={14} style={{ marginRight: "4px" }} />{showReview ? "Hide" : "Review"} My Answers
            </button>
          </div>

          {showReview && examData && (
            <div style={s.explanationCard}>
              <h3 style={s.expTitle}>Review My Answers — {sTab.label}</h3>
              {reviews.length > 0 ? (
                [...reviews].sort((a, b) => a.question_number - b.question_number).map(r => {
                  const q = questionById[r.question_id];
                  const rawPrompt = q ? (section === "listening" ? listeningPromptForDisplay(q.prompt) : q.prompt) : "";
                  const { stem, options } = splitPromptIntoStemAndOptions(stripLeadingQuestionNumber(rawPrompt));
                  const correctNum = Number(r.correct_answer);
                  const chosenNum = r.user_answer !== null ? Number(r.user_answer) : null;

                  return (
                    <div key={r.question_id} style={s.reviewItem}>
                      <div style={s.reviewTopRow}>
                        <div style={s.reviewQNum}>
                          Q{r.question_number}
                          <span style={{ ...s.reviewBadge, ...(r.is_correct ? s.reviewBadgeOk : s.reviewBadgeBad) }}>
                            {r.is_correct ? "✅" : "❌"}
                          </span>
                        </div>
                        {!options && (
                          <div style={s.reviewAnswer}>
                            {chosenNum ? `${symbols[chosenNum - 1]} chosen` : "No answer"}
                            {!r.is_correct && <> · correct: {symbols[correctNum - 1]}</>}
                          </div>
                        )}
                      </div>

                      {q && (
                        <div style={s.reviewQuestionBlock}>
                          {q.image_url && <img src={q.image_url} alt="" style={s.qImage} />}
                          {stem && <pre style={s.reviewStemText}>{stem}</pre>}
                          {options && (
                            <div style={s.reviewOptionsList}>
                              {options.map((optText, i) => {
                                const optNum = i + 1;
                                const isCorrectOpt = optNum === correctNum;
                                const isChosenOpt = chosenNum !== null && optNum === chosenNum;
                                return (
                                  <div key={i} style={{
                                    ...s.reviewOptChoice,
                                    ...(isCorrectOpt ? s.reviewOptCorrect : isChosenOpt ? s.reviewOptWrong : {}),
                                  }}>
                                    <span style={s.reviewOptSymbol}>{symbols[i]}</span>
                                    <span style={s.reviewOptText}>{optText}</span>
                                    {isCorrectOpt && (
                                      <span style={s.reviewOptBadgeOk}>
                                        ✓ Correct Answer{isChosenOpt ? " (Your Answer)" : ""}
                                      </span>
                                    )}
                                    {isChosenOpt && !isCorrectOpt && (
                                      <span style={s.reviewOptBadgeBad}>✗ Your Answer</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {options && chosenNum === null && (
                            <div style={s.reviewAnswer}>No answer selected</div>
                          )}
                        </div>
                      )}

                      {r.explanation && (
                        <div style={s.explanationBlock}>
                          <div style={s.explanationRow}>
                            <span style={s.explanationLabel}>မှန်ကန်သော အဖြေနှင့် အကြောင်းအရင်း</span>
                            <span style={s.explanationText}>{r.explanation.correct_answer_explanation}</span>
                          </div>
                          <div style={s.explanationRow}>
                            <span style={s.explanationLabel}>မှားယွင်းရသည့် အကြောင်းအရင်း</span>
                            <span style={s.explanationText}>{r.explanation.wrong_answer_explanation}</span>
                          </div>
                          <div style={s.explanationRow}>
                            <span style={s.explanationLabel}>အဓိက ပါဝင်သော သဒ္ဒါ/ဝေါဟာရ</span>
                            <span style={s.explanationText}>{r.explanation.grammar_vocab_focus}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                examData[section].questions
                  .map((q, idx) => ({ q, idx }))
                  .filter(({ q }) => answers[q.id])
                  .map(({ q, idx }) => (
                    <div key={q.id} style={s.reviewItem}>
                      <div style={s.reviewTopRow}>
                        <div style={s.reviewQNum}>Q{idx + 1}</div>
                        <div style={s.reviewAnswer}>{answers[q.id]}</div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {renderStudyGuide("မြန်မာဘာသာ AI သုံးသပ်ချက်နှင့် လေ့လာရန် လမ်းညွှန်")}

          <div style={s.resultBtns}>
            <button style={s.retryBtn} onClick={() => enterSection(section)}>
              <Icon name="refresh" size={14} style={{ marginRight: "4px" }} />Retake This Part
            </button>
            <button style={s.homeBtn} onClick={() => setStep("picker")}>
              <Icon name="home" size={14} style={{ marginRight: "4px" }} />Back to All Sections
            </button>
          </div>
        </main>
      </div>
    );
  }

  return null;
}

const s = {
  layout: { display: "flex", minHeight: "100vh", background: "var(--bg)" },
  main: { marginLeft: "240px", flex: 1, padding: "32px 40px" },
  examMain: { marginLeft: "240px", flex: 1, display: "flex", flexDirection: "column" },
  center: { display: "flex", alignItems: "center", justifyContent: "center" },

  // Home
  hero: { textAlign: "center", padding: "56px 20px 48px", background: "linear-gradient(135deg,var(--primary),#7c3aed)", borderRadius: "20px", color: "#fff", maxWidth: "720px", margin: "40px auto" },
  heroIcon: { fontSize: "48px", marginBottom: "12px" },
  heroTitle: { fontSize: "30px", fontWeight: 800, marginBottom: "10px" },
  heroSub: { fontSize: "15px", opacity: 0.85, lineHeight: 1.7, marginBottom: "28px" },
  statRow: { display: "flex", justifyContent: "center", gap: "16px", marginBottom: "28px" },
  statChip: { background: "rgba(255,255,255,0.14)", borderRadius: "12px", padding: "14px 22px", minWidth: "100px" },
  statNum: { fontSize: "24px", fontWeight: 800 },
  statLabel: { fontSize: "12px", opacity: 0.85, marginTop: "2px" },
  startHeroBtn: { background: "#fff", color: "var(--primary)", padding: "14px 36px", borderRadius: "12px", fontSize: "16px", fontWeight: 700, border: "none" },

  // Loading
  loadingBox: { textAlign: "center", background: "var(--surface)", padding: "48px", borderRadius: "16px", border: "1px solid var(--border)" },
  loadingIcon: { fontSize: "48px", marginBottom: "16px" },
  loadingText: { fontSize: "20px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" },
  loadingSub: { fontSize: "14px", color: "var(--text-muted)" },

  // Picker
  pickerHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" },
  pickerSub: { fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" },
  homeLinkBtn: { padding: "8px 16px", border: "1.5px solid var(--border)", borderRadius: "8px", background: "var(--surface)", color: "var(--text-muted)", fontSize: "13px", fontWeight: 600 },

  // Exam — sticky bar + continuous scroll
  stickyBar: { position: "sticky", top: 0, zIndex: 5, background: "var(--bg)", paddingTop: "20px", paddingBottom: "12px", borderBottom: "1px solid var(--border)" },
  stickyTop: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 40px", marginBottom: "12px" },
  examTitle: { fontSize: "18px", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "10px" },
  backBtn: { width: "30px", height: "30px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: "15px", fontWeight: 700 },
  examMeta: { display: "flex", gap: "8px", alignItems: "center" },
  metaChip: { background: "var(--primary-tint)", color: "var(--primary)", padding: "5px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center" },
  metaChipDanger: { background: "#fee2e2", color: "#ef4444" },
  sectionTabs: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" },
  sectionCard: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", padding: "16px 18px", borderRadius: "10px",
    border: "2px solid var(--border)", background: "var(--surface)",
    color: "var(--text-muted)", fontSize: "14px", fontWeight: 600, textAlign: "left",
  },
  sectionCardText: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", color: "var(--text)" },
  sectionCardCount: { marginLeft: "12px", fontSize: "12px", fontWeight: 500, color: "var(--text-faint)" },
  sectionCardDone: { marginLeft: "12px", fontSize: "12px", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center" },
  sectionCardArrow: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "34px", height: "34px", borderRadius: "8px",
    border: "1.5px solid var(--primary)", color: "var(--primary)", fontSize: "16px", flexShrink: 0,
  },
  audioBox: { display: "flex", alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "10px 16px", margin: "0 40px" },
  navSubmit: { padding: "9px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },

  qList: { padding: "20px 40px 8px", display: "flex", flexDirection: "column", gap: "16px" },
  qCard: { background: "var(--surface)", borderRadius: "16px", padding: "24px", border: "1px solid var(--border)" },
  qNum: { fontSize: "13px", color: "var(--primary)", fontWeight: 700, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" },
  qPoints: { color: "var(--text-faint)", fontWeight: 500, textTransform: "none" },
  qText: { fontSize: "16px", fontWeight: 500, color: "var(--text)", lineHeight: 1.8, marginBottom: "20px", padding: "16px", background: "var(--surface-alt)", borderRadius: "10px", borderLeft: "4px solid var(--primary)", whiteSpace: "pre-wrap", fontFamily: "inherit" },
  qImage: { display: "block", maxWidth: "100%", borderRadius: "10px", border: "1px solid var(--border)", marginBottom: "16px" },
  optionsGrid: { display: "flex", gap: "12px" },
  optChoice: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "14px", borderWidth: "2px", borderStyle: "solid", borderColor: "var(--border)", borderRadius: "10px", background: "var(--surface)", cursor: "pointer" },
  optChosen: { borderColor: "var(--primary)", background: "var(--primary-tint)" },
  optSymbol: { fontSize: "20px", fontWeight: 700, color: "var(--primary)" },
  writingArea: { width: "100%", minHeight: "150px", padding: "14px", border: "1.5px solid var(--border)", borderRadius: "10px", fontSize: "15px", lineHeight: 1.7, background: "var(--surface)", color: "var(--text)", resize: "vertical" },
  bottomSubmitRow: { display: "flex", justifyContent: "center", padding: "12px 40px 40px" },

  // Results
  resultHero: { background: "var(--surface)", borderRadius: "16px", padding: "32px", textAlign: "center", border: "1px solid var(--border)", marginBottom: "24px" },
  resultLabel: { fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" },
  bigScore: { fontSize: "72px", fontWeight: 800, color: "var(--primary)", lineHeight: 1 },
  bigScoreTotal: { fontSize: "40px", color: "var(--text-faint)" },
  pctBar: { height: "8px", background: "var(--border)", borderRadius: "4px", margin: "16px auto 8px", maxWidth: "300px", overflow: "hidden" },
  pctFill: { height: "100%", borderRadius: "4px" },
  pctLabel: { fontSize: "16px", color: "var(--text-muted)" },
  warningBox: { background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" },
  explanationCard: { background: "var(--surface)", borderRadius: "16px", padding: "24px", border: "1px solid var(--border)", marginBottom: "20px" },
  expTitle: { fontSize: "16px", fontWeight: 700, color: "var(--text)", marginBottom: "16px" },
  expText: { fontSize: "14px", lineHeight: 1.9, color: "var(--text-muted)", marginBottom: "16px" },
  reviewItem: { display: "flex", flexDirection: "column", gap: "12px", padding: "18px 0", borderBottom: "1px solid var(--border)", fontSize: "13px" },
  reviewTopRow: { display: "flex", gap: "10px", alignItems: "baseline" },
  reviewQNum: { fontWeight: 700, color: "var(--text)", fontSize: "15px", minWidth: "36px", display: "flex", alignItems: "center", gap: "6px" },
  reviewAnswer: { color: "var(--text-muted)", whiteSpace: "pre-wrap" },
  reviewBadge: { fontSize: "12px" },
  reviewBadgeOk: {},
  reviewBadgeBad: {},
  reviewQuestionBlock: { display: "flex", flexDirection: "column", gap: "10px" },
  reviewStemText: { fontSize: "15px", fontWeight: 500, color: "var(--text)", lineHeight: 1.8, margin: 0, padding: "14px 16px", background: "var(--surface-alt)", borderRadius: "10px", borderLeft: "4px solid var(--primary)", whiteSpace: "pre-wrap", fontFamily: "inherit" },
  reviewOptionsList: { display: "flex", flexDirection: "column", gap: "8px" },
  reviewOptChoice: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "var(--surface)" },
  reviewOptCorrect: { border: "1.5px solid #10b981", background: "rgba(16,185,129,0.1)" },
  reviewOptWrong: { border: "1.5px solid #ef4444", background: "rgba(239,68,68,0.1)" },
  reviewOptSymbol: { fontWeight: 700, color: "var(--primary)", flexShrink: 0 },
  reviewOptText: { flex: 1, color: "var(--text)", lineHeight: 1.6 },
  reviewOptBadgeOk: { fontSize: "11px", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" },
  reviewOptBadgeBad: { fontSize: "11px", fontWeight: 700, color: "#ef4444", whiteSpace: "nowrap" },
  explanationBlock: { display: "flex", flexDirection: "column", gap: "8px", background: "var(--surface-alt)", borderRadius: "10px", padding: "12px 14px" },
  explanationRow: { display: "flex", flexDirection: "column", gap: "2px" },
  explanationLabel: { fontSize: "11px", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.3px" },
  explanationText: { fontSize: "13px", color: "var(--text)", lineHeight: 1.7 },
  weeklyPlan: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "10px" },
  dayCard: { background: "var(--surface-alt)", borderRadius: "10px", padding: "12px" },
  dayLabel: { fontSize: "12px", fontWeight: 700, color: "var(--primary)", marginBottom: "4px" },
  dayFocus: { fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "4px" },
  dayTask: { fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 },
  resultBtns: { display: "flex", gap: "12px", marginBottom: "20px" },
  retryBtn: { flex: 1, padding: "13px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: 700 },
  homeBtn: { flex: 1, padding: "13px", background: "var(--surface)", color: "var(--text-muted)", border: "1.5px solid var(--border)", borderRadius: "10px", fontSize: "15px", fontWeight: 600 },
};
