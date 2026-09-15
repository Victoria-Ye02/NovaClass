const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-secret"],
}));
// Default 100kb was too small for the AI Study Mentor / Voice Teaching chat
// endpoints, which send the full conversation history on every turn — a
// long lesson taught page-by-page (Continue lesson / voice auto-continue)
// accumulates paragraph-length replies fast enough to blow past 100kb after
// a dozen or so pages, and every request just started failing outright
// with a 413 (surfaced to the student as a generic "Something went wrong").
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Victoria's routes ---
app.use("/api/auth",       require("./routes/victoria/auth.routes"));
app.use("/api/ai",         require("./routes/victoria/ai.routes"));
app.use("/api/classroom",  require("./routes/victoria/classroom.routes"));
app.use("/api/kmate",      require("./routes/victoria/kmate.routes"));
app.use("/api/progress",   require("./routes/victoria/progress.routes"));
app.use("/api/multimodal", require("./routes/victoria/multimodal.routes"));
app.use("/api/admin",     require("./routes/victoria/admin.routes"));
app.use("/api/notifications", require("./routes/victoria/notification.routes"));
app.use("/api/calendar",      require("./routes/victoria/calendar.routes"));

// --- Thine's routes (add as they land in routes/thine/) ---
app.use("/api/topik", require("./routes/thine/exam.routes"));

app.get("/", (req, res) => res.json({ status: "✅ Nova Class API running", port: process.env.PORT || 5001 }));

// Catches multer/fileFilter errors and any other thrown errors as clean JSON
// instead of Express's default HTML stack-trace page.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(400).json({ error: err.message || "요청을 처리할 수 없습니다." });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
