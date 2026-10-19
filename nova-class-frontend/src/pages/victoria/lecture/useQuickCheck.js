import { useCallback, useEffect, useRef, useState } from "react";
import API from "../../../services/api";

// The pop-up comprehension check: fetch one question for a slide, send the
// student's pick to the server for grading, hold the feedback. The correct
// answer never reaches the browser until the student has chosen.
//
// status: idle | loading | ready | grading | answered | error
export default function useQuickCheck({ materialId, lang }) {
  const [state, setState] = useState({ status: "idle", page: 0, data: null, picked: null, result: null });
  const seqRef = useRef(0);
  const base = `/classroom/materials/${materialId}/lecture`;

  useEffect(() => () => { seqRef.current += 1; }, []);

  const dismiss = useCallback(() => {
    seqRef.current += 1;
    setState({ status: "idle", page: 0, data: null, picked: null, result: null });
  }, []);

  const open = useCallback(async (page) => {
    if (!page) return;
    const seq = ++seqRef.current;
    setState({ status: "loading", page, data: null, picked: null, result: null });
    try {
      const { data } = await API.get(`${base}/${page}/quiz`, { params: { lang } });
      if (seq !== seqRef.current) return;
      if (!data?.available || !data.quizId || !Array.isArray(data.options)) {
        setState({ status: "idle", page: 0, data: null, picked: null, result: null });
        return;
      }
      setState({ status: "ready", page, data, picked: null, result: null });
    } catch {
      if (seq === seqRef.current) setState({ status: "error", page, data: null, picked: null, result: null });
    }
  }, [base, lang]);

  const pick = useCallback(async (choice) => {
    if (state.status !== "ready" || !state.data) return;
    const seq = seqRef.current;
    const { data: quiz, page } = state;
    setState(prev => ({ ...prev, status: "grading", picked: choice }));
    try {
      const { data } = await API.post(`${base}/quiz/${quiz.quizId}/answer`, { choice });
      if (seq !== seqRef.current) return;
      setState({ status: "answered", page, data: quiz, picked: choice, result: data });
    } catch {
      if (seq === seqRef.current) setState({ status: "error", page, data: quiz, picked: null, result: null });
    }
  }, [state, base]);

  return { quiz: state, open, pick, dismiss };
}
