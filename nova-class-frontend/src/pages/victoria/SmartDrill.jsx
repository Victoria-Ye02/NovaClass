import { useState } from "react";
import Sidebar from "../../components/Sidebar";
import { QuizMode } from "./KMate";
import TopikPracticePanel from "./TopikPracticePanel";
import { useTopikPractice } from "./useTopikPractice";

// TOPIK Hub › Smart Drill: TOPIK II practice. On the left the practice settings (question type, difficulty, language),
// the Strategy Guide and the student's weak points; on the right the practice quiz.
export default function SmartDrill() {
  const practice = useTopikPractice();
  const [followup, setFollowup] = useState(null);   // set when "Practice" is clicked on a weak point

  return (
    <div style={d.layout}>
      <Sidebar />
      <main style={d.main}>
        <h2 style={d.title}>Smart Drill</h2>
        <div style={d.body}>
          <div style={d.side}>
            <TopikPracticePanel practice={practice} onPractice={ws => setFollowup({ weaknesses: ws, n: Date.now() })} />
          </div>
          <div style={d.quiz}>
            <QuizMode key={followup?.n || 0} practice={practice} followup={followup} />
          </div>
        </div>
      </main>
    </div>
  );
}

const d = {
  layout: { display: "flex", minHeight: "100vh", background: "var(--bg)" },
  main: { marginLeft: "240px", flex: 1, minWidth: 0, padding: "24px 32px", boxSizing: "border-box" },
  title: { margin: "0 0 18px", color: "var(--text)" },
  body: { display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" },
  side: { width: "340px", maxWidth: "100%", flexShrink: 0 },
  quiz: { flex: 1, minWidth: "320px", display: "flex", flexDirection: "column" },
};
