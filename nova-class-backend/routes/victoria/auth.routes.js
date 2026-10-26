const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { register, login, googleLogin, me, updateMe, deleteMe } = require("../../controllers/victoria/auth.controller");
const auth = require("../../middleware/auth.middleware");

router.post("/register", register);
// Brute-force guard: at most 10 failed sign-ins from one address in 15 minutes (a successful sign-in does not count).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again in a few minutes." },
});

router.post("/login", loginLimiter, login);
router.post("/google", googleLogin);
router.get("/me", auth, me);
router.put("/me", auth, updateMe);
router.delete("/me", auth, deleteMe);

module.exports = router;
