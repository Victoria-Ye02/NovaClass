const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth.middleware");
const { ask, askStream, codeAsk, codeCoach, runJavaCode, runNativeCode, runSqlCode, history, generateQuiz, followupQuiz, checkQuiz, quizWeaknesses, quizOptions, quizStrategy, explainWeakPoint, explainGrammar, sentenceAudio } = require("../../controllers/victoria/kmate.controller");

router.post("/ask",           auth, ask);
router.post("/ask/stream",    auth, askStream);
router.post("/code-ask",      auth, codeAsk);
router.post("/code-coach",    auth, codeCoach);
router.post("/run-java",      auth, runJavaCode);
router.post("/run-native",    auth, runNativeCode);
router.post("/run-sql",       auth, runSqlCode);
router.get("/history",        auth, history);
router.post("/quiz/generate", auth, generateQuiz);
router.post("/quiz/followup", auth, followupQuiz);
router.post("/quiz/check",    auth, checkQuiz);
router.get("/quiz/weaknesses", auth, quizWeaknesses);
router.get("/quiz/options",    auth, quizOptions);
router.get("/quiz/strategy",   auth, quizStrategy);
router.get("/quiz/explain",    auth, explainWeakPoint);
router.get("/grammar/explain", auth, explainGrammar);
router.post("/tts",            auth, sentenceAudio);

module.exports = router;
