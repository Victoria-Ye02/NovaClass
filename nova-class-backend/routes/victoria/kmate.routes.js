const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth.middleware");
const { ask, codeAsk, codeCoach, history, generateQuiz, checkQuiz } = require("../../controllers/victoria/kmate.controller");

router.post("/ask",           auth, ask);
router.post("/code-ask",      auth, codeAsk);
router.post("/code-coach",    auth, codeCoach);
router.get("/history",        auth, history);
router.post("/quiz/generate", auth, generateQuiz);
router.post("/quiz/check",    auth, checkQuiz);

module.exports = router;
