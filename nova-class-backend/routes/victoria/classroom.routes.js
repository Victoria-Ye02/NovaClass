const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth.middleware");
const upload = require("../../middleware/upload");
const multer = require("multer");
// Larger limit for AI analysis routes — file is temp-processed and not stored
const aiUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.round(Math.random() * 1e6) + require("path").extname(file.originalname)),
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => cb(null, true),
});
// a voice recording is kept in memory only long enough to send it on
const voiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const ctrl = require("../../controllers/victoria/classroom.controller");
const posts = require("../../controllers/victoria/posts.controller");
const assign = require("../../controllers/victoria/assignment.controller");
const grades = require("../../controllers/victoria/grades.controller");
const resources = require("../../controllers/victoria/resources.controller");
const attendance = require("../../controllers/victoria/attendance.controller");
const bookmarks = require("../../controllers/victoria/bookmark.controller");
const highlights = require("../../controllers/victoria/highlight.controller");

router.post("/classes",                     auth, ctrl.createClass);
router.get("/classes",                      auth, ctrl.listClasses);
router.post("/classes/join",               auth, ctrl.joinClass);
router.get("/classes/:id",                  auth, ctrl.getClass);
router.get("/classes/:id/members",          auth, ctrl.getMembers);
router.get("/classes/:id/members/rich",     auth, ctrl.getRichMembers);
router.post("/classes/:id/notes",           auth, ctrl.sendNote);
router.get("/classes/:id/materials",        auth, ctrl.listMaterials);
router.post("/materials/generate-instructions", auth, aiUpload.single("file"), ctrl.generateInstructions);
router.post("/materials/suggest-youtube",       auth, aiUpload.single("file"), ctrl.suggestYoutubeForMaterial);
router.post("/classes/:id/materials",       auth, upload.materialUpload, ctrl.uploadMaterial);
router.get("/materials/:materialId/summary", auth, ctrl.getSummary);
router.get("/materials/:materialId/chat-history", auth, ctrl.getChatHistory);
router.post("/materials/:materialId/ai",    auth, ctrl.materialAI);
router.get("/materials/:materialId/lecture/:page", auth, require("../../controllers/victoria/lecture.controller").getSlideScript);
router.post("/materials/:materialId/lecture/:page/cues", auth, require("../../controllers/victoria/lecture.controller").getSlideCues);
router.get("/materials/:materialId/lecture/:page/quiz", auth, require("../../controllers/victoria/lecture.controller").getSlideQuiz);
router.post("/materials/:materialId/lecture/quiz/:quizId/answer", auth, require("../../controllers/victoria/lecture.controller").gradeSlideQuiz);
router.post("/tts",                         auth, ctrl.textToSpeech);
router.get("/voice/me",                     auth, ctrl.getMyVoice);
router.post("/voice/me",                    auth, voiceUpload.single("sample"), ctrl.saveMyVoice);
router.delete("/voice/me",                  auth, ctrl.deleteMyVoice);
router.get("/materials/:materialId/highlights", auth, highlights.getHighlights);
router.post("/materials/:materialId/highlights/start", auth, highlights.startHighlights);
router.post("/materials/:materialId/highlights/pages", auth, upload.highlightPageImage.single("image"), highlights.submitHighlightPage);
router.post("/materials/:materialId/highlights/complete", auth, highlights.completeHighlights);
router.post("/materials/:materialId/highlights/retry", auth, highlights.retryHighlights);
router.get("/materials/:materialId",         auth, ctrl.getMaterial);
router.get("/materials/:materialId/file",    auth.viaQueryOrHeader, ctrl.getMaterialFile);
router.get("/materials/:materialId/bookmarks", auth, bookmarks.listBookmarks);
router.post("/materials/:materialId/bookmarks", auth, bookmarks.saveBookmark);
router.delete("/materials/:materialId/bookmarks/:pageNumber", auth, bookmarks.removeBookmark);

router.get("/classes/:id/posts",           auth, posts.getPosts);
router.post("/classes/:id/posts",          auth, upload.anyFile.single("image"), posts.createPost);
router.put("/posts/:postId",               auth, posts.editPost);
router.delete("/posts/:postId",            auth, posts.deletePost);
router.post("/posts/:postId/comments",     auth, posts.addComment);
router.post("/posts/:postId/like",         auth, posts.likePost);
router.patch("/posts/:postId/pin",         auth, posts.pinPost);
router.put("/post-comments/:commentId",    auth, posts.editPostComment);
router.delete("/post-comments/:commentId", auth, posts.deletePostComment);

router.get("/classes/:id/assignments",         auth, assign.listAssignments);
router.post("/classes/:id/assignments",        auth, upload.anyFile.array("files", 10), assign.createAssignment);
router.get("/assignments/:id",                 auth, assign.getAssignment);
router.post("/assignments/:id/submit",         auth, upload.anyFile.array("files", 10), assign.submitAssignment);
router.post("/submissions/:id/grade",          auth, assign.gradeSubmission);
router.post("/submissions/:id/return",         auth, assign.returnSubmission);
router.post("/assignments/:id/ai-check",        auth, assign.aiCheck);
router.get("/assignments/:id/comments",        auth, assign.getComments);
router.post("/assignments/:id/comments",       auth, assign.addComment);
router.put("/comments/:commentId",             auth, assign.editComment);
router.delete("/comments/:commentId",          auth, assign.deleteComment);
router.patch("/assignments/:id/draft",         auth, assign.toggleDraft);
router.put("/assignments/:id",                 auth, upload.anyFile.array("files", 10), assign.updateAssignment);
router.delete("/assignments/:id",              auth, assign.deleteAssignment);
router.get("/assignments/:id/submission-stats", auth, assign.getSubmissionStats);
router.delete("/classes/:classId/members/:userId", auth, ctrl.removeMember);
router.get("/classes/:classId/students/:studentId/stats", auth, ctrl.getStudentStats);
router.post("/classes/:classId/invite", auth, ctrl.inviteStudent);

router.get("/classes/:id/grades",              auth, grades.getGrades);
router.get("/classes/:id/stream-stats",        auth, assign.getStreamStats);
router.patch("/assignments/:id/topic",         auth, assign.updateTopic);
router.patch("/materials/:id/topic",           auth, ctrl.updateMaterialTopic);
router.put("/materials/:id",                   auth, upload.materialUpload, ctrl.updateMaterial);
router.delete("/materials/:id",                auth, ctrl.deleteMaterial);
router.get("/materials/:materialId/assignments", auth, ctrl.getMaterialAssignments);
router.get("/materials/:materialId/comments",    auth, ctrl.getMaterialComments);
router.post("/materials/:materialId/comments",   auth, ctrl.addMaterialComment);
router.put("/material-comments/:commentId",      auth, ctrl.editMaterialComment);
router.delete("/material-comments/:commentId",   auth, ctrl.deleteMaterialComment);

router.get("/classes/:id/resources",           auth, resources.listResources);
router.post("/classes/:id/resources",          auth, upload.single("file"), resources.addResource);
router.delete("/resources/:id",                auth, resources.deleteResource);

// Attendance
router.get("/classes/:id/attendance",              auth, attendance.getSessions);
router.post("/classes/:id/attendance",             auth, attendance.createSession);
router.get("/classes/:id/attendance/me",           auth, attendance.getMyAttendance);
router.get("/attendance/summary",                  auth, attendance.getMyMonthlyAttendance);
router.get("/attendance/:sessionId",               auth, attendance.getSession);
router.patch("/attendance/:sessionId/mark",        auth, attendance.markAttendance);
router.delete("/attendance/:sessionId",            auth, attendance.deleteSession);
router.post("/classes/:id/leave-requests",         auth, upload.single("attachment"), attendance.createLeaveRequest);
router.get("/classes/:id/leave-requests",          auth, attendance.listLeaveRequests);
router.patch("/leave-requests/:id",                auth, attendance.reviewLeaveRequest);

// AI Tutor (hint-only)
router.get("/classes/:id/ai-tutor",                auth, ctrl.getAITutorConfig);
router.post("/classes/:id/ai-tutor",               auth, ctrl.saveAITutorConfig);
router.post("/classes/:id/ai-tutor/chat",          auth, ctrl.aiTutorChat);

router.get("/deadlines",                            auth, ctrl.listUpcomingDeadlines);

module.exports = router;
