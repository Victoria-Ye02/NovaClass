const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth.middleware");
const { ask, codeAsk, codeCoach, history, generateQuiz, followupQuiz, checkQuiz, quizWeaknesses, quizOptions } = require("../../controllers/victoria/kmate.controller");

router.post("/ask",           auth, ask);
router.post("/code-ask",      auth, codeAsk);
router.post("/code-coach",    auth, codeCoach);
router.get("/history",        auth, history);
router.post("/quiz/generate", auth, generateQuiz);
router.post("/quiz/followup", auth, followupQuiz);
router.post("/quiz/check",    auth, checkQuiz);
router.get("/quiz/weaknesses", auth, quizWeaknesses);
router.get("/quiz/options",    auth, quizOptions);

module.exports = router;
