import { useState } from "react";
import Sidebar from "../../components/Sidebar";
import { QuizMode } from "./KMate";
import { useTopikPractice, practiceFocus } from "./useTopikPractice";
import { toAsciiDigits, clampQuestion, selectAll, keepSelection } from "./questionNumber";
import "./smartDrill.css";

// TOPIK Hub › Smart Drill. The markup and Tailwind classes follow the NovaClass Smart Drill design one to one;
// what the student picks drives the real quiz (QuizMode) and the right-hand cards show the student's own results.

const LEVELS = [
  { id: "medium", label: "Level 3~4", sub: "중급" },
  { id: "hard", label: "Level 5~6", sub: "고급" },
];

// The Master Tip card: a short goal for each level. TOPIK II is 300 points (listening 100, reading 100, writing 100);
// Level 3 starts at 120, Level 4 at 150, Level 5 at 190 and Level 6 at 230. Each reading / listening question is worth 2 points.
const TIPS = {
  medium: {
    title: "TOPIK Level 3~4 Master Tip",
    goal: "Aim for 120~150 / 300. Get the easy half right and take part marks on the rest.",
    lines: [
      ["📖 Reading", "Q1~25 all correct (50 pts), then about half of Q26~38."],
      ["🎧 Listening", "Q1~20 all correct (40 pts), then most of Q21~30."],
      ["✍️ Writing", "Finish Q51~52 (20 pts) and write something for Q53."],
    ],
  },
  hard: {
    title: "TOPIK Level 5~6 Master Tip",
    goal: "Aim for 190~230 / 300. The long passages decide the level.",
    lines: [
      ["📖 Reading", "Q1~38 almost all correct, and at least 8 of Q39~50. Keep 15 minutes for the last passages."],
      ["🎧 Listening", "Q1~30 all correct, and at least 14 of Q31~50."],
      ["✍️ Writing", "Q51~52 full marks, Q53 about 200 characters, and a clear Q54 essay."],
    ],
  },
};

const SKILL_ICON_BY_KEY = { reading: "📖", listening: "🎧", writing: "✍️" };
const SKILL_LIMITS = { reading: [1, 50], listening: [1, 50], writing: [51, 54] };

function scoreTone(score) {
  if (score >= 80) return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 70) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
}

/* ---------- small building blocks ---------- */

function Card({ className = "", children, ...rest }) {
  return (
    <section
      className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

function StepLabel({ step, children, hint }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          {step}
        </span>
        {children}
      </h3>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function OptionButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 px-4 py-4 text-center transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 dark:focus-visible:ring-indigo-500/30 ${
        active
          ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-200"
          : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/60"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- page ---------- */

export default function SmartDrill() {
  const base = useTopikPractice({ initial: { domain: "reading", start: "1", end: "25" } });
  // Level 5~6 is chosen from the start, as in the design; picking a level again does not unselect it
  const practice = { ...base, level: base.level || "hard" };
  const { weak, domains, domain, setDomain, startQuestion, endQuestion, setQuestionStart, setQuestionEnd } = practice;

  const tip = TIPS[practice.level] || TIPS.hard;
  const [followup, setFollowup] = useState(null);                 // { weaknesses } while a retake is running
  const [session, setSession] = useState(0);                      // a new key restarts the quiz card

  const skills = domains.map(s => {
    const [min, max] = [s.minQuestion ?? SKILL_LIMITS[s.key]?.[0] ?? 1, s.maxQuestion ?? SKILL_LIMITS[s.key]?.[1] ?? 50];
    return { id: s.key, icon: SKILL_ICON_BY_KEY[s.key] || "📖", label: s.label, sub: s.ko, min, max };
  });
  const skill = skills.find(s => s.id === domain) || skills[0];

  const missed = (weak?.weaknesses || []).filter(w => w.wrong > 0);
  const missedNumbers = weak?.missedNumbers || [];                   // exam numbers answered wrongly in Smart Drill, most-missed first
  const toReview = missedNumbers.length || missed.length;
  const avgScore = weak ? Math.round(weak.averageScore || 0) : 0;

  const startNumber = Number(startQuestion);
  const endNumber = Number(endQuestion);
  let error = "";
  if (startQuestion === "" || endQuestion === "") error = "Enter both question numbers.";
  else if (startNumber < skill.min || endNumber > skill.max) error = `${skill.label} questions are numbered ${skill.min}~${skill.max}.`;
  else if (startNumber > endNumber) error = "Start number must be less than or equal to the end number.";
  const count = error ? 0 : endNumber - startNumber + 1;

  const retake = () => {
    setFollowup({ weaknesses: missed.slice(0, 4).map(practiceFocus) });
    setSession(n => n + 1);
  };

  // practise ONE missed point again: the model writes this many new questions of the same pattern
  const [repeats, setRepeats] = useState({});                      // row key -> how many questions
  const practiceOne = (w, key) => {
    setFollowup({ weaknesses: [practiceFocus(w)], count: repeats[key] || 5 });
    setSession(n => n + 1);
  };
  // practise ONE missed exam number again: new questions written in the pattern of that number
  const practiceNumber = (m, key) => {
    setFollowup({ number: { domain: m.domain, number: m.number }, count: repeats[key] || 5 });
    setSession(n => n + 1);
  };

  const renderSettings = ({ startQuiz }) => (
    <Card className="p-8 lg:sticky lg:top-8">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-xl text-white shadow-lg shadow-indigo-600/25">
          📋
        </span>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Choose your TOPIK practice
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Set the level, section and question range.
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* 1. Level */}
        <div>
          <StepLabel step={1}>Target level</StepLabel>
          <div className="grid grid-cols-2 gap-3" data-testid="level-picker">
            {LEVELS.map((l) => (
              <OptionButton key={l.id} active={practice.level === l.id} onClick={() => base.setLevel(l.id)}>
                <span className="text-base font-semibold">{l.label}</span>
                <span className="text-xs opacity-70">{l.sub}</span>
              </OptionButton>
            ))}
          </div>
        </div>

        {/* 2. Section */}
        <div>
          <StepLabel step={2}>Exam section</StepLabel>
          <div className="grid grid-cols-3 gap-3" data-testid="domain-picker">
            {skills.map((s) => (
              <OptionButton key={s.id} active={skill.id === s.id} onClick={() => setDomain(s.id)}>
                <span className="text-2xl leading-none">{s.icon}</span>
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-xs opacity-70">{s.sub}</span>
              </OptionButton>
            ))}
          </div>
        </div>

        {/* 3. Range */}
        <div data-testid="question-span-picker">
          <StepLabel step={3} hint={`Available: Q${skill.min} ~ Q${skill.max}`}>
            Question range
          </StepLabel>
          <div className="flex items-center gap-3">
            {[
              ["start", "From", startQuestion, setQuestionStart, skill.min],
              ["end", "To", endQuestion, setQuestionEnd, skill.max],
            ].map(([key, label, value, setValue, fallback], i) => (
              <div key={key} className="contents">
                {i === 1 && <span className="pt-5 text-slate-400">~</span>}
                <label className="flex-1">
                  <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {label}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={key === "start" ? "Start question" : "End question"}
                    data-testid={`range-${key}`}
                    value={value}
                    onFocus={selectAll}
                    onMouseUp={keepSelection}
                    onChange={(e) => setValue(toAsciiDigits(e.target.value))}
                    onBlur={() => setValue(clampQuestion(value, skill.min, skill.max, fallback))}
                    className={`w-full rounded-2xl border-2 bg-slate-50 px-4 py-3 text-lg font-semibold text-slate-900 outline-none transition focus:bg-white focus:ring-4 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900 ${
                      error
                        ? "border-rose-300 focus:border-rose-500 focus:ring-rose-100 dark:border-rose-500/50 dark:focus:ring-rose-500/20"
                        : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-100 dark:border-slate-700 dark:focus:ring-indigo-500/20"
                    }`}
                  />
                </label>
              </div>
            ))}
          </div>
          <p
            className={`mt-2 text-xs ${
              error ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {error ||
              `${count} question${count > 1 ? "s" : ""} selected · Questions are numbered as in the official TOPIK II paper.`}
          </p>
        </div>

        {/* Summary + CTA */}
        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
              {LEVELS.find((l) => l.id === practice.level).label}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
              {skill.icon} {skill.label}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
              Q{startQuestion || "?"} ~ Q{endQuestion || "?"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { if (!error) startQuiz(); }}
          disabled={!!error}
          className="w-full rounded-2xl bg-indigo-700 px-6 py-4 text-base font-semibold text-white shadow-xl shadow-indigo-700/30 transition-all hover:-translate-y-0.5 hover:bg-indigo-800 hover:shadow-2xl hover:shadow-indigo-700/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700"
        >
          🚀 Start Smart Practice
        </button>
      </div>
    </Card>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar />
      <main className="sd-root min-h-screen w-full min-w-0 flex-1 bg-slate-50 px-6 py-8 text-slate-900 lg:px-10 dark:bg-slate-950" style={{ marginLeft: "240px" }}>
        <div className="mx-auto w-full max-w-[1500px]">
          {/* Header */}
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                TOPIK Hub · 스마트 드릴
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Smart Drill
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Build a focused practice set and review the questions you miss most.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] font-medium text-slate-400">Avg. score</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{avgScore}%</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] font-medium text-slate-400">To review</p>
                <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{toReview}</p>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* ================= LEFT: configuration ================= */}
            <div className="lg:col-span-7">
              <QuizMode key={session} practice={practice} followup={followup} simple renderSettings={renderSettings} />
            </div>

            {/* ================= RIGHT: insights ================= */}
            <div className="flex flex-col gap-6 lg:col-span-5">
              {/* Weakness analyzer */}
              <Card data-testid="weakness-analyzer">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                      🧠 AI Weakness Analyzer
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">반복 복습 · most-missed questions</p>
                  </div>
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                    {toReview} to review
                  </span>
                </div>

                {missedNumbers.length > 0 ? (
                  <ul className="space-y-2" data-testid="missed-numbers">
                    {missedNumbers.slice(0, 5).map((m) => {
                      const key = `${m.domain}|${m.number}`;
                      return (
                        <li
                          key={key}
                          className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 transition hover:border-rose-200 hover:bg-rose-50/50 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-rose-500/30"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-xs font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                            Q{m.number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                              {SKILL_ICON_BY_KEY[m.domain] || "📖"} {skills.find((s) => s.id === m.domain)?.label || m.domain} Q{m.number}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {m.accuracy}% correct · asked {m.asked}×
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-400">
                            ✕ {m.wrong}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <select
                              aria-label={`Questions to practise: ${m.domain} Q${m.number}`}
                              value={repeats[key] || 5}
                              onChange={(e) => setRepeats((r) => ({ ...r, [key]: Number(e.target.value) }))}
                              className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                              {[3, 5, 8].map((n) => <option key={n} value={n}>{n} Qs</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => practiceNumber(m, key)}
                              className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
                            >
                              Practice
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : missed.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    No missed questions yet — great work! 🎉
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {missed.slice(0, 5).map((w, i) => (
                      <li
                        key={`${w.source}|${w.weakness}`}
                        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 transition hover:border-rose-200 hover:bg-rose-50/50 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-rose-500/30"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-xs font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                          #{i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{w.weakness}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {w.accuracy}% correct · asked {w.asked}×
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-400">
                          ✕ {w.wrong}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <select
                            aria-label={`Questions to practise: ${w.weakness}`}
                            value={repeats[`${w.source}|${w.weakness}`] || 5}
                            onChange={(e) => setRepeats((r) => ({ ...r, [`${w.source}|${w.weakness}`]: Number(e.target.value) }))}
                            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {[3, 5, 8].map((n) => <option key={n} value={n}>{n} Qs</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => practiceOne(w, `${w.source}|${w.weakness}`)}
                            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
                          >
                            Practice
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={retake}
                  disabled={missed.length === 0}
                  className="mt-4 w-full rounded-2xl border-2 border-indigo-600 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-600 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white dark:bg-transparent dark:text-indigo-300 dark:hover:bg-indigo-600 dark:hover:text-white"
                >
                  🔄 Retake Missed Questions
                </button>
              </Card>

              {/* Pro tip */}
              <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 to-violet-700 p-6 text-white shadow-lg shadow-indigo-700/20">
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-10 right-10 h-24 w-24 rounded-full bg-white/5" />
                <h2 className="relative mb-3 text-base font-bold">💡 {tip.title}</h2>
                <blockquote className="relative border-l-2 border-white/40 pl-4 text-sm leading-relaxed text-indigo-50">
                  <p className="mb-2 font-semibold text-white">{tip.goal}</p>
                  <ul className="space-y-1">
                    {tip.lines.map(([label, text]) => (
                      <li key={label}><strong className="text-white">{label}</strong> — {text}</li>
                    ))}
                  </ul>
                </blockquote>
              </section>

              {/* Recent activity: the server keeps one running average, not a list of past sets */}
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">📊 Recent Activity</h2>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {weak?.attempts || 0} quiz{weak?.attempts === 1 ? "" : "zes"}
                  </span>
                </div>
                {weak?.attempts ? (
                  <ul className="space-y-4">
                    <li>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-100">📖 All quizzes so far</span>
                        <span className={`font-bold ${scoreTone(avgScore).text}`}>{avgScore}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${scoreTone(avgScore).bar} transition-all`}
                            style={{ width: `${avgScore}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-slate-400">Average</span>
                      </div>
                    </li>
                  </ul>
                ) : (
                  <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    Finish a practice set and your score shows here.
                  </p>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
