import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import API from "../../services/api";
import { useLang } from "../../LanguageContext";
import CommentContent from "../../components/CommentContent";
import PrivateCommentsPanel from "../../components/PrivateCommentsPanel";
import Icon from "../../components/Icon";
import {
  SubmissionComments, MaterialAssignmentForm, FileCard, extLabel, PostCard, QuizView, formatDate,
  btnStyle, layout, topHeader, backBtn, tabBtn, avatarSm, announceCard, announceTextarea,
  postBtn, postCard, matPostCard, dlBtn, commentToggle, commentRow, commentAvatar,
  commentBubble, commentInput, sendBtn, aiCard, aiBtn, sideCard, banner, newMatBtn,
  weekLabel, matRow, matIcon, fileChip, fab, sectionHead, memberRow, memberAvatar,
  overlayStyle, modalStyle, btnPrimary, btnOutline, lbl, inp, aiMentorPanel,
  aiAvatarStyle, aiFeatureCard,
  fbComposerCard, fbComposerInput, fbAvatar, fbActionBtn,
} from "./ClassDetailHelpers";

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [classInfo, setClassInfo] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const _initTab = new URLSearchParams(location.search).get("tab") || "stream";
  const _initAssign = new URLSearchParams(location.search).get("assign");
  const [activeTab, setActiveTab] = useState(_initTab);

  function goTab(tab) {
    setActiveTab(tab);
    navigate(`?tab=${tab}`, { replace: true });
  }
  const [loading, setLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);
  const [myId, setMyId] = useState(null);

  // Stream state
  const [announcement, setAnnouncement] = useState("");
  const [postImage, setPostImage] = useState(null);       // File object
  const [postImagePreview, setPostImagePreview] = useState(null); // object URL
  const [posting, setPosting] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [submittingComment, setSubmittingComment] = useState({});

  // Classwork state
  const [selectedMat, setSelectedMat] = useState(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: "", week: 1, instructions: "" });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadExtraFiles, setUploadExtraFiles] = useState([]);
  const [deleteAttachmentIds, setDeleteAttachmentIds] = useState([]);
  const [removeMainFile, setRemoveMainFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [linkedAssign, setLinkedAssign] = useState(null); // null | { title, due_date, points }
  const [expandedMats, setExpandedMats] = useState(new Set());
  const [generatingInstructions, setGeneratingInstructions] = useState(false);
  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [suggestingVideos, setSuggestingVideos] = useState(false);
  const [selectedVideoUrls, setSelectedVideoUrls] = useState(new Set());
  const [instructionLang, setInstructionLang] = useState("en");
  const [ytNextPageToken, setYtNextPageToken] = useState(null);
  const [ytLanguageHint, setYtLanguageHint] = useState("English");
  const [ytPromptQuery, setYtPromptQuery] = useState("");
  const fileRef = useRef();
  const extraFileRef = useRef();
  const cachedInstructionText = useRef("");
  // Guards handleSuggestVideos against out-of-order responses: if the file is
  // swapped while a search for the previous file is still in flight, the
  // older response can resolve after the newer one and silently overwrite it
  // with videos for the wrong document.
  const videoSearchSeq = useRef(0);

  // AI Study Mentor state
  const [aiModal, setAiModal] = useState(null); // null | 'highlights' | 'summary' | 'quiz' | 'chat' | 'tutor'
  const [tutorConfig, setTutorConfig] = useState(null);      // { lesson_context, homework_context, enabled }
  const [tutorSetupOpen, setTutorSetupOpen] = useState(false);
  const [tutorForm, setTutorForm] = useState({ lesson_context: "", homework_context: "", enabled: true });
  const [tutorSaving, setTutorSaving] = useState(false);
  const [tutorHistory, setTutorHistory] = useState([]);
  const [tutorInput, setTutorInput] = useState("");
  const [tutorSending, setTutorSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [aiHint, setAiHint] = useState(false); // show "select a material" hint
  const [levelUpLevel, setLevelUpLevel] = useState(null); // null | "beginner" | "intermediate" | "advanced"
  const chatEndRef = useRef(null);
  const [classworkTab, setClassworkTab] = useState("assignments"); // "assignments" | "lessons"

  // Grades state
  const [gradesData, setGradesData] = useState(null);
  const [gradesLoading, setGradesLoading] = useState(false);
  // Attendance
  const [attendanceSessions, setAttendanceSessions] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionRecords, setSessionRecords] = useState({});
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [newSessionModal, setNewSessionModal] = useState(false);
  const [newSessionForm, setNewSessionForm] = useState({ title: "", session_date: new Date().toISOString().slice(0, 10) });
  const [myAttendance, setMyAttendance] = useState(null);
  // Attendance calendar
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calSelectedDate, setCalSelectedDate] = useState(null); // "YYYY-MM-DD"
  // Student calendar (separate state from teacher calendar)
  const [calStudentYear, setCalStudentYear] = useState(today.getFullYear());
  const [calStudentMonth, setCalStudentMonth] = useState(today.getMonth());
  const [calStudentSelDate, setCalStudentSelDate] = useState(null); // "YYYY-MM-DD" for day detail
  const [disputeModal, setDisputeModal] = useState(null); // null | {title, session_date, status}
  const [disputeForm, setDisputeForm] = useState({ requested: "present", reason: "" });
  const [leaveModal, setLeaveModal] = useState(null); // null | "form" | "confirm"
  const [leaveForm, setLeaveForm] = useState({ from: new Date().toISOString().slice(0,10), to: new Date().toISOString().slice(0,10), reasonType: "medical", details: "", attachment: null });
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]); // teacher: all class requests
  const [leaveDetailModal, setLeaveDetailModal] = useState(null); // null | req object
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [attendanceMarkModal, setAttendanceMarkModal] = useState(false);
  const [attendanceModalEditMode, setAttendanceModalEditMode] = useState(false);
  const [originalRecords, setOriginalRecords] = useState({});
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [sessCtxMenu, setSessCtxMenu] = useState(null); // { id, x, y } — right-click / ⋮ context menu

  // Unread tracking (localStorage-based)
  const [seenAssignIds, setSeenAssignIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`nova_seen_assign_${id}`) || "[]")); } catch { return new Set(); }
  });
  const [seenMatIds, setSeenMatIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`nova_seen_mat_${id}`) || "[]")); } catch { return new Set(); }
  });

  function markAssignSeen(assignId) {
    setSeenAssignIds(prev => {
      const next = new Set(prev); next.add(assignId);
      localStorage.setItem(`nova_seen_assign_${id}`, JSON.stringify([...next]));
      return next;
    });
  }
  function markMatSeen(matId) {
    setSeenMatIds(prev => {
      const next = new Set(prev); next.add(matId);
      localStorage.setItem(`nova_seen_mat_${id}`, JSON.stringify([...next]));
      return next;
    });
  }

  // Resources state
  const [resources, setResources] = useState([]);
  const [resourceModal, setResourceModal] = useState(false);
  const [resourceForm, setResourceForm] = useState({ title: "", url: "" });
  const [resourceFile, setResourceFile] = useState(null);
  const [resourceAdding, setResourceAdding] = useState(false);
  const resourceFileRef = useRef();

  // Assignment state
  const [assignments, setAssignments] = useState([]);
  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ title: "", instructions: "", due_date: "", points: 100 });
  const [assignCreating, setAssignCreating] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignFiles, setAssignFiles] = useState([]);
  const assignFileRef = useRef(null);
  const [editAssignFiles, setEditAssignFiles] = useState([]); // new files for edit
  const editAssignFileRef = useRef(null);
  const [editDeleteFileIds, setEditDeleteFileIds] = useState([]); // ids to delete
  const [editAssignModal, setEditAssignModal] = useState(false);
  const [editAssignForm, setEditAssignForm] = useState({ title: "", instructions: "", due_date: "", points: 100 });
  const [editAssignSaving, setEditAssignSaving] = useState(false);
  const [editAssignError, setEditAssignError] = useState("");
  const [selectedAssign, setSelectedAssign] = useState(null); // assignment detail (teacher full page)
  const [assignDetail, setAssignDetail] = useState(null); // full detail with submissions
  const [selectedSubmissionStudent, setSelectedSubmissionStudent] = useState(null); // selected student in teacher view
  const [assignPage, setAssignPage] = useState(null); // student full-page view
  const [assignPageDetail, setAssignPageDetail] = useState(null);
  const [submitContent, setSubmitContent] = useState("");
  const [submitFiles, setSubmitFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false); // editing existing submission
  const [aiCheck, setAiCheck] = useState(null); // { loading, result }
  const [gradeInputs, setGradeInputs] = useState({});
  const [grading, setGrading] = useState({});
  const submitFileRef = useRef();
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [returning, setReturning] = useState({});
  const [streamStats, setStreamStats] = useState(null);

  // Material edit mode (null = create, number = editing material id)
  const [materialEditId, setMaterialEditId] = useState(null);
  const [matMenu, setMatMenu] = useState(null); // { id, x, y } — context/three-dot menu
  const [matDeleteConfirm, setMatDeleteConfirm] = useState(null); // material id to confirm delete

  // Material-linked assignments
  const [matAssignments, setMatAssignments] = useState([]);
  const [matAssignOpen, setMatAssignOpen] = useState(false);

  // Teacher-specific states
  const [editingPost, setEditingPost] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null); // People tab detail panel
  const [studentStats, setStudentStats] = useState(null);
  const [studentStatsLoading, setStudentStatsLoading] = useState(false);
  const [richMembers, setRichMembers] = useState(null);
  const [richLoading, setRichLoading] = useState(false);
  const [notePanel, setNotePanel] = useState(null); // null | { id, name }
  const [noteCategory, setNoteCategory] = useState("concern");
  const [noteMessage, setNoteMessage] = useState("");
  const [noteSending, setNoteSending] = useState(false);
  const [classNotices, setClassNotices] = useState([]);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null); // for assignment detail: click student row // { id, content }
  const [submissionStats, setSubmissionStats] = useState(null); // per-assignment stats modal
  const [submissionStatsLoading, setSubmissionStatsLoading] = useState(false);
  const [topicModal, setTopicModal] = useState(null); // { type: 'assignment'|'material', id, current }
  const [topicInput, setTopicInput] = useState("");

  const { lang } = useLang();
  // Small inline dictionary for strings that only exist in this file (not
  // yet promoted to i18n.js) — falls back to English for any language
  // without its own entry, so ko/vi never silently render Burmese.
  const tr = (strings) => strings[lang] ?? strings.en;
  const myName = localStorage.getItem("nova_name") || "You";

  useEffect(() => {
    loadAll().then((myRole) => {
      const tab = new URLSearchParams(location.search).get("tab");
      if (tab === "attendance") { loadAttendance(myRole); }
      if (tab === "grades") loadGrades();
      if (tab === "people") loadRichMembers();
    });
  }, [id]);

  // Push a history entry when a full-screen panel opens so the browser/trackpad
  // back gesture closes the panel instead of leaving the page.
  useEffect(() => {
    const isOpen = attendanceMarkModal || assignModal;
    if (!isOpen) return;
    window.history.pushState({ panel: true }, "");
    function handlePop() {
      setAttendanceMarkModal(false);
      setAttendanceSearchQuery("");
      setAttendanceModalEditMode(false);
      setAssignModal(false);
      setAssignFiles([]);
      setAssignForm({ title: "", instructions: "", due_date: "", points: 100 });
    }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [attendanceMarkModal, assignModal]);

  // Auto-navigate student calendar to most recent attendance month
  useEffect(() => {
    if (!myAttendance || !myAttendance.rows || myAttendance.rows.length === 0) return;
    const dates = myAttendance.rows
      .map(r => r.session_date ? r.session_date.slice(0, 10) : null)
      .filter(Boolean)
      .sort()
      .reverse();
    if (dates.length === 0) return;
    const latest = new Date(dates[0]);
    setCalStudentYear(latest.getFullYear());
    setCalStudentMonth(latest.getMonth());
  }, [myAttendance]);

  // Material creation now generates its AI YouTube suggestions in the
  // background (see backend: autoSuggestYoutubeResources) so the "Post"
  // button doesn't sit there for several seconds — but that means a
  // freshly-created material's `ai_resources` is still null in the
  // `materials` list snapshot this component already has. Poll for it
  // for a little while whenever the currently-open material doesn't have
  // any yet, so "Related YouTube Videos" appears once the background job
  // lands instead of requiring a manual reload to ever show up.
  useEffect(() => {
    if (!selectedMat || selectedMat.ai_resources?.length > 0) return;
    let cancelled = false;
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const { data } = await API.get(`/classroom/classes/${id}/materials`);
        const fresh = (data.materials || data || []).find(m => m.id === selectedMat.id);
        if (cancelled) return;
        if (fresh?.ai_resources?.length > 0) {
          setMaterials(prev => prev.map(m => m.id === fresh.id ? { ...m, ...fresh } : m));
          setSelectedMat(prev => (prev && prev.id === fresh.id ? { ...prev, ...fresh } : prev));
          clearInterval(poll);
        } else if (attempts >= 5) {
          clearInterval(poll);
        }
      } catch {
        clearInterval(poll);
      }
    }, 3000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [selectedMat?.id]);

  async function loadAll() {
    setLoading(true);
    try {
      const [classRes, matsRes, membersRes, postsRes] = await Promise.all([
        API.get(`/classroom/classes/${id}`),
        API.get(`/classroom/classes/${id}/materials`),
        API.get(`/classroom/classes/${id}/members`),
        API.get(`/classroom/classes/${id}/posts`),
      ]);
      const cls = classRes.data.class || classRes.data;
      setClassInfo(cls);
      const myRole = cls.my_role === "teacher";
      setIsTeacher(myRole);
      setMyId(cls.my_id);
      setMaterials(matsRes.data.materials || matsRes.data || []);
      const md = membersRes.data;
      setMembers(md.members || [
        ...(md.teachers || []).map(t => ({ ...t, role: "teacher" })),
        ...(md.students || []).map(s => ({ ...s, role: "student" })),
      ]);
      setPosts(postsRes.data || []);

      // Load optional data separately so failures don't block the page
      API.get(`/classroom/classes/${id}/assignments`).then(r => {
        const list = r.data || [];
        setAssignments(list);
        if (_initAssign && cls.my_role !== "teacher") {
          const target = list.find(a => String(a.id) === String(_initAssign));
          if (target) openAssignment(target);
        }
      }).catch(() => {});
      API.get(`/classroom/classes/${id}/resources`).then(r => setResources(r.data || [])).catch(() => {});
      API.get(`/classroom/classes/${id}/stream-stats`).then(r => setStreamStats(r.data)).catch(() => {});
      API.get(`/classroom/classes/${id}/ai-tutor`).then(r => {
        if (r.data) { setTutorConfig(r.data); setTutorForm({ lesson_context: r.data.lesson_context || "", homework_context: r.data.homework_context || "", enabled: !!r.data.enabled }); }
      }).catch(() => {});
      if (cls.my_role !== "teacher") loadClassNotices();
      return myRole;
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveTutorConfig() {
    setTutorSaving(true);
    try {
      const { data } = await API.post(`/classroom/classes/${id}/ai-tutor`, tutorForm);
      setTutorConfig(data);
      setTutorSetupOpen(false);
    } catch (err) { console.error(err); } finally { setTutorSaving(false); }
  }

  async function sendTutorMessage() {
    if (!tutorInput.trim() || tutorSending) return;
    const userMsg = { role: "user", content: tutorInput };
    const newHistory = [...tutorHistory, userMsg];
    setTutorHistory(newHistory);
    setTutorInput("");
    setTutorSending(true);
    try {
      const { data } = await API.post(`/classroom/classes/${id}/ai-tutor/chat`, {
        message: userMsg.content, history: tutorHistory, lang,
      });
      setTutorHistory([...newHistory, { role: "assistant", content: data.reply }]);
    } catch {
      setTutorHistory([...newHistory, { role: "assistant", content: tr({ en: "AI unavailable. Please try again.", my: "AI မရနိုင်ပါ။", ko: "AI를 사용할 수 없습니다. 다시 시도해 주세요.", vi: "AI hiện không khả dụng. Vui lòng thử lại." }) }]);
    } finally { setTutorSending(false); }
  }

  async function handleEditPost() {
    if (!editingPost?.content?.trim()) return;
    try {
      await API.put(`/classroom/posts/${editingPost.id}`, { content: editingPost.content });
      setPosts(prev => prev.map(p => p.id === editingPost.id ? { ...p, content: editingPost.content } : p));
      setEditingPost(null);
    } catch (err) { console.error(err); }
  }

  async function handleDeletePost(postId) {
    if (!window.confirm(tr({ en: "Delete this post?", my: "ဤ post ကို ဖျက်မည်လား?", ko: "이 게시물을 삭제하시겠습니까?", vi: "Xóa bài đăng này?" }))) return;
    try {
      await API.delete(`/classroom/posts/${postId}`);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) { console.error(err); }
  }

  function openEditAssign(a) {
    setEditAssignForm({
      title: a.title || "",
      instructions: a.instructions || "",
      due_date: a.due_date ? a.due_date.slice(0, 16) : "",
      points: a.points ?? 100,
    });
    setEditAssignError("");
    setEditAssignModal(true);
  }

  async function handleUpdateAssignment(isDraft) {
    if (!editAssignForm.title.trim()) { setEditAssignError("Title is required"); return; }
    setEditAssignSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", editAssignForm.title.trim());
      fd.append("instructions", editAssignForm.instructions || "");
      fd.append("due_date", editAssignForm.due_date || "");
      fd.append("points", editAssignForm.points || 100);
      fd.append("is_draft", isDraft ? 1 : 0);
      if (editDeleteFileIds.length) fd.append("delete_file_ids", JSON.stringify(editDeleteFileIds));
      for (const f of editAssignFiles) fd.append("files", f);
      const { data } = await API.put(`/classroom/assignments/${selectedAssign.id}`, fd);
      setAssignments(prev => prev.map(a => a.id === data.id ? data : a));
      setSelectedAssign(data);
      setEditAssignModal(false);
      setEditAssignFiles([]);
      setEditDeleteFileIds([]);
    } catch (err) {
      setEditAssignError(err.response?.data?.error || "Failed to save");
    } finally {
      setEditAssignSaving(false);
    }
  }

  async function openSubmissionStats(assignId) {
    setSubmissionStatsLoading(true);
    setSubmissionStats({ loading: true });
    try {
      const { data } = await API.get(`/classroom/assignments/${assignId}/submission-stats`);
      setSubmissionStats(data);
    } catch (err) { setSubmissionStats(null); }
    finally { setSubmissionStatsLoading(false); }
  }

  async function handleRemoveMember(memberId, memberName) {
    if (!window.confirm(tr({ en: `Remove "${memberName}" from this class?`, my: `"${memberName}" ကို class မှ ဖယ်ရှားမည်လား?`, ko: `"${memberName}"님을 이 반에서 제거하시겠습니까?`, vi: `Xóa "${memberName}" khỏi lớp học này?` }))) return;
    try {
      await API.delete(`/classroom/classes/${id}/members/${memberId}`);
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (err) { console.error(err); }
  }

  async function loadRichMembers(force = false) {
    if (!force && (richMembers !== null || richLoading)) return;
    setRichLoading(true);
    try {
      const { data } = await API.get(`/classroom/classes/${id}/members/rich`);
      setRichMembers(data.students || []);
    } catch { setRichMembers([]); }
    finally { setRichLoading(false); }
  }

  async function sendNote() {
    if (!notePanel || !noteMessage.trim()) return;
    setNoteSending(true);
    try {
      await API.post(`/classroom/classes/${id}/notes`, {
        studentId: notePanel.id, category: noteCategory, message: noteMessage,
      });
      setNotePanel(null);
      setNoteMessage("");
      setNoteCategory("concern");
    } catch (err) { console.error(err); }
    finally { setNoteSending(false); }
  }

  async function loadClassNotices() {
    try {
      const { data } = await API.get("/notifications");
      const notices = (data.notifications || []).filter(
        n => n.type === "teacher_note" && n.link_url === `/classroom/${id}` && !n.is_read
      );
      setClassNotices(notices);
    } catch { }
  }

  async function dismissNotice(noticeId) {
    try { await API.post(`/notifications/${noticeId}/read`); } catch { }
    setClassNotices(prev => prev.filter(n => n.id !== noticeId));
  }

  async function openStudentStats(student) {
    setSelectedStudent(student);
    setStudentStats(null);
    setStudentStatsLoading(true);
    try {
      const { data } = await API.get(`/classroom/classes/${id}/students/${student.id}/stats`);
      setStudentStats(data);
    } catch (err) { console.error(err); }
    finally { setStudentStatsLoading(false); }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const { data } = await API.post(`/classroom/classes/${id}/invite`, { email: inviteEmail });
      setInviteMsg({ ok: true, text: tr({ en: `✅ ${data.user.name} has been added to the class`, my: `✅ ${data.user.name} ကို class ထဲ ထည့်ပြီးပါပြီ`, ko: `✅ ${data.user.name}님이 반에 추가되었습니다`, vi: `✅ Đã thêm ${data.user.name} vào lớp học` }) });
      setInviteEmail("");
      // refresh members
      const res = await API.get(`/classroom/classes/${id}/members`);
      const md = res.data;
      setMembers(md.members || [...(md.teachers||[]).map(t=>({...t,role:"teacher"})),...(md.students||[]).map(s=>({...s,role:"student"}))]);
      // loadRichMembers() normally only fetches once (guarded by richMembers
      // !== null) — force bypasses that so a freshly-invited student shows
      // up in the People tab's grade/attendance table right away, instead
      // of only after a full page reload.
      loadRichMembers(true);
    } catch (err) {
      setInviteMsg({ ok: false, text: err.response?.data?.error || "Error occurred" });
    } finally { setInviting(false); }
  }

  async function saveTopic() {
    if (!topicModal) return;
    try {
      if (topicModal.type === "assignment") {
        await API.patch(`/classroom/assignments/${topicModal.id}/topic`, { topic: topicInput });
        setAssignments(prev => prev.map(a => a.id === topicModal.id ? { ...a, topic: topicInput } : a));
      } else {
        await API.patch(`/classroom/materials/${topicModal.id}/topic`, { topic: topicInput });
        setMaterials(prev => prev.map(m => m.id === topicModal.id ? { ...m, topic: topicInput } : m));
      }
      setTopicModal(null);
      setTopicInput("");
    } catch (err) { console.error(err); }
  }

  async function handlePost() {
    if (!announcement.trim() && !postImage) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append("content", announcement.trim());
      if (postImage) fd.append("image", postImage);
      const { data } = await API.post(`/classroom/classes/${id}/posts`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPosts(prev => [data, ...prev]);
      setAnnouncement("");
      setPostImage(null);
      if (postImagePreview) { URL.revokeObjectURL(postImagePreview); setPostImagePreview(null); }
    } catch (err) {
      console.error(err);
    } finally {
      setPosting(false);
    }
  }

  async function handleLike(postId) {
    try {
      const { data } = await API.post(`/classroom/posts/${postId}/like`);
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, liked_by_me: data.liked, like_count: data.like_count } : p
      ));
    } catch (err) { console.error(err); }
  }

  async function handlePin(postId) {
    try {
      const { data } = await API.patch(`/classroom/posts/${postId}/pin`);
      setPosts(prev => {
        const updated = prev.map(p => p.id === postId ? { ...p, is_pinned: data.is_pinned } : p);
        return [...updated].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      });
    } catch (err) { console.error(err); }
  }

  async function handleComment(postId) {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    setSubmittingComment(s => ({ ...s, [postId]: true }));
    try {
      const { data } = await API.post(`/classroom/posts/${postId}/comments`, { content });
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, comments: [...(p.comments || []), data] } : p
      ));
      setCommentInputs(c => ({ ...c, [postId]: "" }));
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(s => ({ ...s, [postId]: false }));
    }
  }

  function handleCommentUpdate(postId, updated) {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, comments: (p.comments || []).map(c => c.id === updated.id ? updated : c) } : p
    ));
  }

  function handleCommentDelete(postId, commentId) {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, comments: (p.comments || []).filter(c => c.id !== commentId) } : p
    ));
  }

  async function openAI(action) {
    if (!selectedMat) {
      // If called from Stream tab: switch to Classwork, auto-select first material if only one
      goTab("classwork");
      if (materials.length === 1) {
        setSelectedMat(materials[0]);
        setExpandedId(materials[0].id);
        setAiModal(action);
        setAiResult(null);
        setChatHistory([]);
        if (action !== "chat") {
          setAiLoading(true);
          try {
            const { data } = await API.post(`/classroom/materials/${materials[0].id}/ai`, { action, lang });
            setAiResult(data.data);
          } catch {
            setAiResult({ error: "AI unavailable. Check OPENAI_API_KEY in backend .env" });
          } finally {
            setAiLoading(false);
          }
        }
      } else {
        setAiHint(action); // show "please select a material" banner
      }
      return;
    }
    setAiModal(action);
    setAiResult(null);
    setChatHistory([]);
    if (action === "tutor") { setTutorHistory([]); setTutorInput(""); return; }
    if (action === "chat") { setLevelUpLevel(null); return; }
    setAiLoading(true);
    try {
      const { data } = await API.post(`/classroom/materials/${selectedMat.id}/ai`, { action, lang });
      setAiResult(data.data);
    } catch (err) {
      setAiResult({ error: "AI unavailable. Check OPENAI_API_KEY in backend .env" });
    } finally {
      setAiLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !selectedMat) return;
    const userMsg = { role: "user", content: chatInput };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setChatSending(true);
    try {
      const { data } = await API.post(`/classroom/materials/${selectedMat.id}/ai`, {
        action: "chat", message: chatInput, history: chatHistory, level: levelUpLevel, lang,
      });
      setChatHistory([...newHistory, { role: "assistant", content: data.reply }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setChatHistory([...newHistory, { role: "assistant", content: tr({ en: "AI unavailable. Please check the backend.", my: "AI မရနိုင်ပါ။ Backend ကို စစ်ဆေးပါ။", ko: "AI를 사용할 수 없습니다. 백엔드를 확인해 주세요.", vi: "AI hiện không khả dụng. Vui lòng kiểm tra backend." }) }]);
    } finally {
      setChatSending(false);
    }
  }

  async function startLevelUpChat(level) {
    setLevelUpLevel(level);
    setChatHistory([]);
    setChatSending(true);
    const startMsg = {
      beginner: tr({
        en: "I'm ready to learn this material from scratch. Please ask me the first question — I'll answer as best I can.",
        my: "ဒီသင်ခန်းစာကို ယခုမှ စတင်လေ့လာမည်ဆိုတာ သိပြီ။ ပထမဆုံး မေးခွန်းလေး မေးမယ်နော် — ဖြေနိုင်သလောက် ဖြေပေးပါ၊ မမှန်ရင်လဲ ကိစ္စမရှိဘူး။",
        ko: "이 자료를 처음부터 배울 준비가 되었어요. 첫 질문을 해주세요 — 최선을 다해 답할게요.",
        vi: "Tôi đã sẵn sàng học tài liệu này từ đầu. Hãy hỏi tôi câu đầu tiên — tôi sẽ cố gắng trả lời tốt nhất.",
      }),
      intermediate: tr({
        en: "I know the basics of this material. Let's check what I know well.",
        my: "ဒီသင်ခန်းစာကို တစ်ဝက်လောက် နားလည်ပြီဆိုတာ သိပြီ။ ဘာတွေ ကောင်းကောင်းသိပြီးလဲ စစ်ဆေးကြည့်မယ်နော်။",
        ko: "이 자료의 기본은 알고 있어요. 제가 얼마나 잘 아는지 확인해 주세요.",
        vi: "Tôi biết những kiến thức cơ bản của tài liệu này. Hãy kiểm tra xem tôi biết rõ đến đâu.",
      }),
      advanced: tr({
        en: "I understand this material well. Challenge me with hard questions.",
        my: "ဒီသင်ခန်းစာကို ကောင်းကောင်းသိပြီဆိုတာ သိပြီ။ ခက်ဆစ်တဲ့ မေးခွန်းတွေနဲ့ စိန်ခေါ်မယ်နော်။",
        ko: "이 자료를 잘 이해하고 있어요. 어려운 질문으로 도전해 주세요.",
        vi: "Tôi hiểu rõ tài liệu này. Hãy thử thách tôi bằng những câu hỏi khó.",
      }),
    };
    try {
      const { data } = await API.post(`/classroom/materials/${selectedMat.id}/ai`, {
        action: "chat",
        message: startMsg[level],
        history: [],
        level,
        lang,
      });
      setChatHistory([{ role: "assistant", content: data.reply }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setChatHistory([{ role: "assistant", content: tr({ en: "AI unavailable. Please check the backend.", my: "AI မရနိုင်ပါ။ Backend ကို စစ်ဆေးပါ။", ko: "AI를 사용할 수 없습니다. 백엔드를 확인해 주세요.", vi: "AI hiện không khả dụng. Vui lòng kiểm tra backend." }) }]);
    } finally {
      setChatSending(false);
    }
  }

  async function loadGrades() {
    setGradesLoading(true);
    try {
      const { data } = await API.get(`/classroom/classes/${id}/grades`);
      setGradesData(data);
    } catch (err) { console.error(err); }
    finally { setGradesLoading(false); }
  }

  async function loadAttendance(forceTeacher) {
    const asTeacher = forceTeacher !== undefined ? forceTeacher : isTeacher;
    setAttendanceLoading(true);
    try {
      if (asTeacher) {
        const { data } = await API.get(`/classroom/classes/${id}/attendance`);
        setAttendanceSessions(data);
        const { data: lr } = await API.get(`/classroom/classes/${id}/leave-requests`);
        setLeaveRequests(lr);
      } else {
        const { data } = await API.get(`/classroom/classes/${id}/attendance/me`);
        setMyAttendance(data);
        const { data: lr } = await API.get(`/classroom/classes/${id}/leave-requests`);
        setLeaveHistory(lr);
      }
    } catch (err) { console.error(err); }
    finally { setAttendanceLoading(false); }
  }

  async function submitLeaveRequest() {
    try {
      const fd = new FormData();
      fd.append("from_date", leaveForm.from);
      fd.append("to_date", leaveForm.to);
      fd.append("reason_type", leaveForm.reasonType);
      fd.append("details", leaveForm.details || "");
      if (leaveForm.attachment) fd.append("attachment", leaveForm.attachment);
      const { data } = await API.post(`/classroom/classes/${id}/leave-requests`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLeaveHistory(h => [data, ...h]);
      setLeaveModal("confirm");
    } catch (err) { console.error(err); }
  }

  async function reviewLeave(leaveId, status) {
    try {
      const { data } = await API.patch(`/classroom/leave-requests/${leaveId}`, { status });
      setLeaveRequests(prev => prev.map(r => r.id === leaveId ? data : r));
      setLeaveDetailModal(prev => prev?.id === leaveId ? data : prev);
    } catch (err) { console.error(err); }
  }

  async function createAttendanceSession() {
    if (!newSessionForm.title.trim() || !newSessionForm.session_date) return;
    try {
      const { data } = await API.post(`/classroom/classes/${id}/attendance`, newSessionForm);
      setAttendanceSessions(prev => [data, ...(prev || [])]);
      setNewSessionModal(false);
      setNewSessionForm({ title: "", session_date: new Date().toISOString().slice(0, 10) });
      // Open the new session right away for marking
      openAttendanceSession(data.id);
    } catch (err) { console.error(err); }
  }

  async function openAttendanceSession(sessionId, isTaken = false) {
    try {
      const { data } = await API.get(`/classroom/attendance/${sessionId}`);
      setActiveSession(data);
      const rmap = {};
      for (const r of data.records) rmap[r.student_id] = r.status || "present";
      setSessionRecords(rmap);
      setOriginalRecords(isTaken ? { ...rmap } : {});
      setAttendanceSearchQuery("");
      setAttendanceModalEditMode(!isTaken);
      setAttendanceMarkModal(true);
    } catch (err) { console.error(err); }
  }

  async function saveAttendance() {
    setSavingAttendance(true);
    try {
      const records = Object.entries(sessionRecords).map(([student_id, status]) => ({ student_id: Number(student_id), status }));
      await API.patch(`/classroom/attendance/${activeSession.id}/mark`, { records });
      setAttendanceModalEditMode(false);
      loadAttendance();
    } catch (err) {
      console.error("saveAttendance error:", err);
      alert("Save failed: " + (err?.response?.data?.error || err.message));
    } finally { setSavingAttendance(false); }
  }

  async function deleteAttendanceSession(sessionId) {
    try {
      await API.delete(`/classroom/attendance/${sessionId}`);
      setAttendanceSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) { console.error(err); }
  }

  async function addResource() {
    if (!resourceForm.title.trim()) return;
    setResourceAdding(true);
    try {
      const fd = new FormData();
      fd.append("title", resourceForm.title);
      if (resourceFile) fd.append("file", resourceFile);
      else fd.append("url", resourceForm.url);
      const { data } = await API.post(`/classroom/classes/${id}/resources`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResources(prev => [data, ...prev]);
      setResourceModal(false);
      setResourceForm({ title: "", url: "" });
      setResourceFile(null);
      if (resourceFileRef.current) resourceFileRef.current.value = "";
    } catch (err) { console.error(err); }
    finally { setResourceAdding(false); }
  }

  async function deleteResource(resId) {
    try {
      await API.delete(`/classroom/resources/${resId}`);
      setResources(prev => prev.filter(r => r.id !== resId));
    } catch (err) { console.error(err); }
  }

  async function createAssignment(asDraft = false) {
    if (!assignForm.title.trim()) return;
    setAssignCreating(true); setAssignError("");
    try {
      const fd = new FormData();
      fd.append("title", assignForm.title.trim());
      fd.append("instructions", assignForm.instructions || "");
      fd.append("due_date", assignForm.due_date || "");
      fd.append("points", assignForm.points || 100);
      fd.append("is_draft", asDraft ? 1 : 0);
      for (const f of assignFiles) fd.append("files", f);
      const { data } = await API.post(`/classroom/classes/${id}/assignments`, fd);
      setAssignments(prev => [data, ...prev]);
      setAssignModal(false);
      setAssignForm({ title: "", instructions: "", due_date: "", points: 100 });
      setAssignFiles([]);
    } catch (err) {
      setAssignError(err.response?.data?.error || "Failed to create assignment.");
    } finally {
      setAssignCreating(false);
    }
  }

  async function deleteMaterial(id) {
    try {
      await API.delete(`/classroom/materials/${id}`);
      setMaterials(prev => prev.filter(m => m.id !== id));
      if (selectedMat?.id === id) setSelectedMat(null);
    } catch (e) {
      alert(e.response?.data?.error || "Delete failed");
    } finally {
      setMatDeleteConfirm(null);
      setMatMenu(null);
    }
  }

  function openEditMatModal() {
    const mat = selectedMat;
    setUploadForm({ title: mat.title, week: mat.week || 1, instructions: mat.instructions || "" });
    setUploadFile(null);
    setUploadExtraFiles([]);
    setDeleteAttachmentIds([]);
    setRemoveMainFile(false);
    setUploadError("");
    // Pre-load existing YouTube videos
    const existing = Array.isArray(mat.ai_resources) ? mat.ai_resources : [];
    setSuggestedVideos(existing);
    setSelectedVideoUrls(new Set(existing.map(v => v.url)));
    setYtNextPageToken(null);
    cachedInstructionText.current = "";
    setMaterialEditId(mat.id);
  }

  function openEditMatById(id) {
    const mat = materials.find(m => m.id === id);
    if (!mat) return;
    setSelectedMat(mat);
    setUploadForm({ title: mat.title, week: mat.week || 1, instructions: mat.instructions || "" });
    setUploadFile(null);
    setUploadExtraFiles([]);
    setDeleteAttachmentIds([]);
    setRemoveMainFile(false);
    setUploadError("");
    const existing = Array.isArray(mat.ai_resources) ? mat.ai_resources : [];
    setSuggestedVideos(existing);
    setSelectedVideoUrls(new Set(existing.map(v => v.url)));
    setYtNextPageToken(null);
    cachedInstructionText.current = "";
    setMaterialEditId(mat.id);
  }

  async function loadMatAssignments(materialId) {
    try {
      const { data } = await API.get(`/classroom/materials/${materialId}/assignments`);
      setMatAssignments(data || []);
    } catch {}
  }

  async function openAssignment(assign) {
    markAssignSeen(assign.id);
    if (!isTeacher) {
      // Student → full page view
      setSelectedMat(null);
      setAssignPage(assign);
      setAssignPageDetail(null);
      setSubmitContent(assign.my_submission?.content || "");
      setEditing(false);
      setAiCheck(null);
      setComments([]);
      setCommentInput("");
      try {
        const [detail, cmts] = await Promise.all([
          API.get(`/classroom/assignments/${assign.id}`),
          API.get(`/classroom/assignments/${assign.id}/comments`),
        ]);
        setAssignPageDetail(detail.data);
        setComments(cmts.data || []);
      } catch (err) { console.error(err); }
      return;
    }
    // Teacher → full page view
    setSelectedAssign(assign);
    setAssignDetail(null);
    setSelectedSubmissionStudent(null);
    try {
      const { data } = await API.get(`/classroom/assignments/${assign.id}`);
      setAssignDetail(data);
    } catch (err) { console.error(err); }
  }

  async function checkWithAI() {
    if (!assignPage) return;
    setAiCheck({ loading: true, result: null });
    try {
      const { data } = await API.post(`/classroom/assignments/${assignPage.id}/ai-check`, {
        answer: submitContent,
        hasFile: submitFiles.length > 0,
        fileName: submitFiles.map(f => f.name).join(", ") || null,
        lang,
      });
      setAiCheck({ loading: false, result: data });
    } catch {
      setAiCheck({ loading: false, result: { isComplete: null, score: null, missing: [], feedback: tr({ en: "AI check failed. Please try again later.", my: "AI စစ်ဆေးမှု မအောင်မြင်ပါ။ နောက်မှ ထပ်ကြိုးစားပါ။", ko: "AI 점검에 실패했습니다. 나중에 다시 시도해 주세요.", vi: "Kiểm tra AI thất bại. Vui lòng thử lại sau." }) } });
    }
  }

  async function sendComment(assignId, targetStudentId = null) {
    if (!commentInput.trim()) return;
    setCommentSending(true);
    try {
      const { data } = await API.post(`/classroom/assignments/${assignId}/comments`, {
        content: commentInput.trim(),
        target_student_id: targetStudentId,
      });
      setComments(c => [...c, data]);
      setCommentInput("");
    } catch (err) {
      console.error(err);
    } finally {
      setCommentSending(false);
    }
  }

  async function returnSubmission(subId) {
    setReturning(r => ({ ...r, [subId]: true }));
    try {
      await API.post(`/classroom/submissions/${subId}/return`);
      setAssignDetail(d => d ? {
        ...d,
        submissions: d.submissions.map(s => s.id === subId ? { ...s, status: "returned" } : s),
      } : d);
    } catch (err) {
      console.error(err);
    } finally {
      setReturning(r => ({ ...r, [subId]: false }));
    }
  }

  async function publishDraft(assignId) {
    try {
      await API.patch(`/classroom/assignments/${assignId}/draft`, { is_draft: false });
      setAssignments(prev => prev.map(a => a.id === assignId ? { ...a, is_draft: false } : a));
      setSelectedAssign(a => a ? { ...a, is_draft: false } : a);
    } catch (err) { console.error(err); }
  }

  async function submitAssignment() {
    const target = assignPage || selectedAssign;
    if (!target) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (submitContent) fd.append("content", submitContent);
      submitFiles.forEach(f => fd.append("files", f));
      const { data } = await API.post(`/classroom/assignments/${target.id}/submit`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAssignments(prev => prev.map(a =>
        a.id === target.id ? { ...a, my_submission: data } : a
      ));
      if (assignPage) {
        setAssignPage(a => ({ ...a, my_submission: data }));
        setAssignPageDetail(d => d ? { ...d, my_submission: data } : d);
        setEditing(false);
        setAiCheck(null);
      }
      setAssignDetail(d => d ? { ...d, my_submission: data } : d);
      setSubmitFiles([]);
      if (submitFileRef.current) submitFileRef.current.value = "";
    } catch (err) {
      alert(err.response?.data?.error || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function gradeSubmission(subId) {
    const { grade, comment } = gradeInputs[subId] || {};
    setGrading(g => ({ ...g, [subId]: true }));
    try {
      const { data } = await API.post(`/classroom/submissions/${subId}/grade`, {
        grade, grade_comment: comment,
      });
      setAssignDetail(d => d ? {
        ...d,
        submissions: d.submissions.map(s => s.id === subId ? data : s),
      } : d);
    } catch (err) {
      console.error(err);
    } finally {
      setGrading(g => ({ ...g, [subId]: false }));
    }
  }

  async function handleGenerateInstructions(langOverride) {
    if (!uploadFile && !cachedInstructionText.current) return;
    setGeneratingInstructions(true);
    try {
      const fd = new FormData();
      fd.append("title", uploadForm.title);
      fd.append("week", uploadForm.week);
      fd.append("classId", id);
      fd.append("lang", langOverride || instructionLang);
      if (cachedInstructionText.current) {
        // Fast path: skip Vision re-reading, use cached extracted text
        fd.append("textContent", cachedInstructionText.current);
      } else {
        fd.append("file", uploadFile);
      }
      const { data } = await API.post("/classroom/materials/generate-instructions", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.textContent) cachedInstructionText.current = data.textContent;
      if (data.instructions) setUploadForm(f => ({ ...f, instructions: data.instructions }));
    } catch { /* silent */ } finally {
      setGeneratingInstructions(false);
    }
  }

  async function handleSuggestVideos(fileArg, useNextPage = false) {
    const fileToUse = fileArg !== undefined ? fileArg : uploadFile;
    const usingManualQuery = !fileToUse && ytPromptQuery.trim();
    if (!fileToUse && !usingManualQuery) return;
    const seq = ++videoSearchSeq.current;
    setSuggestingVideos(true);
    setSuggestedVideos([]);
    try {
      const fd = new FormData();
      fd.append("title", uploadForm.title);
      if (usingManualQuery) {
        fd.append("manualQuery", ytPromptQuery.trim());
      } else {
        fd.append("file", fileToUse);
        if (useNextPage && ytNextPageToken) fd.append("pageToken", ytNextPageToken);
        if (useNextPage) fd.append("forceRefresh", "1");
      }
      if (ytLanguageHint.trim()) fd.append("languageHint", ytLanguageHint.trim());
      const [{ data }] = await Promise.all([
        API.post("/classroom/materials/suggest-youtube", fd, { headers: { "Content-Type": "multipart/form-data" } }),
        new Promise(resolve => setTimeout(resolve, 600)),
      ]);
      if (seq !== videoSearchSeq.current) return;
      setSuggestedVideos(data.videos || []);
      setYtNextPageToken(data.nextPageToken || null);
      setSelectedVideoUrls(new Set());
    } catch { /* silent */ } finally {
      if (seq === videoSearchSeq.current) setSuggestingVideos(false);
    }
  }

  function closeUploadModal() {
    setUploadModal(false);
    setMaterialEditId(null);
    setUploadForm({ title: "", week: 1, instructions: "" });
    setUploadFile(null);
    setUploadExtraFiles([]);
    setDeleteAttachmentIds([]);
    setRemoveMainFile(false);
    setUploadError("");
    setSuggestedVideos([]);
    setYtNextPageToken(null);
    setSelectedVideoUrls(new Set());
    setLinkedAssign(null);
    cachedInstructionText.current = "";
    videoSearchSeq.current++;
    if (fileRef.current) fileRef.current.value = "";
    if (extraFileRef.current) extraFileRef.current.value = "";
  }

  async function handleUpload() {
    if (!uploadForm.title.trim()) return;
    setUploading(true); setUploadError("");
    try {
      const fd = new FormData();
      fd.append("title", uploadForm.title);
      fd.append("week", uploadForm.week);
      fd.append("instructions", uploadForm.instructions);
      if (uploadFile) fd.append("file", uploadFile);
      uploadExtraFiles.forEach(f => fd.append("files", f));
      if (materialEditId && deleteAttachmentIds.length) fd.append("delete_file_ids", JSON.stringify(deleteAttachmentIds));
      if (materialEditId && removeMainFile) fd.append("remove_main_file", "true");
      const selectedVids = suggestedVideos.filter(v => selectedVideoUrls.has(v.url));
      fd.append("ai_resources", JSON.stringify(selectedVids));

      if (materialEditId) {
        // Edit mode — PUT existing material
        const { data } = await API.put(`/classroom/materials/${materialEditId}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setSelectedMat(prev => ({ ...prev, ...data }));
        setMaterials(prev => prev.map(m => m.id === materialEditId ? { ...m, ...data } : m));
      } else {
        // Create mode — POST new material
        const { data: matData } = await API.post(`/classroom/classes/${id}/materials`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        // Upload itself succeeded, but text extraction may not have (a
        // scanned/image-only PDF, or a non-PDF file) — the teacher needs to
        // know now, not discover it later when AI Study Mentor or Voice
        // Teaching quietly has nothing real to work from and starts guessing
        // from just the title.
        if (matData.warning) {
          alert(`⚠️ ${matData.warning}\n\nAI Study Mentor and Voice Teaching need readable text from the file to work correctly for this lesson.`);
        }
        // Optionally create a linked assignment in the same action
        if (linkedAssign && linkedAssign.title.trim()) {
          const afd = new FormData();
          afd.append("title", linkedAssign.title.trim());
          if (linkedAssign.due_date) afd.append("due_date", linkedAssign.due_date);
          afd.append("points", String(linkedAssign.points || 100));
          afd.append("material_id", String(matData.id));
          await API.post(`/classroom/classes/${id}/assignments`, afd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
        loadAll();
      }
      closeUploadModal();
    } catch (err) {
      setUploadError(err.response?.data?.message || err.response?.data?.error || "Failed to save.");
    } finally {
      setUploading(false);
    }
  }

  const weekGroups = materials.reduce((acc, mat) => {
    const w = mat.week || 1;
    if (!acc[w]) acc[w] = [];
    acc[w].push(mat);
    return acc;
  }, {});

  const teacher = members.find(m => m.role === "teacher");
  const students = members.filter(m => m.role === "student");

  if (loading) return (
    <div style={layout}>
      <Sidebar />
      <main style={{ marginLeft: "240px", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-faint)" }}>Loading...</p>
      </main>
    </div>
  );

  if (!classInfo) return (
    <div style={layout}>
      <Sidebar />
      <main style={{ marginLeft: "240px", padding: "32px" }}>
        <button onClick={() => navigate("/classroom")} style={backBtn}>← Back</button>
        <p style={{ color: "#ef4444", marginTop: "16px" }}>Class not found.</p>
      </main>
    </div>
  );

  return (
    <div style={layout}>
      <Sidebar />
      <div style={{ marginLeft: "240px", flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* Header */}
        <div style={topHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button onClick={() => navigate("/classroom")} style={backBtn}>←</button>
            <div>
              <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", margin: 0 }}>{classInfo.name}</h1>
              {classInfo.subject && <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>{classInfo.subject}</p>}
            </div>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {[
              { key: "stream", label: "Stream" },
              { key: "classwork", label: "Classwork" },
              { key: "attendance", label: "Attendance" },
              ...(isTeacher ? [{ key: "people", label: "People" }] : []),
            ].map(tab => (
              <button key={tab.key} onClick={() => {
                goTab(tab.key);
                if (tab.key === "grades" && !gradesData) loadGrades();
                if (tab.key === "attendance" && !attendanceSessions && !myAttendance) loadAttendance();
                if (tab.key === "people") loadRichMembers();
              }} style={tabBtn(activeTab === tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px 32px", background: "var(--bg)" }}>

          {/* ── STUDENT NOTICE BOXES (teacher notes) ── */}
          {!isTeacher && classNotices.length > 0 && (
            <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {classNotices.map(n => (
                <div key={n.id} style={{ display: "flex", gap: "12px", background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.4)", borderRadius: "14px", padding: "14px 16px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>⚠️</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>{n.title}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.5 }}>{n.message}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "6px" }}>
                      {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button onClick={() => dismissNotice(n.id)} style={{ background: "none", border: "none", color: "#9A3412", fontSize: "14px", cursor: "pointer", flexShrink: 0, padding: "0 4px" }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* ── STREAM TAB ── */}
          {activeTab === "stream" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "24px", alignItems: "start" }}>

              {/* ── LEFT: Facebook-style feed ── */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0 }}>Stream</h3>
                  <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>· {classInfo.name}</span>
                </div>

                {/* Composer — everyone can post */}
                <div style={fbComposerCard}>
                  <div style={{ display: "flex", gap: "14px", alignItems: announcement ? "flex-start" : "center" }}>
                    <div style={{ ...fbAvatar, width: "46px", height: "46px", fontSize: "17px", flexShrink: 0 }}>{myName[0].toUpperCase()}</div>
                    {announcement ? (
                      <textarea
                        value={announcement}
                        onChange={e => setAnnouncement(e.target.value)}
                        placeholder="What's on your mind?"
                        style={{ flex: 1, border: "1.5px solid var(--border)", borderRadius: "12px", outline: "none", fontSize: "14px", color: "var(--text)", resize: "none", background: "var(--surface-alt)", fontFamily: "inherit", lineHeight: 1.7, minHeight: "90px", padding: "12px 16px" }}
                        rows={4}
                        autoFocus
                      />
                    ) : (
                      <div onClick={() => setAnnouncement(" ")} style={fbComposerInput}>
                        What's on your mind?
                      </div>
                    )}
                  </div>

                  {/* Image preview */}
                  {postImagePreview && (
                    <div style={{ position: "relative", marginTop: "12px", borderRadius: "12px", overflow: "hidden", display: "inline-block", maxWidth: "100%" }}>
                      <img src={postImagePreview} alt="preview" style={{ maxWidth: "100%", maxHeight: "300px", borderRadius: "12px", display: "block" }} />
                      <button onClick={() => { setPostImage(null); URL.revokeObjectURL(postImagePreview); setPostImagePreview(null); }}
                        style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: "28px", height: "28px", color: "#fff", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  )}

                  {(announcement.trim() || postImage) && (
                    <>
                      <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 10px" }} />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        {/* Photo button */}
                        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", color: "var(--text-muted)", padding: "6px 10px", borderRadius: "8px", background: "var(--surface-alt)" }}>
                          <span>🖼</span> Photo
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                            const f = e.target.files[0];
                            if (!f) return;
                            if (postImagePreview) URL.revokeObjectURL(postImagePreview);
                            setPostImage(f);
                            setPostImagePreview(URL.createObjectURL(f));
                            e.target.value = "";
                          }} />
                        </label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => { setAnnouncement(""); setPostImage(null); if (postImagePreview) { URL.revokeObjectURL(postImagePreview); setPostImagePreview(null); } }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "var(--text-muted)", padding: "7px 14px" }}>Cancel</button>
                          <button onClick={handlePost} disabled={posting} style={postBtn}>{posting ? "Posting..." : "Post"}</button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Photo button when composer just opened (no text yet) */}
                  {!announcement.trim() && !postImage && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", color: "var(--text-muted)", padding: "7px 14px", borderRadius: "8px", background: "var(--surface-alt)", flex: 1, justifyContent: "center" }}>
                        <span>🖼</span> Photo / Video
                        <input type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => {
                          const f = e.target.files[0];
                          if (!f) return;
                          setPostImage(f);
                          setPostImagePreview(URL.createObjectURL(f));
                          setAnnouncement(" ");
                          e.target.value = "";
                        }} />
                      </label>
                    </div>
                  )}
                </div>

                {posts.length === 0
                  ? <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-faint)" }}><div style={{ fontSize: "32px", marginBottom: "8px" }}>📢</div><p>No posts yet.</p></div>
                  : posts.map(post => (
                    <PostCard key={post.id} post={post} myName={myName} myId={myId} isTeacher={isTeacher}
                      onEdit={p => setEditingPost({ id: p.id, content: p.content })}
                      onDelete={handleDeletePost}
                      onLike={handleLike}
                      onPin={handlePin}
                      expandedComments={expandedComments} setExpandedComments={setExpandedComments}
                      commentInputs={commentInputs} setCommentInputs={setCommentInputs}
                      submittingComment={submittingComment} handleComment={handleComment}
                      onCommentUpdate={handleCommentUpdate} onCommentDelete={handleCommentDelete} />
                  ))
                }
              </div>

              {/* ── RIGHT SIDEBAR ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                {/* Submission Status */}
                <div style={sideCard}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginBottom: "14px", textAlign: "center" }}>
                    Submission Status
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Activity</div>
                      <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--primary)" }}>{streamStats?.totalAssignments ?? "—"}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>case</div>
                    </div>
                    <div style={{ position: "relative", width: "80px", height: "80px" }}>
                      <svg viewBox="0 0 36 36" style={{ width: "80px", height: "80px", transform: "rotate(-90deg)" }}>
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3.5" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--primary)" strokeWidth="3.5"
                          strokeDasharray={`${streamStats?.submissionRate ?? 0} ${100 - (streamStats?.submissionRate ?? 0)}`}
                          strokeLinecap="round" />
                      </svg>
                      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: "14px", fontWeight: 800, color: "var(--text)" }}>
                        {streamStats?.submissionRate ?? 0}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Important (pinned/latest posts) */}
                {posts.length > 0 && (
                  <div style={sideCard}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>Important</div>
                    {posts.slice(0, 2).map(p => (
                      <div key={p.id} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--surface-alt)" }}>
                        <span style={{ fontSize: "13px" }}>⭐</span>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>{p.content?.slice(0, 55)}{p.content?.length > 55 ? "…" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Class code */}
                {classInfo.code && (
                  <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "12px", padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>Class Code</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--primary)", letterSpacing: "4px" }}>{classInfo.code}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>Share with students</div>
                  </div>
                )}

                {/* New Posts */}
                <div style={sideCard}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>New Posts</div>
                  {posts.length === 0
                    ? <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>No Data.</div>
                    : posts.slice(0, 2).map(p => (
                      <div key={p.id} style={{ fontSize: "12px", color: "var(--text-muted)", padding: "4px 0", borderBottom: "1px solid var(--surface-alt)" }}>
                        {p.content?.slice(0, 40)}{p.content?.length > 40 ? "…" : ""}
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          )}


          {/* ── CLASSWORK TAB ── */}
          {activeTab === "classwork" && (
            <div style={{ display: "grid", gridTemplateColumns: (selectedMat && !isTeacher) ? "1fr 320px" : "1fr", gap: "24px", alignItems: "start" }}>
              {/* Left: material list */}
              <div>

                {/* Teacher action buttons — hidden when viewing a material */}
                {isTeacher && !selectedMat && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                    {/* AI Tutor status chip */}
                    <button onClick={() => setTutorSetupOpen(true)} style={{ display: "flex", alignItems: "center", gap: "8px", background: tutorConfig?.enabled ? "rgba(34,197,94,0.12)" : "var(--surface-alt)", border: `1.5px solid ${tutorConfig?.enabled ? "rgba(34,197,94,0.4)" : "var(--border)"}`, borderRadius: "20px", padding: "6px 14px", fontSize: "12px", fontWeight: 700, color: tutorConfig?.enabled ? "#22c55e" : "var(--text-muted)", cursor: "pointer" }}>
                      🤖 AI Tutor {tutorConfig?.enabled ? "● Active" : "Setup"}
                    </button>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setAssignModal(true)} style={{ background: "var(--surface)", color: "var(--primary)", border: "1.5px solid var(--primary)", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                        + Assignment
                      </button>
                      <button onClick={() => setUploadModal(true)} style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                        + Material
                      </button>
                    </div>
                  </div>
                )}

                {/* Student full-page assignment view */}
                {assignPage && !isTeacher ? (
                  <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 120px)", margin: "-8px -8px 0", padding: "0" }}>
                    {/* Top bar */}
                    <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", background: "#1a73e8", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon name="note" size={18} alt="" style={{ filter: "brightness(0) invert(1)" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)" }}>{assignPage.title}</div>
                        <button onClick={() => { setAssignPage(null); setAssignPageDetail(null); setEditing(false); setAiCheck(null); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "12px", padding: 0, display: "flex", alignItems: "center", gap: "4px" }}>
                          ← {classInfo?.name}
                        </button>
                      </div>
                    </div>

                    {/* Two-column body */}
                    <div style={{ display: "flex", gap: "20px", padding: "24px", maxWidth: "1100px", margin: "0 auto", alignItems: "flex-start" }}>

                      {/* LEFT — main content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Assignment header */}
                        <div style={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--border)", padding: "24px 28px", marginBottom: "16px" }}>
                          <div style={{ fontSize: "22px", fontWeight: 400, color: "var(--text)", marginBottom: "8px" }}>{assignPage.title}</div>
                          <div style={{ display: "flex", gap: "16px", alignItems: "center", fontSize: "13px", color: "var(--text-muted)", marginBottom: "4px" }}>
                            <span>{classInfo?.name}</span>
                            <span>·</span>
                            <span>{assignPage.due_date ? `Due ${formatDate(assignPage.due_date)}` : "No due date"}</span>
                            <span>·</span>
                            <span>{assignPage.points ? `${assignPage.points} points` : "Not graded"}</span>
                          </div>
                          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />
                          {assignPage.instructions ? (
                            <div style={{ fontSize: "14px", color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{assignPage.instructions}</div>
                          ) : (
                            <div style={{ fontSize: "14px", color: "var(--text-faint)" }}>No instructions provided.</div>
                          )}

                          {/* Teacher files */}
                          {(assignPageDetail?.files || assignPage.files)?.length > 0 && (
                            <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                              {(assignPageDetail?.files || assignPage.files).map(f => (
                                <a key={f.id} href={`http://localhost:5001/uploads/${f.file_path}`} target="_blank" rel="noreferrer"
                                  style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", textDecoration: "none", minWidth: "200px" }}>
                                  <div style={{ width: "36px", height: "36px", background: "#4285f4", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <Icon name="file" size={18} alt="" style={{ filter: "brightness(0) invert(1)" }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>PDF</div>
                                  </div>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Class comments */}
                        <div style={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--border)", padding: "20px 24px" }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text)", marginBottom: "14px" }}>Class comments</div>
                          {comments.length === 0
                            ? <div style={{ fontSize: "13px", color: "var(--text-faint)" }}>No class comments yet.</div>
                            : comments.map(c => (
                              <div key={c.id} style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
                                <div style={{ width: "32px", height: "32px", background: "var(--primary)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                                  {c.author_name?.[0]?.toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{c.author_name}</div>
                                  <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
                                    <CommentContent comment={c} isMine={c.author_id === myId}
                                      onUpdate={updated => setComments(prev => prev.map(x => x.id === c.id ? updated : x))}
                                      onDelete={() => setComments(prev => prev.filter(x => x.id !== c.id))} />
                                  </div>
                                </div>
                              </div>
                            ))
                          }
                          <div style={{ display: "flex", gap: "10px", marginTop: "12px", alignItems: "center" }}>
                            <div style={{ width: "32px", height: "32px", background: "var(--primary)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                              {members.find(m => !m.is_teacher)?.name?.[0]?.toUpperCase() || "S"}
                            </div>
                            <input placeholder="Add class comment..." value={commentInput} onChange={e => setCommentInput(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && sendComment(assignPage.id)}
                              style={{ flex: 1, border: "none", borderBottom: "1px solid var(--border)", outline: "none", fontSize: "14px", padding: "6px 0", color: "var(--text)", background: "transparent" }} />
                            <button onClick={() => sendComment(assignPage.id)} disabled={commentSending || !commentInput.trim()}
                              style={{ background: "none", border: "none", cursor: commentInput.trim() ? "pointer" : "default", padding: "4px", opacity: commentInput.trim() ? 1 : 0.4 }}>
                              <Icon name="sent" size={20} alt="Send" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* RIGHT — Your work panel */}
                      <div style={{ width: "300px", flexShrink: 0, position: "sticky", top: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                        {(() => {
                          const sub = assignPage.my_submission || assignPageDetail?.my_submission;
                          const pastDue = assignPage.due_date && new Date() > new Date(assignPage.due_date);
                          const canEdit = !pastDue || !sub;

                          const statusLabel = (() => {
                            if (!sub) return { text: "Assigned", color: "#1a73e8", bg: "rgba(26,115,232,0.12)" };
                            if (sub.status === "graded") return { text: "Graded", color: "#10b981", bg: "rgba(16,185,129,0.12)" };
                            if (sub.status === "returned") return { text: "Returned", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
                            if (sub.status === "late") return { text: "Late", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
                            return { text: "Turned in", color: "#10b981", bg: "rgba(16,185,129,0.12)" };
                          })();

                          return (
                            <>
                              {/* Your work card */}
                              <div style={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--border)", overflow: "hidden" }}>
                                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Your work</span>
                                  <span style={{ fontSize: "12px", fontWeight: 600, color: statusLabel.color, background: statusLabel.bg, padding: "3px 10px", borderRadius: "12px" }}>{statusLabel.text}</span>
                                </div>

                                <div style={{ padding: "16px 18px" }}>
                                  {/* Graded display */}
                                  {sub?.status === "graded" && (
                                    <div style={{ textAlign: "center", marginBottom: "16px", padding: "12px", background: "rgba(16,185,129,0.10)", borderRadius: "8px" }}>
                                      <div style={{ fontSize: "28px", fontWeight: 700, color: "#10b981" }}>{sub.grade}<span style={{ fontSize: "14px", color: "var(--text-muted)" }}>/{assignPage.points}</span></div>
                                      {sub.grade_comment && <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px", fontStyle: "italic" }}>"{sub.grade_comment}"</div>}
                                    </div>
                                  )}

                                  {/* Submitted file */}
                                  {sub && !editing && (
                                    <div style={{ marginBottom: "12px" }}>
                                      {sub.content && (
                                        <div style={{ background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", marginBottom: "8px", fontSize: "13px", color: "var(--text)" }}>
                                          {sub.content}
                                        </div>
                                      )}
                                      {(sub.submission_files?.length > 0 ? sub.submission_files : sub.file_path ? [{ file_name: "Attached file", file_path: sub.file_path }] : []).map((f, i) => (
                                        <a key={i} href={`http://localhost:5001/uploads/${f.file_path}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", textDecoration: "none", marginBottom: i < (sub.submission_files?.length || 1) - 1 ? "6px" : "0" }}>
                                          <Icon name="attach" size={18} alt="" />
                                          <span style={{ fontSize: "13px", color: "#1a73e8", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name}</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}

                                  {/* Form when editing or not yet submitted */}
                                  {(editing || (!sub && canEdit)) && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
                                      <textarea
                                        value={submitContent}
                                        onChange={e => { setSubmitContent(e.target.value); setAiCheck(null); }}
                                        placeholder="Write your answer here..."
                                        style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", resize: "vertical", minHeight: "100px", outline: "none", boxSizing: "border-box", color: "var(--text)", background: "var(--surface-alt)", fontFamily: "inherit" }}
                                      />
                                      <label style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", cursor: "pointer" }}>
                                        <Icon name="attach" size={16} alt="" />
                                        <span style={{ fontSize: "13px", color: "#1a73e8", fontWeight: 500 }}>Attach files</span>
                                        <input type="file" multiple ref={submitFileRef} onChange={e => setSubmitFiles(prev => [...prev, ...Array.from(e.target.files)])} style={{ display: "none" }} />
                                      </label>
                                      {submitFiles.length > 0 && (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                          {submitFiles.map((f, i) => (
                                            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 12px" }}>
                                              <Icon name="attach" size={14} alt="" />
                                              <span style={{ fontSize: "12px", color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                              <button onClick={() => setSubmitFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", padding: "0 2px", fontSize: "14px", lineHeight: 1 }}>×</button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Past due + no submission */}
                                  {!canEdit && !sub && (
                                    <div style={{ fontSize: "13px", color: "var(--text-faint)", marginBottom: "12px", textAlign: "center" }}>Submission period expired.</div>
                                  )}

                                  {/* AI check */}
                                  {(editing || (!sub && canEdit)) && (
                                    <div style={{ marginBottom: "10px" }}>
                                      <button onClick={checkWithAI} disabled={aiCheck?.loading}
                                        style={{ width: "100%", background: "linear-gradient(135deg,var(--primary),var(--primary-light))", color: "#fff", border: "none", borderRadius: "8px", padding: "9px", fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: aiCheck?.loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                                        <Icon name="bot" size={16} alt="" style={{ filter: "brightness(0) invert(1)" }} />
                                        {aiCheck?.loading ? "Checking..." : "Check with AI"}
                                      </button>
                                      {aiCheck?.result && (
                                        <div style={{ marginTop: "8px", borderRadius: "8px", overflow: "hidden", border: `2px solid ${aiCheck.result.isComplete ? "#22c55e" : "#f59e0b"}` }}>
                                          <div style={{ background: aiCheck.result.isComplete ? "#22c55e" : "#f59e0b", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                                            <Icon name={aiCheck.result.isComplete ? "checkmark" : "error"} size={16} alt="" style={{ filter: "brightness(0) invert(1)" }} />
                                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>
                                              {aiCheck.result.isComplete ? "Ready to submit" : "Incomplete"}
                                              {aiCheck.result.score != null && ` · ${aiCheck.result.score}%`}
                                            </div>
                                          </div>
                                          {aiCheck.result.missing?.length > 0 && (
                                            <div style={{ background: "rgba(245,158,11,0.08)", padding: "8px 12px" }}>
                                              {aiCheck.result.missing.map((m, i) => <div key={i} style={{ fontSize: "12px", color: "#f59e0b" }}>• {m}</div>)}
                                            </div>
                                          )}
                                          <div style={{ background: "var(--surface-alt)", padding: "8px 12px" }}>
                                            <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>{aiCheck.result.feedback}</div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Action buttons */}
                                  {sub && !editing && sub.status !== "graded" && canEdit && (
                                    <button onClick={() => { setEditing(true); setSubmitContent(sub.content || ""); setAiCheck(null); }}
                                      style={{ width: "100%", background: "var(--surface)", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "20px", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", marginBottom: "8px" }}>
                                      Unsubmit
                                    </button>
                                  )}
                                  {editing && (
                                    <button onClick={() => setEditing(false)}
                                      style={{ width: "100%", background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "20px", padding: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", marginBottom: "8px" }}>
                                      Cancel
                                    </button>
                                  )}
                                  {(editing || (!sub && canEdit)) && (
                                    <button onClick={submitAssignment} disabled={submitting || (!submitContent.trim() && submitFiles.length === 0)}
                                      style={{ width: "100%", background: submitting || (!submitContent.trim() && submitFiles.length === 0) ? "var(--border)" : "var(--primary)", color: "#fff", border: "none", borderRadius: "20px", padding: "10px", fontSize: "13px", fontWeight: 700, cursor: submitting || (!submitContent.trim() && submitFiles.length === 0) ? "not-allowed" : "pointer" }}>
                                      {submitting ? "Turning in..." : editing ? "Save" : "Turn in"}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Private comments */}
                              <div style={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--border)", padding: "16px 18px" }}>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "12px" }}>Private comments</div>
                                {comments.length === 0
                                  ? <div style={{ fontSize: "13px", color: "var(--text-faint)", marginBottom: "10px" }}>No private comments.</div>
                                  : comments.map(c => (
                                    <div key={c.id} style={{ marginBottom: "10px" }}>
                                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{c.author_name}</div>
                                      <div style={{ fontSize: "13px", color: "var(--text)", marginTop: "2px" }}>
                                        <CommentContent comment={c} isMine={c.author_id === myId}
                                          onUpdate={updated => setComments(prev => prev.map(x => x.id === c.id ? updated : x))}
                                          onDelete={() => setComments(prev => prev.filter(x => x.id !== c.id))} />
                                      </div>
                                    </div>
                                  ))
                                }
                                <div style={{ display: "flex", gap: "8px", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
                                  <input placeholder={`Add private comment to teacher...`} value={commentInput} onChange={e => setCommentInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && sendComment(assignPage.id)}
                                    style={{ flex: 1, border: "none", borderBottom: "1px solid var(--border)", outline: "none", fontSize: "13px", padding: "4px 0", color: "var(--text)", background: "transparent" }} />
                                  <button onClick={() => sendComment(assignPage.id)} disabled={commentSending || !commentInput.trim()}
                                    style={{ background: "none", border: "none", cursor: commentInput.trim() ? "pointer" : "default", opacity: commentInput.trim() ? 1 : 0.4 }}>
                                    <Icon name="sent" size={18} alt="Send" />
                                  </button>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* ── Assignments list (unified classwork) ── */}
                {!assignPage && !selectedMat && (
                <div style={{ marginBottom: "28px" }}>
                  {assignments.length === 0 ? (
                    <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "10px", padding: "24px", textAlign: "center", color: "var(--text-faint)", fontSize: "13px" }}>
                      {isTeacher ? 'Click "+ Assignment" to add one.' : "No assignments yet."}
                    </div>
                  ) : (
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
                      {/* Table header */}
                      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 100px 80px 80px 130px", gap: "0", background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "10px 16px", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        <div>No</div>
                        <div>Title</div>
                        <div style={{ textAlign: "center" }}>Status</div>
                        <div style={{ textAlign: "center" }}>Submit</div>
                        <div style={{ textAlign: "center" }}>Points</div>
                        <div style={{ textAlign: "right" }}>Due Date</div>
                      </div>
                      {(() => {
                        const visible = assignments.filter(a => isTeacher || !a.is_draft);
                        // Group by topic
                        const topics = [...new Set(visible.map(a => a.topic || ""))];
                        return topics.map(topic => (
                          <div key={topic || "__none__"}>
                            {topic && (
                              <div style={{ background: "var(--primary-tint)", padding: "6px 16px", fontSize: "12px", fontWeight: 700, color: "var(--primary)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "6px" }}>
                                <Icon name="opened-folder" size={14} alt="" /> {topic}
                              </div>
                            )}
                            {visible.filter(a => (a.topic || "") === topic).map((a, idx) => {
                              const sub = a.my_submission;
                              const pastDue = a.due_date && new Date() > new Date(a.due_date);
                              const inProgress = !pastDue;
                              const submitted = !!sub;
                              const isUnread = !seenAssignIds.has(a.id);
                              return (
                                <div key={a.id} onClick={() => openAssignment(a)}
                                  style={{ display: "grid", gridTemplateColumns: "32px 1fr 100px 80px 80px 150px", gap: "0", padding: "12px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", alignItems: "center", transition: "background 0.1s", background: isUnread ? "var(--primary-tint)" : "transparent" }}
                                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
                                  onMouseLeave={e => e.currentTarget.style.background = isUnread ? "var(--primary-tint)" : "transparent"}
                                >
                                  <div style={{ position: "relative" }}>
                                    <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>{idx + 1}</div>
                                    {isUnread && <span style={{ position: "absolute", top: "-2px", right: "-2px", width: "7px", height: "7px", borderRadius: "50%", background: "#ef4444", display: "block" }} />}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "13px", fontWeight: isUnread ? 700 : 600, color: "var(--text)", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                      {a.title}
                                      {isUnread && !a.is_draft && <span style={{ fontSize: "10px", fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", padding: "1px 6px", borderRadius: "10px" }}>NEW</span>}
                                      {a.is_draft && <span style={{ fontSize: "10px", fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", padding: "1px 6px", borderRadius: "10px" }}>DRAFT</span>}
                                    </div>
                                    {isTeacher && <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{a.turned_in_count || 0} turned in</div>}
                                  </div>
                                  <div style={{ textAlign: "center" }}>
                                    <span style={{ fontSize: "11px", fontWeight: 700, color: inProgress ? "#22c55e" : "var(--text-faint)", background: inProgress ? "rgba(34,197,94,0.12)" : "var(--surface-alt)", padding: "3px 8px", borderRadius: "20px" }}>
                                      {inProgress ? "In Progress" : "Finished"}
                                    </span>
                                  </div>
                                  <div style={{ textAlign: "center", fontSize: "18px" }}>
                                    {isTeacher
                                      ? <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{a.turned_in_count || 0}</span>
                                      : submitted ? <Icon name="checkmark" size={14} alt="Submitted" />
                                      : <span style={{ color: "var(--border)" }}>—</span>}
                                  </div>
                                  <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>{a.points}</div>
                                  <div style={{ textAlign: "right", fontSize: "12px", color: pastDue ? "var(--text-faint)" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px", flexWrap: "wrap" }}>
                                    <span>{a.due_date ? formatDate(a.due_date) : "—"}</span>
                                    {isTeacher && (
                                      <div style={{ display: "flex", gap: "3px" }}>
                                        <button onClick={e => { e.stopPropagation(); setTopicModal({ type: "assignment", id: a.id, current: a.topic || "" }); setTopicInput(a.topic || ""); }} style={{ display: "flex", padding: "2px 6px", background: "var(--surface-alt)", border: "none", borderRadius: "6px", cursor: "pointer" }} title="Set topic"><Icon name="opened-folder" size={12} alt="" /></button>
                                        <button onClick={e => { e.stopPropagation(); openSubmissionStats(a.id); }} style={{ display: "flex", padding: "2px 6px", background: "var(--primary-tint)", border: "none", borderRadius: "6px", cursor: "pointer" }} title="Submission stats"><Icon name="bar-chart" size={12} alt="" /></button>
                                        {a.is_draft && <button onClick={e => { e.stopPropagation(); publishDraft(a.id); }} style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "var(--primary)", border: "none", padding: "2px 8px", borderRadius: "10px", cursor: "pointer" }}>Publish</button>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                )}

                {/* ── Materials section (unified classwork) ── */}
                {!assignPage && (
                <div>
                {selectedMat ? (
                  /* ── Material detail (full page) ── */
                  <div>
                    <button
                      onClick={() => { setSelectedMat(null); setAiModal(null); setAiResult(null); setChatHistory([]); }}
                      style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "var(--text-muted)", fontSize: "13px", fontWeight: 600, cursor: "pointer", padding: "0 0 16px" }}
                    >
                      ← Back to Classwork
                    </button>
                    <div style={{ ...banner, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>{selectedMat.title}</div>
                        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", marginTop: "4px" }}>
                          Week {selectedMat.week || 1} · Posted {formatDate(selectedMat.created_at)}
                        </div>
                      </div>
                      {isTeacher && materialEditId !== selectedMat.id && (
                        <button onClick={openEditMatModal}
                          style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)", color: "#fff", borderRadius: "8px", padding: "5px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                          <Icon name="edit" size={13} alt="" style={{ filter: "brightness(0) invert(1)" }} /> Edit
                        </button>
                      )}
                    </div>
                    {materialEditId === selectedMat.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
                        <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "16px 20px" }}>
                          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Title</label>
                          <input value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", fontSize: "15px", fontWeight: 600, color: "var(--text)", boxSizing: "border-box", background: "var(--surface)" }} />
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-faint)", fontWeight: 600 }}>WEEK</span>
                            <input type="number" min="1" max="20" value={uploadForm.week}
                              onChange={e => setUploadForm(f => ({ ...f, week: e.target.value }))}
                              style={{ width: "56px", border: "1px solid var(--border)", borderRadius: "6px", padding: "4px 8px", fontSize: "13px", fontWeight: 600, color: "var(--primary)", textAlign: "center", outline: "none" }} />
                          </div>
                        </div>

                        <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "16px 20px" }}>
                          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Instructions</label>
                          <textarea value={uploadForm.instructions} onChange={e => setUploadForm(f => ({ ...f, instructions: e.target.value }))}
                            rows={3} placeholder="Add instructions for your students..."
                            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "var(--text)", resize: "vertical", boxSizing: "border-box", background: "var(--surface)", fontFamily: "inherit" }} />
                        </div>

                        <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "16px 20px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "10px" }}>Attach PDF (optional)</span>

                          {/* Existing PDF — show with remove toggle */}
                          {selectedMat?.file_url && !uploadFile && (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: removeMainFile ? "rgba(239,68,68,0.06)" : "var(--primary-tint)", border: `1px solid ${removeMainFile ? "#fca5a5" : "var(--border)"}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "10px", opacity: removeMainFile ? 0.6 : 1 }}>
                              <Icon name="file" size={20} alt="" />
                              <div style={{ flex: 1, textDecoration: removeMainFile ? "line-through" : "none" }}>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{selectedMat.file_name || selectedMat.title}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>Current PDF</div>
                              </div>
                              <button onClick={() => setRemoveMainFile(r => !r)}
                                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "12px", color: removeMainFile ? "#22c55e" : "#ef4444" }}>
                                {removeMainFile ? "↩ Restore" : "× Remove"}
                              </button>
                            </div>
                          )}

                          {/* New file chosen */}
                          {uploadFile ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 14px" }}>
                              <Icon name="file" size={20} alt="" />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{uploadFile.name}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{(uploadFile.size / 1024).toFixed(0)} KB</div>
                              </div>
                              <button onClick={() => { setUploadFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                                style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", display: "flex" }}><Icon name="multiply" size={14} alt="Remove" /></button>
                            </div>
                          ) : (removeMainFile || !selectedMat?.file_url) && (
                            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--border)", borderRadius: "10px", padding: "16px", cursor: "pointer", color: "var(--text-muted)", gap: "8px" }}>
                              <Icon name="attach" size={16} alt="" />
                              <span style={{ fontSize: "13px", fontWeight: 600 }}>{selectedMat?.file_url ? "Attach replacement PDF" : "Click to attach a PDF"}</span>
                              <input type="file" accept="application/pdf" ref={fileRef} onChange={e => {
                                const f = e.target.files[0];
                                if (!f) return;
                                setUploadFile(f);
                              }} style={{ display: "none" }} />
                            </label>
                          )}
                        </div>

                        <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "16px 20px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "10px" }}>Additional attachments (optional)</span>

                          {selectedMat.files?.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                              {selectedMat.files.map(f => (
                                <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: deleteAttachmentIds.includes(f.id) ? "var(--text-faint)" : "var(--text-muted)", background: deleteAttachmentIds.includes(f.id) ? "#fef2f2" : "var(--surface-alt)", padding: "8px 12px", borderRadius: "8px", border: `1px solid ${deleteAttachmentIds.includes(f.id) ? "#fca5a5" : "var(--border)"}`, textDecoration: deleteAttachmentIds.includes(f.id) ? "line-through" : "none" }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name="file" size={14} alt="" /> {f.file_name}</span>
                                  <button type="button" onClick={() => setDeleteAttachmentIds(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "12px", color: deleteAttachmentIds.includes(f.id) ? "#22c55e" : "#ef4444" }}>
                                    {deleteAttachmentIds.includes(f.id) ? "↩ Restore" : "× Remove"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {uploadExtraFiles.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                              {uploadExtraFiles.map((f, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", background: "var(--primary-tint)", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name="attach" size={14} alt="" /> {f.name}</span>
                                  <button type="button" onClick={() => setUploadExtraFiles(prev => prev.filter((_, idx) => idx !== i))}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", display: "flex" }}><Icon name="multiply" size={12} alt="Remove" /></button>
                                </div>
                              ))}
                            </div>
                          )}

                          <input ref={extraFileRef} type="file" multiple style={{ display: "none" }}
                            onChange={e => {
                              const picked = Array.from(e.target.files);
                              setUploadExtraFiles(prev => [...prev, ...picked]);
                              e.target.value = "";
                            }} />
                          <button type="button" onClick={() => extraFileRef.current?.click()}
                            style={{ fontSize: "13px", color: "var(--primary)", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: 600 }}>
                            + Add files
                          </button>
                        </div>

                        {uploadError && (
                          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: "#ef4444", fontSize: "13px" }}>
                            {uploadError}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "10px" }}>
                          <button onClick={handleUpload} disabled={uploading || !uploadForm.title.trim()}
                            style={{ background: uploading || !uploadForm.title.trim() ? "var(--primary-tint)" : "var(--primary)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 20px", fontSize: "13px", fontWeight: 700, cursor: uploading || !uploadForm.title.trim() ? "not-allowed" : "pointer" }}>
                            {uploading ? "Saving..." : "Save Changes"}
                          </button>
                          <button onClick={closeUploadModal}
                            style={{ background: "var(--surface-alt)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                    <>
                    {selectedMat.instructions && (
                      <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "20px" }}>{selectedMat.instructions}</p>
                    )}
                    <div style={{ marginBottom: "10px", fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "1px" }}>
                      Reference Materials
                    </div>
                    {(() => {
                      const hasMain = !!selectedMat.file_url;
                      const hasExtra = selectedMat.files?.length > 0;
                      if (!hasMain && !hasExtra) return <p style={{ fontSize: "13px", color: "var(--text-faint)" }}>No file attached.</p>;

                      const mainExt = hasMain ? (selectedMat.file_url.split(".").pop() || "").toLowerCase() : "";
                      const isPdf = mainExt === "pdf";
                      const isImg = ["png","jpg","jpeg","webp","gif"].includes(mainExt);

                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "10px" }}>
                          {hasMain && (
                            <FileCard
                              name={selectedMat.file_name || selectedMat.title}
                              label={extLabel(mainExt)}
                              onClick={() => navigate(`/classroom/${id}/material/${selectedMat.id}`, { state: { backgroundLocation: location } })}
                              thumbContent={
                                isPdf ? (
                                  <object data={`http://localhost:5001${selectedMat.file_url}`} type="application/pdf" style={{ width: "120px", height: "80px", pointerEvents: "none" }}>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80px", gap: "4px" }}>
                                      <Icon name="file" size={28} alt="" />
                                      <span style={{ fontSize: "10px", color: "var(--text-faint)" }}>PDF</span>
                                    </div>
                                  </object>
                                ) : isImg ? (
                                  <img src={`http://localhost:5001${selectedMat.file_url}`} alt={selectedMat.title} style={{ width: "120px", height: "80px", objectFit: "cover" }} />
                                ) : (
                                  <Icon name="file" size={32} alt="" />
                                )
                              }
                            />
                          )}
                          {hasExtra && selectedMat.files.map(f => {
                            const ext = (f.file_name || "").split(".").pop().toLowerCase();
                            const fIsImg = ["png","jpg","jpeg","webp","gif"].includes(ext);
                            const fIsPdf = ext === "pdf";
                            const fUrl = `http://localhost:5001/uploads/${f.file_path}`;
                            const fIcon = ext === "docx" || ext === "doc" ? "note" : ext === "pptx" || ext === "ppt" ? "bar-chart" : "attach";
                            // A PDF extra attachment can go through the same lesson
                            // viewer (AI chat, translate) as the primary file — other
                            // formats have no in-app renderer, so they stay a plain link.
                            return (
                              <FileCard key={f.id}
                                name={f.file_name}
                                label={extLabel(ext)}
                                {...(fIsPdf
                                  ? { onClick: () => navigate(`/classroom/${id}/material/${selectedMat.id}?file=${f.id}`, { state: { backgroundLocation: location } }) }
                                  : { href: fUrl })}
                                thumbContent={
                                  fIsImg ? (
                                    <img src={fUrl} alt={f.file_name} style={{ width: "120px", height: "80px", objectFit: "cover" }} />
                                  ) : fIsPdf ? (
                                    <object data={fUrl} type="application/pdf" style={{ width: "120px", height: "80px", pointerEvents: "none" }}>
                                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80px", gap: "4px" }}>
                                        <Icon name="file" size={28} alt="" />
                                        <span style={{ fontSize: "10px", color: "var(--text-faint)" }}>PDF</span>
                                      </div>
                                    </object>
                                  ) : (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80px", gap: "4px" }}>
                                      <Icon name={fIcon} size={28} alt="" />
                                      <span style={{ fontSize: "10px", color: "var(--text-faint)" }}>{extLabel(ext)}</span>
                                    </div>
                                  )
                                }
                              />
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* AI suggested YouTube resources */}
                    {selectedMat.ai_resources?.length > 0 && (
                      <div style={{ marginTop: "24px" }}>
                        <div style={{ marginBottom: "10px", fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Icon name="video" size={13} alt="" /> Related YouTube Videos
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {selectedMat.ai_resources.map((r, i) => (
                            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                              style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden", textDecoration: "none" }}>
                              {r.thumbnail ? (
                                <img src={r.thumbnail} alt={r.title}
                                  style={{ width: "120px", height: "68px", objectFit: "cover", flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: "120px", height: "68px", background: "#ff0000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <span style={{ fontSize: "24px" }}>▶</span>
                                </div>
                              )}
                              <div style={{ flex: 1, padding: "8px 12px 8px 0" }}>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.title}</div>
                                {r.channel && <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>{r.channel}</div>}
                              </div>
                              <span style={{ fontSize: "12px", color: "#ff0000", fontWeight: 700, paddingRight: "12px", flexShrink: 0 }}>▶ Watch</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    </>
                    )}

                    {/* ── Assignments for this material ── */}
                    <div style={{ marginTop: "28px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px" }}><Icon name="note" size={13} alt="" /> Assignments</div>
                        {isTeacher && (
                          <button onClick={() => setMatAssignOpen(o => !o)}
                            style={{ fontSize: "12px", fontWeight: 700, color: "var(--primary)", background: "var(--primary-tint)", border: "1px solid var(--primary-tint)", borderRadius: "8px", padding: "4px 12px", cursor: "pointer" }}>
                            + Add Assignment
                          </button>
                        )}
                      </div>

                      {/* Teacher: inline create form — its own component so typing
                          doesn't re-render the whole page (and the PDF thumbnail
                          above, which visibly flickers if it does). */}
                      {isTeacher && matAssignOpen && (
                        <MaterialAssignmentForm classId={id} materialId={selectedMat.id}
                          onCreated={data => {
                            setMatAssignments(prev => [data, ...prev]);
                            setAssignments(prev => [data, ...prev]);
                            setMatAssignOpen(false);
                          }}
                          onCancel={() => setMatAssignOpen(false)} />
                      )}

                      {/* Assignment list */}
                      {matAssignments.length === 0 ? (
                        <div style={{ fontSize: "12px", color: "var(--text-faint)", padding: "10px 0" }}>
                          {isTeacher ? "No assignments yet for this lesson. Add one above." : "No assignments for this lesson yet."}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {matAssignments.map(a => {
                            const submitted = !isTeacher && a.my_submission;
                            return (
                              <div key={a.id}
                                onClick={() => openAssignment(a)}
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 16px", cursor: "pointer", transition: "box-shadow 0.15s" }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                                <div>
                                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{a.title}</div>
                                  <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "2px" }}>
                                    {a.due_date ? `Due ${formatDate(a.due_date)}` : "No due date"} · {a.points} pts
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                  {isTeacher ? (
                                    <span style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>{a.turned_in_count || 0} turned in</span>
                                  ) : submitted ? (
                                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,0.12)", padding: "2px 8px", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "4px" }}><Icon name="checkmark" size={11} alt="" /> Submitted</span>
                                  ) : (
                                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#f97316", background: "rgba(249,115,22,0.12)", padding: "2px 8px", borderRadius: "10px" }}>Pending</span>
                                  )}
                                  <span style={{ fontSize: "16px", color: "var(--text-faint)" }}>›</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* ── Private comments about this lesson ── */}
                    <div style={{ marginTop: "28px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}><Icon name="chat" size={13} alt="" /> Private Comments</div>
                      <PrivateCommentsPanel materialId={selectedMat.id} isTeacher={isTeacher} myId={myId}
                        containerStyle={isTeacher
                          ? { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "4px 16px" }
                          : { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "16px" }} />
                    </div>

                  </div>
                ) : (
                  /* ── Material list ── */
                  <>
                    {/* Hint: select a material to use AI */}
                    {aiHint && (
                      <div style={{ background: "var(--primary-tint)", border: "2px solid var(--primary)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                        <Icon name="hand-cursor" size={20} alt="" />
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--primary)" }}>Select a material below</div>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Click any material to activate AI Study Mentor</div>
                        </div>
                        <button onClick={() => setAiHint(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "16px" }}>×</button>
                      </div>
                    )}

                    {materials.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-faint)" }}>
                        {isTeacher ? 'Click "+ Material" to add your first material.' : "No materials posted yet."}
                      </div>
                    ) : (
                      Object.entries(weekGroups).sort((a, b) => Number(a[0]) - Number(b[0])).map(([week, mats]) => (
                        <div key={week}>
                          <div style={{ ...weekLabel, display: "flex", alignItems: "center", gap: "6px" }}><Icon name="book" size={14} alt="" /> Week {week}</div>
                          {mats.map(mat => (
                            <div key={mat.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", marginBottom: "10px", overflow: "hidden", position: "relative" }}>
                              {/* Material row — click to open detail */}
                              <div
                                onContextMenu={isTeacher ? e => { e.preventDefault(); setMatMenu({ id: mat.id, x: Math.min(e.clientX, window.innerWidth - 184), y: e.clientY }); } : undefined}
                                onClick={async () => {
                                  setSelectedMat(mat);
                                  markMatSeen(mat.id);
                                  setMatAssignments([]);
                                  loadMatAssignments(mat.id);
                                  setAiResult(null); setChatHistory([]);
                                  if (aiHint) {
                                    const action = aiHint;
                                    setAiHint(false);
                                    setAiModal(action);
                                    if (action !== "chat") {
                                      setAiLoading(true);
                                      try {
                                        const { data } = await API.post(`/classroom/materials/${mat.id}/ai`, { action, lang });
                                        setAiResult(data.data);
                                      } catch {
                                        setAiResult({ error: "AI unavailable. Check GROQ_API_KEY in backend .env" });
                                      } finally {
                                        setAiLoading(false);
                                      }
                                    }
                                  }
                                }}
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer", background: !seenMatIds.has(mat.id) ? "var(--primary-tint)" : "transparent" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
                                onMouseLeave={e => e.currentTarget.style.background = !seenMatIds.has(mat.id) ? "var(--primary-tint)" : "transparent"}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                  <div style={{ position: "relative" }}>
                                    <div style={matIcon}><Icon name="file" size={18} alt="" /></div>
                                    {!seenMatIds.has(mat.id) && <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", border: "2px solid var(--surface)", display: "block" }} />}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "14px", fontWeight: !seenMatIds.has(mat.id) ? 700 : 600, color: "var(--text)", display: "flex", alignItems: "center", gap: "6px" }}>
                                      {mat.title}
                                      {!seenMatIds.has(mat.id) && <span style={{ fontSize: "10px", fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.10)", padding: "1px 6px", borderRadius: "10px" }}>NEW</span>}
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Posted {formatDate(mat.created_at)}</div>
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  {mat.topic && <span style={{ fontSize: "11px", background: "var(--primary-tint)", color: "var(--primary)", padding: "2px 8px", borderRadius: "10px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}><Icon name="opened-folder" size={11} alt="" /> {mat.topic}</span>}
                                  {isTeacher && (
                                    <button onClick={e => { e.stopPropagation(); setTopicModal({ type: "material", id: mat.id, current: mat.topic || "" }); setTopicInput(mat.topic || ""); }}
                                      style={{ fontSize: "11px", padding: "2px 7px", background: "var(--surface-alt)", color: "var(--text-muted)", border: "none", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                      <Icon name="opened-folder" size={11} alt="" /> Topic
                                    </button>
                                  )}
                                  {isTeacher && (
                                    <button
                                      onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMatMenu({ id: mat.id, x: r.right - 180, y: r.bottom + 4 }); }}
                                      style={{ width: "26px", height: "26px", border: "none", background: "var(--surface-alt)", borderRadius: "6px", cursor: "pointer", fontSize: "14px", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                    >⋮</button>
                                  )}
                                  <button
                                    onClick={e => { e.stopPropagation(); setExpandedMats(prev => { const n = new Set(prev); n.has(mat.id) ? n.delete(mat.id) : n.add(mat.id); return n; }); }}
                                    style={{ width: "26px", height: "26px", border: "none", background: "none", cursor: "pointer", color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", transition: "transform 0.2s", transform: expandedMats.has(mat.id) ? "rotate(90deg)" : "rotate(0deg)" }}
                                  >›</button>
                                </div>
                              </div>
                              {/* Expanded panel — always shown when expanded */}
                              {expandedMats.has(mat.id) && (
                                <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", background: "var(--surface-alt)" }}>
                                  {/* PDF link */}
                                  {mat.file_path && (
                                    <a href={`http://localhost:5001/uploads/${mat.file_path}`} target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--primary)", fontWeight: 600, marginBottom: mat.ai_resources?.length > 0 ? "10px" : "0", textDecoration: "none" }}>
                                      <Icon name="attach" size={12} alt="" /> View PDF
                                    </a>
                                  )}
                                  {/* YouTube videos */}
                                  {mat.ai_resources?.length > 0 ? (
                                    <>
                                      <div style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 700, marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}><Icon name="video" size={12} alt="" /> Related Videos</div>
                                      <div style={{ display: "flex", gap: "8px", overflowX: "auto" }}>
                                        {mat.ai_resources.map((r, i) => (
                                          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{ display: "flex", flexDirection: "column", flexShrink: 0, width: "140px", textDecoration: "none", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
                                            {r.thumbnail ? (
                                              <img src={r.thumbnail} alt={r.title} style={{ width: "140px", height: "79px", objectFit: "cover" }} />
                                            ) : (
                                              <div style={{ width: "140px", height: "79px", background: "#ff0000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <span style={{ fontSize: "20px", color: "#fff" }}>▶</span>
                                              </div>
                                            )}
                                            <div style={{ padding: "4px 6px", background: "var(--surface)" }}>
                                              <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text)", lineHeight: "1.3", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.title}</div>
                                            </div>
                                          </a>
                                        ))}
                                      </div>
                                    </>
                                  ) : (
                                    !mat.file_path && (
                                      <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>No related videos.</div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                    {isTeacher && (
                      <button onClick={() => setUploadModal(true)} style={fab}>+</button>
                    )}
                  </>
                )}
              </div>
              )}
            </div>

            {/* Right: AI Study Mentor panel — students only */}
            {selectedMat && !isTeacher && (
              <div style={aiMentorPanel}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                  <div style={aiAvatarStyle}><Icon name="bot" size={20} alt="" /></div>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>AI Study Mentor</div>
                    <div style={{ fontSize: "12px", color: "#22c55e", fontWeight: 600 }}>● ACTIVE NOW</div>
                  </div>
                  <button onClick={() => setSelectedMat(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "18px" }}>×</button>
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", letterSpacing: "1px", margin: "16px 0 10px", textTransform: "uppercase" }}>
                  Recommended Tools
                </div>

                {/* 4 Feature Cards */}
                {[
                  { key: "highlights", icon: "edit", title: "Smart Highlighting", desc: "Automatically identify key formulas and concepts in today's notes." },
                  { key: "summary",    icon: "clipboard", title: "Auto-Summary",       desc: "Generate a 5-bullet summary of this material." },
                  { key: "quiz",       icon: "question-mark", title: "Practice Quiz",      desc: "3-question flash quiz based on this material." },
                  { key: "chat",       icon: "chat", title: "Level_Up Chat",      desc: "Ask questions at your own pace with AI powered answers." },
                  ...(tutorConfig?.enabled ? [{ key: "tutor", icon: "bot", title: "🎓 AI Tutor", desc: "Hint-only mode — teacher configured. AI guides you with clues, never gives direct answers." }] : []),
                ].map(f => (
                  <div
                    key={f.key}
                    onClick={() => openAI(f.key)}
                    style={{ ...aiFeatureCard, border: aiModal === f.key ? "2px solid var(--primary)" : "1px solid var(--border)", background: aiModal === f.key ? "var(--primary-tint)" : "var(--surface)" }}
                  >
                    <div style={{ marginBottom: "6px" }}><Icon name={f.icon} size={22} alt="" /></div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>{f.title}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* ── GRADES TAB ── */}
          {activeTab === "grades" && (
            <div>
              {gradesLoading ? (
                <div style={{ textAlign: "center", padding: "60px", color: "var(--text-faint)" }}>Loading grades...</div>
              ) : !gradesData ? (
                <div style={{ textAlign: "center", padding: "60px", color: "var(--text-faint)" }}>No grade data yet.</div>
              ) : gradesData.role === "student" ? (
                /* ── Student Grades View ── */
                (() => {
                  const pct = gradesData.percentage;
                  const letterGrade = pct === null ? "—" : pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";
                  return (
                    <div style={{ maxWidth: "700px" }}>
                      <div style={{ display: "flex", gap: "14px" }}>
                        {/* Left card — overall grade */}
                        <div style={{ width: "150px", flexShrink: 0, background: "linear-gradient(150deg,var(--primary),var(--primary-light))", borderRadius: "14px", padding: "18px 14px", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "2px" }}>
                          <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{pct !== null ? `${pct}%` : "—"}</div>
                          <div style={{ fontSize: "10px", opacity: 0.8, marginBottom: "10px" }}>Overall grade</div>
                          <div style={{ fontSize: "32px", fontWeight: 900, background: "rgba(255,255,255,0.18)", borderRadius: "10px", padding: "4px 16px", lineHeight: 1.2 }}>{letterGrade}</div>
                          <div style={{ fontSize: "10px", opacity: 0.7, marginTop: "8px" }}>{gradesData.totalEarned}/{gradesData.totalPossible} pts</div>
                        </div>

                        {/* Right — assignment rows */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                          {gradesData.rows.length === 0 ? (
                            <p style={{ color: "var(--text-faint)", textAlign: "center", padding: "24px" }}>No assignments yet.</p>
                          ) : gradesData.rows.map(row => {
                            const rPct = row.grade !== null ? Math.round((row.grade / row.points) * 100) : null;
                            const pillLetter = rPct === null ? null : rPct >= 90 ? "A" : rPct >= 80 ? "B" : rPct >= 70 ? "C" : rPct >= 60 ? "D" : "F";
                            const pillStyle = rPct !== null
                              ? (rPct >= 75 ? { bg: "#DCFCE7", text: "#16A34A" } : rPct >= 50 ? { bg: "#FEF9C3", text: "#D97706" } : { bg: "#FEE2E2", text: "#DC2626" })
                              : row.status === "turned_in" ? { bg: "var(--primary-tint)", text: "var(--primary)" }
                              : row.status === "late" ? { bg: "#FEF9C3", text: "#D97706" }
                              : { bg: "#F1F5F9", text: "#64748B" };
                            const pillText = rPct !== null
                              ? `${pillLetter} · ${rPct}%`
                              : row.status === "turned_in" ? "Submitted"
                              : row.status === "late" ? "Late"
                              : "Pending";
                            return (
                              <div key={row.assignment_id} style={{ background: "#F8FAFC", border: "1px solid var(--border)", borderRadius: "10px", padding: "9px 13px", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.title}</div>
                                  {row.due_date && <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "2px" }}>Due {formatDate(row.due_date)}</div>}
                                </div>
                                <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", background: pillStyle.bg, color: pillStyle.text, flexShrink: 0 }}>
                                  {pillText}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* ── Teacher Grade Book View ── */
                <div>
                  {/* Class average banner */}
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px 28px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "22px", boxShadow: "0 4px 20px rgba(15,23,42,0.06)" }}>
                    <div style={{
                      width: "60px", height: "60px", borderRadius: "50%", flexShrink: 0, padding: "5px", boxSizing: "border-box",
                      background: gradesData.classAvg !== null
                        ? `conic-gradient(var(--primary) ${gradesData.classAvg}%, var(--border) ${gradesData.classAvg}% 100%)`
                        : "var(--border)",
                    }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800, color: "var(--text)" }}>
                        {gradesData.classAvg !== null ? `${gradesData.classAvg}%` : "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>Class Average</div>
                    </div>
                    <div style={{ width: "1px", height: "40px", background: "var(--border)" }} />
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "2px" }}>Students</div>
                      <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--text)" }}>{gradesData.rows.length}</div>
                    </div>
                    <div style={{ width: "1px", height: "40px", background: "var(--border)" }} />
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "2px" }}>Assignments</div>
                      <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--text)" }}>{gradesData.assignments.length}</div>
                    </div>
                  </div>

                  {gradesData.rows.length === 0 ? (
                    <p style={{ color: "var(--text-faint)", textAlign: "center", padding: "32px" }}>No students enrolled yet.</p>
                  ) : (
                    <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)" }}>
                      <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%", minWidth: `${200 + gradesData.rows.length * 100}px` }}>
                        <thead>
                          <tr style={{ background: "var(--bg)" }}>
                            {/* Sticky assignment column */}
                            <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", borderRight: "2px solid var(--border)", width: "200px", position: "sticky", left: 0, background: "var(--bg)", zIndex: 2 }}>
                              Assignment
                            </th>
                            {gradesData.rows.map(row => (
                              <th key={row.student_id} style={{ padding: "10px 8px", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", minWidth: "90px" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                                    {row.name[0].toUpperCase()}
                                  </div>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80px", display: "block" }}>{row.name}</span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gradesData.assignments.map((a, i) => (
                            <tr key={a.id} style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--surface-alt)" }}>
                              {/* Sticky assignment name */}
                              <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--surface-alt)", borderRight: "2px solid var(--border)", position: "sticky", left: 0, background: i % 2 === 0 ? "var(--surface)" : "var(--surface-alt)", zIndex: 1 }}>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "2px" }}>{a.title}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{a.points} pts{a.due_date ? ` · Due ${new Date(a.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>
                              </td>
                              {gradesData.rows.map(row => {
                                const g = row.grades.find(g => g.assignment_id === a.id);
                                const pct = g?.grade !== null && g?.grade !== undefined ? Math.round((g.grade / a.points) * 100) : null;
                                // Same semantic colors as the student view, tinted at 15% alpha for the
                                // cell background so both light and dark surfaces stay legible underneath.
                                const col = !g || g.grade === null ? "var(--text-faint)" : pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
                                const bg = !g || g.grade === null ? "transparent" : col + "15";
                                return (
                                  <td key={row.student_id} style={{ padding: "12px 8px", textAlign: "center", borderBottom: "1px solid var(--surface-alt)", background: bg }}>
                                    {g?.grade !== null && g?.grade !== undefined ? (
                                      <div>
                                        <div style={{ fontSize: "14px", fontWeight: 700, color: col }}>{g.grade}<span style={{ fontSize: "10px", color: col, opacity: 0.6 }}>/{a.points}</span></div>
                                        <div style={{ fontSize: "10px", color: col, opacity: 0.8 }}>{pct}%</div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: "15px", color: g?.status === "turned_in" || g?.status === "late" ? "var(--primary)" : "var(--border)" }}>
                                        {g?.status === "turned_in" ? "✓" : g?.status === "late" ? "⏰" : "—"}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {/* Overall row */}
                          <tr style={{ background: "var(--primary-tint)", borderTop: "2px solid var(--border)" }}>
                            <td style={{ padding: "12px 16px", borderRight: "2px solid var(--border)", position: "sticky", left: 0, background: "var(--primary-tint)", zIndex: 1 }}>
                              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--primary)" }}>Overall</span>
                            </td>
                            {gradesData.rows.map(row => (
                              <td key={row.student_id} style={{ padding: "12px 8px", textAlign: "center" }}>
                                {row.percentage !== null ? (
                                  <span style={{ fontSize: "14px", fontWeight: 800, color: row.percentage >= 75 ? "#22c55e" : row.percentage >= 50 ? "#f59e0b" : "#ef4444" }}>
                                    {row.percentage}%
                                  </span>
                                ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ATTENDANCE TAB ── */}
          {activeTab === "attendance" && (
            <div>
              {/* Attendance section */}
              {attendanceLoading ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--text-faint)" }}>Loading...</div>
              ) : isTeacher ? (
                (() => {
                  const sessionByDate = {};
                  (attendanceSessions || []).forEach(s => {
                    const d = s.session_date?.slice(0, 10);
                    if (d) sessionByDate[d] = s;
                  });
                  const firstDay = new Date(calYear, calMonth, 1).getDay();
                  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  const todayStr = today.toISOString().slice(0, 10);
                  const selectedSession = calSelectedDate ? sessionByDate[calSelectedDate] : null;
                  const totalSessions = (attendanceSessions || []).length;
                  const totalPresent = (attendanceSessions || []).reduce((a, s) => a + (Number(s.present) || 0), 0);
                  const totalStudents = (attendanceSessions || []).reduce((a, s) => a + (Number(s.total) || 0), 0);
                  const avgRate = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : null;
                  const pendingCount = (attendanceSessions || []).filter(s => !s.total || Number(s.total) === 0).length;
                  return (
                    <div>
                      {/* Leave Requests section */}
                      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px 20px", marginBottom: "20px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                          <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text)" }}>
                            {tr({ en: "Leave Requests", my: "ကြိုတင်ခွင့်တောင်းချက်များ", ko: "휴가 신청", vi: "Đơn xin nghỉ" })}
                            {leaveRequests.filter(r => r.status === "pending").length > 0 && (
                              <span style={{ marginLeft: "8px", background: "rgba(245,158,11,0.12)", color: "#f59e0b", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>
                                {leaveRequests.filter(r => r.status === "pending").length} {tr({ en: "pending", my: "ဆိုင်းငံ့", ko: "대기 중", vi: "đang chờ" })}
                              </span>
                            )}
                          </div>
                        </div>
                        {leaveRequests.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-faint)", fontSize: "12.5px" }}>
                            {tr({ en: "No leave requests yet", my: "ကြိုတင်ခွင့်တောင်းချက် မရှိသေးပါ", ko: "아직 휴가 신청이 없습니다", vi: "Chưa có đơn xin nghỉ nào" })}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {leaveRequests.map((req, i) => {
                              const icons = { medical: "🩺", family: "👪", travel: "✈️", other: "📝" };
                              const reasonLabels = { medical: tr({ en: "Medical", my: "ကျန်းမာရေး", ko: "병가", vi: "Lý do sức khỏe" }), family: tr({ en: "Family", my: "မိသားစု", ko: "가족", vi: "Gia đình" }), travel: tr({ en: "Travel", my: "ခရီးသွား", ko: "여행", vi: "Đi lại" }), other: tr({ en: "Other", my: "အခြား", ko: "기타", vi: "Khác" }) };
                              const fromD = req.from_date?.slice(0,10);
                              const toD = req.to_date?.slice(0,10);
                              const dateStr = fromD === toD
                                ? new Date(fromD + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                : `${new Date(fromD + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(toD + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
                              return (
                                <div key={req.id} onClick={() => setLeaveDetailModal(req)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: i < leaveRequests.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", borderRadius: "8px" }}
                                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface-alt)"}
                                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                  <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--primary-tint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 }}>{icons[req.reason_type] || "📝"}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)" }}>{req.student_name || "Student"}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "1px" }}>{reasonLabels[req.reason_type] || req.reason_type} · {dateStr}</div>
                                    {req.details && <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.details}</div>}
                                  </div>
                                  {req.status === "pending" ? (
                                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", flexShrink: 0, background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                                      {tr({ en: "Pending", my: "ဆိုင်းငံ့", ko: "대기 중", vi: "Đang chờ" })}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", flexShrink: 0, background: req.status === "approved" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)", color: req.status === "approved" ? "#22c55e" : "#ef4444" }}>
                                      {req.status === "approved" ? (tr({ en: "Approved", my: "အတည်ပြုပြီး", ko: "승인됨", vi: "Đã duyệt" })) : (tr({ en: "Rejected", my: "ငြင်းပယ်ပြီး", ko: "거절됨", vi: "Đã từ chối" }))}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Stats row */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px", marginBottom: "24px" }}>
                        {[
                          { num: totalSessions, lbl: tr({ en: "Total Sessions", my: "စုစုပေါင်း Session", ko: "전체 세션 수", vi: "Tổng số buổi học" }) },
                          { num: avgRate !== null ? avgRate + "%" : "—", lbl: tr({ en: "Avg Attendance", my: "ပျမ်းမျှ တက်ရောက်မှု", ko: "평균 출석률", vi: "Tỷ lệ tham dự trung bình" }), color: avgRate !== null ? (avgRate >= 75 ? "#0F9D6E" : "#E1483F") : undefined },
                          { num: pendingCount, lbl: tr({ en: "Pending", my: "မမှတ်ရသေးသော", ko: "미기록", vi: "Chưa ghi nhận" }), color: pendingCount > 0 ? "#D97706" : undefined },
                        ].map(({ num, lbl, color }) => (
                          <div key={lbl} style={{ background: "var(--primary-tint)", borderRadius: "16px", padding: "16px 18px" }}>
                            <div style={{ fontSize: "22px", fontWeight: 700, color: color || "var(--text)" }}>{num}</div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{lbl}</div>
                          </div>
                        ))}
                      </div>

                      {/* Attendance — Calendar + Right Panel */}
                      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: "16px", alignItems: "start" }}>

                        {/* Left: Mini calendar */}
                        <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)", padding: "14px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <button onClick={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                              style={{ width: "22px", height: "22px", borderRadius: "6px", border: "none", background: "rgba(11,11,30,0.05)", color: "#6B6B85", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text)" }}>{monthLabel}</span>
                            <button onClick={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
                              style={{ width: "22px", height: "22px", borderRadius: "6px", border: "none", background: "rgba(11,11,30,0.05)", color: "#6B6B85", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: "3px" }}>
                            {["S","M","T","W","T","F","S"].map((d, i) => (
                              <div key={i} style={{ textAlign: "center", fontSize: "8.5px", color: "#A6A6BF", fontWeight: 600, padding: "1px 0" }}>{d}</div>
                            ))}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px" }}>
                            {Array.from({ length: firstDay }).map((_, i) => <div key={"e" + i} />)}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const session = sessionByDate[dateStr];
                              const isSelected = calSelectedDate === dateStr;
                              const isToday = dateStr === todayStr;
                              const isWeekend = [0, 6].includes(new Date(calYear, calMonth, day).getDay());
                              const hasSavedRecords = session && Number(session.total) > 0;
                              const cellBg = isSelected ? "var(--primary)"
                                : session ? (hasSavedRecords ? "#22c55e" : "#f59e0b")
                                : isToday ? "var(--primary-tint)" : "transparent";
                              const cellColor = isSelected ? "#fff"
                                : session ? "#fff"
                                : isWeekend ? "#A6A6BF" : "var(--text)";
                              return (
                                <div key={day} onClick={() => {
                                  setCalSelectedDate(dateStr);
                                  if (!session) {
                                    setNewSessionTitle(classInfo?.name ? `${classInfo.name} — ${new Date(dateStr + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : dateStr);
                                  }
                                }} style={{ aspectRatio: "1", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: session ? 700 : 400, cursor: "pointer", background: cellBg, color: cellColor }}>
                                  {day}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: "flex", gap: "10px", marginTop: "12px", fontSize: "9.5px", color: "#6B6B85", flexWrap: "wrap" }}>
                            {[["#22c55e", tr({ en: "Taken", my: "မှတ်ပြီး", ko: "기록됨", vi: "Đã điểm danh" })], ["#f59e0b", tr({ en: "Pending", my: "မမှတ်ရသေး", ko: "미기록", vi: "Chưa ghi nhận" })]].map(([c, label]) => (
                              <span key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: c, display: "inline-block" }} />{label}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Right: All sessions list */}
                        <div style={{ background: "var(--surface)", borderRadius: "18px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: "280px", maxHeight: "520px" }}>

                          {/* Create strip — shown when a blank date is selected */}
                          {calSelectedDate && !selectedSession && (
                            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
                                {new Date(calSelectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
                                <span style={{ fontSize: "11px", fontWeight: 400, color: "#A6A6BF", marginLeft: "8px" }}>
                                  {tr({ en: "· No session yet", my: "· Session မရှိသေး", ko: "· 아직 세션 없음", vi: "· Chưa có buổi học" })}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <input value={newSessionTitle} onChange={e => setNewSessionTitle(e.target.value)}
                                  placeholder={tr({ en: "Session title…", my: "Session ခေါင်းစဉ်…", ko: "세션 제목…", vi: "Tiêu đề buổi học…" })}
                                  onKeyDown={async e => {
                                    if (e.key === "Enter" && newSessionTitle.trim()) {
                                      try {
                                        const { data } = await API.post(`/classroom/classes/${id}/attendance`, { title: newSessionTitle.trim(), session_date: calSelectedDate });
                                        setAttendanceSessions(prev => [data, ...(prev || [])]);
                                        setNewSessionTitle("");
                                      } catch (err) { console.error(err); }
                                    }
                                  }}
                                  style={{ flex: 1, padding: "9px 13px", borderRadius: "10px", border: "1.5px solid var(--border)", fontSize: "13px", color: "var(--text)", background: "var(--bg)", outline: "none", boxSizing: "border-box" }} />
                                <button onClick={async () => {
                                  if (!newSessionTitle.trim()) return;
                                  try {
                                    const { data } = await API.post(`/classroom/classes/${id}/attendance`, { title: newSessionTitle.trim(), session_date: calSelectedDate });
                                    setAttendanceSessions(prev => [data, ...(prev || [])]);
                                    setNewSessionTitle("");
                                  } catch (err) { console.error(err); }
                                }} style={{ padding: "9px 18px", borderRadius: "10px", border: "none", background: "#0B0B1E", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" }}>
                                  {tr({ en: "+ Create", my: "+ ဖန်တီး", ko: "+ 생성", vi: "+ Tạo" })}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Header row */}
                          <div style={{ padding: "14px 18px 8px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "#6B6B85", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              {tr({ en: "All Sessions", my: "Session အားလုံး", ko: "전체 세션", vi: "Tất cả buổi học" })}
                            </span>
                            <span style={{ fontSize: "11px", color: "#A6A6BF" }}>{(attendanceSessions || []).length}</span>
                          </div>

                          {/* Scrollable list — grouped by week */}
                          <div style={{ flex: 1, overflowY: "auto", padding: "2px 10px 12px" }} onClick={() => setSessionMenuOpen(null)}>
                            {(attendanceSessions || []).length === 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "180px", color: "#A6A6BF" }}>
                                <div style={{ fontSize: "26px", marginBottom: "8px" }}>📋</div>
                                <div style={{ fontSize: "13px", fontWeight: 600 }}>{tr({ en: "No sessions yet", my: "Session မရှိသေးပါ", ko: "아직 세션이 없습니다", vi: "Chưa có buổi học nào" })}</div>
                                <div style={{ fontSize: "11px", marginTop: "4px" }}>{tr({ en: "Pick a date on the calendar to create one", my: "Calendar မှ နေ့ရက် ရွေး ဖန်တီးပါ", ko: "캘린더에서 날짜를 선택해 생성하세요", vi: "Chọn ngày trên lịch để tạo buổi học" })}</div>
                              </div>
                            ) : (() => {
                              // Group sessions by ISO week (Mon–Sun)
                              const sorted = [...(attendanceSessions || [])].sort((a, b) => new Date(b.session_date) - new Date(a.session_date));
                              const weeks = {};
                              sorted.forEach(s => {
                                const d = new Date((s.session_date || "").slice(0, 10) + "T00:00:00");
                                const dow = d.getDay() === 0 ? 7 : d.getDay();
                                const mon = new Date(d); mon.setDate(d.getDate() - dow + 1);
                                const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                                const wk = mon.toISOString().slice(0, 10);
                                if (!weeks[wk]) weeks[wk] = { mon, sun, sessions: [] };
                                weeks[wk].sessions.push(s);
                              });
                              return Object.entries(weeks).sort(([a], [b]) => b.localeCompare(a)).map(([wk, { mon, sun, sessions: wSessions }], wi) => {
                                const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                return (
                                  <div key={wk} style={{ marginBottom: "6px" }}>
                                    {/* Week section header */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px 4px" }}>
                                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#A6A6BF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                        {fmt(mon)} – {fmt(sun)}
                                      </span>
                                      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                                      <span style={{ fontSize: "10px", color: "#A6A6BF" }}>{wSessions.length}</span>
                                    </div>

                                    {wSessions.map(s => {
                                      const isHighlighted = calSelectedDate && s.session_date?.slice(0, 10) === calSelectedDate;
                                      const isRenaming = renamingSessionId === s.id;
                                      return (
                                        <div key={s.id} style={{ position: "relative" }}>
                                          {isRenaming ? (
                                            /* Inline rename row */
                                            <div style={{ display: "flex", gap: "6px", padding: "8px 10px", borderRadius: "12px", background: "var(--primary-tint)", border: "1px solid rgba(91,95,233,0.2)", marginBottom: "2px" }}>
                                              <input autoFocus value={renamingTitle} onChange={e => setRenamingTitle(e.target.value)}
                                                onKeyDown={async e => {
                                                  if (e.key === "Enter") {
                                                    if (renamingTitle.trim()) {
                                                      try { await API.patch(`/classroom/attendance/${s.id}`, { title: renamingTitle.trim() }); setAttendanceSessions(prev => prev.map(x => x.id === s.id ? { ...x, title: renamingTitle.trim() } : x)); } catch {}
                                                    }
                                                    setRenamingSessionId(null);
                                                  }
                                                  if (e.key === "Escape") setRenamingSessionId(null);
                                                }}
                                                style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: "13px", fontWeight: 600, color: "var(--text)" }} />
                                              <button onClick={async () => {
                                                if (renamingTitle.trim()) {
                                                  try { await API.patch(`/classroom/attendance/${s.id}`, { title: renamingTitle.trim() }); setAttendanceSessions(prev => prev.map(x => x.id === s.id ? { ...x, title: renamingTitle.trim() } : x)); } catch {}
                                                }
                                                setRenamingSessionId(null);
                                              }} style={{ fontSize: "11px", fontWeight: 700, color: "#5B5FE9", background: "transparent", border: "none", cursor: "pointer", padding: "0 4px" }}>
                                                {tr({ en: "Save", my: "သိမ်း", ko: "저장", vi: "Lưu" })}
                                              </button>
                                              <button onClick={() => setRenamingSessionId(null)} style={{ fontSize: "11px", color: "#A6A6BF", background: "transparent", border: "none", cursor: "pointer", padding: "0 2px" }}>✕</button>
                                            </div>
                                          ) : (
                                            <div onClick={() => openAttendanceSession(s.id, Number(s.total) > 0)}
                                              onContextMenu={isTeacher ? e => { e.preventDefault(); setSessCtxMenu({ id: s.id, x: Math.min(e.clientX, window.innerWidth - 184), y: e.clientY }); } : undefined}
                                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 10px", borderRadius: "12px", cursor: "pointer", transition: "background 0.12s", marginBottom: "2px",
                                                background: isHighlighted ? "var(--primary-tint)" : "transparent",
                                                border: isHighlighted ? "1px solid rgba(91,95,233,0.18)" : "1px solid transparent" }}
                                              onMouseEnter={e => { if (!isHighlighted) e.currentTarget.style.background = "#F7F7FC"; }}
                                              onMouseLeave={e => { e.currentTarget.style.background = isHighlighted ? "var(--primary-tint)" : "transparent"; }}>
                                              <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontSize: "10.5px", color: isHighlighted ? "#5B5FE9" : "#A6A6BF", marginBottom: "2px", fontWeight: isHighlighted ? 700 : 400 }}>
                                                  {s.session_date ? new Date(s.session_date.slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""}
                                                </div>
                                                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                                                <div style={{ fontSize: "11px", color: "#6B6B85", marginTop: "1px" }}>
                                                  {Number(s.total) > 0 ? `${s.present || 0} present · ${s.late || 0} late · ${s.absent || 0} absent` : (tr({ en: "Not yet marked", my: "မှတ်မရသေး", ko: "아직 기록 안 됨", vi: "Chưa điểm danh" }))}
                                                </div>
                                              </div>
                                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: "8px" }}>
                                                <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "999px",
                                                  background: Number(s.total) > 0 ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)",
                                                  color: Number(s.total) > 0 ? "#22c55e" : "#f97316" }}>
                                                  {Number(s.total) > 0 ? (tr({ en: "Taken ✓", my: "မှတ်ပြီး", ko: "기록됨 ✓", vi: "Đã điểm danh ✓" })) : (tr({ en: "Pending", my: "မမှတ်ရသေး", ko: "미기록", vi: "Chưa ghi nhận" }))}
                                                </span>
                                                {/* ⋮ menu button */}
                                                <button onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setSessCtxMenu({ id: s.id, x: r.right - 180, y: r.bottom + 4 }); }}
                                                  style={{ width: "24px", height: "24px", borderRadius: "6px", border: "none", background: "transparent", color: "#A6A6BF", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                  ⋮
                                                </button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Student view */
                <div>
                  {myAttendance && (() => {
                    const dateMap = {};
                    myAttendance.rows.forEach(r => {
                      const d = r.session_date ? r.session_date.slice(0, 10) : null;
                      if (d && !dateMap[d]) dateMap[d] = r.status;
                    });
                    const firstDay = new Date(calStudentYear, calStudentMonth, 1).getDay();
                    const daysInMonth = new Date(calStudentYear, calStudentMonth + 1, 0).getDate();
                    const monthName = new Date(calStudentYear, calStudentMonth, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
                    const dayRows = calStudentSelDate ? myAttendance.rows.filter(r => r.session_date && r.session_date.slice(0, 10) === calStudentSelDate) : [];
                    const recent = myAttendance.rows.slice(0, 6);
                    const rate = myAttendance.rate ?? 0;
                    const r34 = 34, circ = 2 * Math.PI * r34;
                    const filled = (rate / 100) * circ;
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const statusLabel = s => s === "present" ? (tr({ en: "Present", my: "တက်ရောက်", ko: "출석", vi: "Có mặt" })) : s === "late" ? (tr({ en: "Late", my: "နောက်ကျ", ko: "지각", vi: "Đi muộn" })) : s === "absent" ? (tr({ en: "Absent", my: "မတက်", ko: "결석", vi: "Vắng mặt" })) : "—";
                    const statusColor = s => s === "present" ? "#16a34a" : s === "late" ? "#d97706" : s === "absent" ? "#dc2626" : "var(--text-faint)";
                    const statusBg = s => s === "present" ? "rgba(34,197,94,0.15)" : s === "late" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.1)";
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                        {/* Warning banner — only when < 85% */}
                        {myAttendance.rate !== null && myAttendance.rate < 85 && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "14px", padding: "14px 18px" }}>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "#ef4444" }}>⚠ {tr({ en: "Attendance below requirement", my: "တက်ရောက်မှုနှုန်း လိုအပ်ချက်အောက်", ko: "출석률 기준 미달", vi: "Tỷ lệ tham dự dưới yêu cầu" })}</div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>{tr({ en: `Your attendance is at ${rate}%, below the 85% minimum.`, my: `တက်ရောက်မှုနှုန်း ${rate}% ဖြစ်ပြီး 85% လိုအပ်ချက်အောက်ဖြစ်နေသည်။`, ko: `출석률이 ${rate}%로 최소 기준인 85%에 미달합니다.`, vi: `Tỷ lệ tham dự của bạn là ${rate}%, dưới mức tối thiểu 85%.` })}</div>
                            </div>
                            <button style={{ background: "#dc2626", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "9px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", marginLeft: "14px" }}>
                              {tr({ en: "View details", my: "အသေးစိတ်", ko: "자세히 보기", vi: "Xem chi tiết" })}
                            </button>
                          </div>
                        )}

                        {/* Entry card */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--primary-tint)", borderRadius: "14px", padding: "16px 20px" }}>
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>{tr({ en: "Can't make it to class?", my: "ကျောင်းမတက်နိုင်ဘူးလား?", ko: "수업에 못 오시나요?", vi: "Không thể đến lớp?" })}</div>
                            <div style={{ fontSize: "11.5px", color: "var(--text-faint)", marginTop: "2px" }}>{tr({ en: "Let your teacher know in advance and avoid an unexplained absence", my: "ကြိုတင် အကြောင်းကြားပြီး ရှင်းမပြသော ပျက်ကွက်ကို ရှောင်ပါ", ko: "미리 알려서 무단 결석을 피하세요", vi: "Báo trước để tránh vắng mặt không rõ lý do" })}</div>
                          </div>
                          <button onClick={() => { setLeaveModal("form"); setLeaveForm({ from: new Date().toISOString().slice(0,10), to: new Date().toISOString().slice(0,10), reasonType: "medical", details: "", attachment: null }); }}
                            style={{ background: "#0F172A", color: "#fff", border: "none", borderRadius: "9px", padding: "10px 18px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", marginLeft: "16px" }}>
                            {tr({ en: "Request leave", my: "ကြိုတင်တောင်းဆိုမည်", ko: "휴가 신청", vi: "Xin nghỉ" })}
                          </button>
                        </div>

                        {/* Ring card + Stat strip */}
                        <div style={{ display: "flex", gap: "14px" }}>
                          {/* Ring */}
                          <div style={{ width: "200px", flexShrink: 0, background: "linear-gradient(150deg,var(--primary),var(--primary-light))", borderRadius: "16px", padding: "18px 16px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "8px" }}>
                            <svg width="80" height="80" viewBox="0 0 76 76">
                              <circle cx="38" cy="38" r={r34} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="8"/>
                              <circle cx="38" cy="38" r={r34} fill="none" stroke="#fff" strokeWidth="8"
                                strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" transform="rotate(-90 38 38)"/>
                              <text x="38" y="35" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800" fontFamily="Inter,sans-serif">{myAttendance.rate !== null ? `${rate}%` : "—"}</text>
                              <text x="38" y="47" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="7" fontFamily="Inter,sans-serif">OVERALL</text>
                            </svg>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "#fff" }}>
                              {myAttendance.rate === null ? "—" : rate >= 85 ? (tr({ en: "Above 85% requirement", my: "85% လိုအပ်ချက် ပြည့်", ko: "85% 기준 충족", vi: "Đạt yêu cầu trên 85%" })) : (tr({ en: "Below requirement", my: "လိုအပ်ချက်အောက်", ko: "기준 미달", vi: "Dưới yêu cầu" }))}
                            </div>
                          </div>
                          {/* Stat strip */}
                          <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", display: "flex", alignItems: "center" }}>
                            {[
                              { dot: "#16a34a", value: myAttendance.present, label: tr({ en: "Present days", my: "တက်ရောက်", ko: "출석일", vi: "Ngày có mặt" }) },
                              { dot: "#d97706", value: myAttendance.late,    label: tr({ en: "Late days", my: "နောက်ကျ", ko: "지각일", vi: "Ngày đi muộn" })},
                              { dot: "#dc2626", value: myAttendance.absent,  label: tr({ en: "Absent days", my: "မတက်", ko: "결석일", vi: "Ngày vắng mặt" })},
                            ].map((s, i) => (
                              <div key={i} style={{ flex: 1, padding: "18px 20px", display: "flex", alignItems: "center", gap: "12px", borderLeft: i > 0 ? "1px solid var(--border)" : "none" }}>
                                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{s.value}</div>
                                  <div style={{ fontSize: "10.5px", color: "var(--text-faint)", marginTop: "3px" }}>{s.label}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Calendar + History */}
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "14px" }}>
                          {/* Calendar card */}
                          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px 20px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                              <span onClick={() => { if (calStudentMonth === 0) { setCalStudentYear(y => y - 1); setCalStudentMonth(11); } else setCalStudentMonth(m => m - 1); }} style={{ cursor: "pointer", color: "var(--text-faint)", fontSize: "16px", padding: "4px 8px", userSelect: "none" }}>‹</span>
                              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text)" }}>{monthName}</span>
                              <span onClick={() => { if (calStudentMonth === 11) { setCalStudentYear(y => y + 1); setCalStudentMonth(0); } else setCalStudentMonth(m => m + 1); }} style={{ cursor: "pointer", color: "var(--text-faint)", fontSize: "16px", padding: "4px 8px", userSelect: "none" }}>›</span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 36px)", justifyContent: "center", marginBottom: "6px" }}>
                              {["S","M","T","W","T","F","S"].map((d, i) => <span key={i} style={{ fontSize: "10.5px", color: "var(--text-faint)", textAlign: "center" }}>{d}</span>)}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 36px)", gap: "4px", justifyContent: "center" }}>
                              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} style={{ width: "36px", height: "36px" }} />)}
                              {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const ds = `${calStudentYear}-${String(calStudentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                const st = dateMap[ds];
                                const isSel = calStudentSelDate === ds;
                                const isToday = ds === todayStr;
                                return (
                                  <div key={day} onClick={() => st ? setCalStudentSelDate(isSel ? null : ds) : null} style={{
                                    width: "36px", height: "36px", borderRadius: "8px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center",
                                    cursor: st ? "pointer" : "default", fontWeight: st ? 700 : 500,
                                    background: isSel ? "var(--primary)" : st === "present" ? "#22c55e" : st === "late" ? "#f59e0b" : st === "absent" ? "#ef4444" : isToday ? "var(--primary-tint)" : "var(--surface-alt)",
                                    color: (isSel || st) ? "#fff" : isToday ? "var(--primary)" : "var(--text)",
                                    border: isToday && !st && !isSel ? "1.5px solid var(--primary)" : "none",
                                  }}>{day}</div>
                                );
                              })}
                            </div>
                            <div style={{ display: "flex", gap: "16px", marginTop: "14px" }}>
                              {[["#22c55e", tr({ en: "Present", my: "တက်ရောက်", ko: "출석", vi: "Có mặt" })], ["#f59e0b", tr({ en: "Late", my: "နောက်ကျ", ko: "지각", vi: "Đi muộn" })], ["#ef4444", tr({ en: "Absent", my: "မတက်", ko: "결석", vi: "Vắng mặt" })]].map(([c, l], i) => (
                                <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "var(--text)", fontWeight: 500 }}>
                                  <span style={{ width: "13px", height: "13px", borderRadius: "4px", background: c, flexShrink: 0 }} />{l}
                                </span>
                              ))}
                            </div>
                            {/* Day detail popover — inside the calendar card */}
                            {calStudentSelDate && dayRows.length > 0 && (
                              <div style={{ marginTop: "14px", border: "1px solid var(--border)", borderRadius: "12px", padding: "12px 14px", background: "var(--bg)" }}>
                                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>
                                  {new Date(calStudentSelDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                                </div>
                                {dayRows.map((r, i) => (
                                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", padding: "5px 0", borderBottom: i < dayRows.length - 1 ? "1px solid var(--border)" : "none" }}>
                                    <span style={{ color: "var(--text)", fontWeight: 500 }}>{r.title}</span>
                                    <span style={{ fontSize: "9.5px", fontWeight: 700, padding: "2px 9px", borderRadius: "999px", background: statusBg(r.status), color: statusColor(r.status) }}>{statusLabel(r.status)}</span>
                                  </div>
                                ))}
                                <button onClick={() => { const r = dayRows[0]; setDisputeModal({ title: r.title, session_date: calStudentSelDate, status: r.status }); setDisputeForm({ requested: "present", reason: "" }); }}
                                  style={{ marginTop: "8px", background: "none", border: "none", padding: 0, fontSize: "10.5px", fontWeight: 600, color: "var(--primary)", cursor: "pointer" }}>
                                  {tr({ en: "This looks wrong? Request a review →", my: "မမှန်ဘူးလား? ပြင်ဆင်တောင်းဆိုမည် →", ko: "잘못된 것 같나요? 재검토 요청하기 →", vi: "Thấy không đúng? Yêu cầu xem xét lại →" })}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Recent history card */}
                          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px 20px" }}>
                            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>{tr({ en: "Recent history", my: "မကြာမီ မှတ်တမ်းများ", ko: "최근 기록", vi: "Lịch sử gần đây" })}</div>
                            {recent.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", fontSize: "11.5px", color: "var(--text-faint)" }}>{tr({ en: "No sessions yet", my: "session မရှိသေးပါ", ko: "아직 세션이 없습니다", vi: "Chưa có buổi học nào" })}</div>}
                            {recent.map((r, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}
                                onClick={() => { setDisputeModal({ title: r.title, session_date: r.session_date ? r.session_date.slice(0,10) : "", status: r.status }); setDisputeForm({ requested: "present", reason: "" }); }}>
                                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor(r.status), flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: "12.5px", color: "var(--text)", fontWeight: 600 }}>{statusLabel(r.status)}</span>
                                  <span style={{ fontSize: "12.5px", color: "var(--text)" }}> — {r.title}</span>
                                </div>
                                <div style={{ fontSize: "10px", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                  {r.session_date && new Date(r.session_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  <span style={{ color: "var(--primary)", fontWeight: 600 }}>Review</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ── Dispute modal ── */}
                        {disputeModal && (
                          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
                            <div style={{ background: "var(--surface)", borderRadius: "16px", width: "400px", overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,0.2)" }}>
                              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{tr({ en: "Request a review", my: "ပြင်ဆင်တောင်းဆိုမည်", ko: "재검토 요청", vi: "Yêu cầu xem xét lại" })}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "3px" }}>{disputeModal.title}{disputeModal.session_date && ` — ${new Date(disputeModal.session_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`}</div>
                              </div>
                              <div style={{ padding: "16px 20px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(239,68,68,0.08)", borderRadius: "9px", padding: "9px 13px", marginBottom: "14px" }}>
                                  <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{tr({ en: "Currently marked as", my: "လက်ရှိ မှတ်တမ်း", ko: "현재 기록", vi: "Hiện đang ghi là" })}</span>
                                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: statusBg(disputeModal.status), color: statusColor(disputeModal.status) }}>{statusLabel(disputeModal.status)}</span>
                                </div>
                                <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "6px", color: "var(--text-muted)" }}>{tr({ en: "What should this be?", my: "မည်သို့ ဖြစ်သင့်သနည်း?", ko: "어떻게 수정해야 하나요?", vi: "Nên là gì?" })}</label>
                                <select value={disputeForm.requested} onChange={e => setDisputeForm(p => ({ ...p, requested: e.target.value }))}
                                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 12px", fontSize: "12px", fontFamily: "inherit", color: "var(--text)", background: "var(--surface)", marginBottom: "12px" }}>
                                  <option value="present">{tr({ en: "Present", my: "တက်ရောက်", ko: "출석", vi: "Có mặt" })}</option>
                                  <option value="excused">{tr({ en: "Excused absence", my: "ခွင့်ရ မတက်ရောက်", ko: "승인된 결석", vi: "Vắng có phép" })}</option>
                                </select>
                                <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "6px", color: "var(--text-muted)" }}>{tr({ en: "Explain (visible to teacher)", my: "ရှင်းပြမည် (ဆရာမြင်သည်)", ko: "설명 (선생님에게 표시됨)", vi: "Giải thích (giáo viên sẽ thấy)" })}</label>
                                <textarea value={disputeForm.reason} onChange={e => setDisputeForm(p => ({ ...p, reason: e.target.value }))}
                                  placeholder={tr({ en: "e.g. I was on time, roll call may have missed me", my: "ဥပမာ — ကျွန်တော်/ကျွန်မ အချိန်မီ တက်ခဲ့သည်", ko: "예: 제시간에 왔는데 출석 체크에서 빠진 것 같아요", vi: "vd: Tôi đã đến đúng giờ, có thể bị bỏ sót khi điểm danh" })}
                                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 12px", fontSize: "12px", fontFamily: "inherit", color: "var(--text)", background: "var(--surface)", height: "60px", resize: "none", boxSizing: "border-box" }} />
                              </div>
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                                <button onClick={() => setDisputeModal(null)} style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>{tr({ en: "Cancel", my: "မလုပ်တော့", ko: "취소", vi: "Hủy" })}</button>
                                <button onClick={() => setDisputeModal(null)} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: "9px", padding: "9px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>{tr({ en: "Send request", my: "တောင်းဆိုမည်", ko: "요청 보내기", vi: "Gửi yêu cầu" })}</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ── My leave requests history ── */}
                        {leaveHistory.length > 0 && (
                          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "18px 20px" }}>
                            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>{tr({ en: "My leave requests", my: "ကျွန်တော်/ကျွန်မ ကြိုတင်တောင်းဆိုချက်များ", ko: "내 휴가 신청 내역", vi: "Đơn xin nghỉ của tôi" })}</div>
                            {leaveHistory.map((req, i) => {
                              const icons = { medical: "🩺", family: "👪", travel: "✈️", other: "📝" };
                              const reasonLabels = { medical: tr({ en: "Medical", my: "ကျန်းမာရေး", ko: "병가", vi: "Lý do sức khỏe" }), family: tr({ en: "Family event", my: "မိသားစု", ko: "가족 행사", vi: "Việc gia đình" }), travel: tr({ en: "Travel", my: "ခရီးသွား", ko: "여행", vi: "Đi lại" }), other: tr({ en: "Other", my: "အခြား", ko: "기타", vi: "Khác" }) };
                              const rType = req.reason_type || req.reasonType || "other";
                              const fromD = req.from_date || req.from;
                              const toD = req.to_date || req.to;
                              return (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 0", borderBottom: i < leaveHistory.length - 1 ? "1px solid var(--border)" : "none" }}>
                                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "var(--primary-tint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>{icons[rType] || "📝"}</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)" }}>{reasonLabels[rType]} — {classInfo?.name || ""}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "1px" }}>{fromD === toD ? new Date(fromD + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : `${new Date(fromD + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(toD + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}</div>
                                    {req.attachment && (
                                      <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {req.attachment.name}</div>
                                    )}
                                  </div>
                                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    {(() => {
                                      const s = req.status || "pending";
                                      const cfg = s === "approved"
                                        ? { bg: "rgba(34,197,94,0.12)", color: "#22c55e", label: tr({ en: "Approved", my: "အတည်ပြု", ko: "승인됨", vi: "Đã duyệt" }) }
                                        : s === "rejected"
                                        ? { bg: "rgba(239,68,68,0.1)", color: "#ef4444", label: tr({ en: "Rejected", my: "ငြင်းပယ်", ko: "거절됨", vi: "Đã từ chối" }) }
                                        : { bg: "#fff3e0", color: "#b45309", label: tr({ en: "Pending", my: "စောင့်ဆိုင်း", ko: "대기 중", vi: "Đang chờ" }) };
                                      return <span style={{ fontSize: "10px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
                                    })()}
                                    <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "3px" }}>{req.created_at ? new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : (tr({ en: "Sent today", my: "ယနေ့ပေးပို့", ko: "오늘 보냄", vi: "Đã gửi hôm nay" }))}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Leave request modal (form) ── */}
                        {leaveModal === "form" && (
                          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
                            <div style={{ background: "var(--surface)", borderRadius: "16px", width: "420px", overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,0.2)" }}>
                              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{tr({ en: "Request leave", my: "ကြိုတင်တောင်းဆိုမည်", ko: "휴가 신청", vi: "Xin nghỉ" })}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "3px" }}>{tr({ en: "Let your teacher know in advance", my: "ဆရာ/ဆရာမကို ကြိုတင် အကြောင်းကြားပါ", ko: "선생님께 미리 알려주세요", vi: "Hãy báo trước cho giáo viên" })}</div>
                              </div>
                              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "10px" }}>
                                  <div>
                                    <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "5px", color: "var(--text-muted)" }}>{tr({ en: "From", my: "မှ", ko: "부터", vi: "Từ" })}</label>
                                    <input type="date" value={leaveForm.from} onChange={e => setLeaveForm(p => ({ ...p, from: e.target.value, to: e.target.value > p.to ? e.target.value : p.to }))}
                                      style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 10px", fontSize: "12px", fontFamily: "inherit", color: "var(--text)", background: "var(--surface)", boxSizing: "border-box" }} />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "5px", color: "var(--text-muted)" }}>{tr({ en: "To", my: "အထိ", ko: "까지", vi: "Đến" })}</label>
                                    <input type="date" value={leaveForm.to} min={leaveForm.from} onChange={e => setLeaveForm(p => ({ ...p, to: e.target.value }))}
                                      style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 10px", fontSize: "12px", fontFamily: "inherit", color: "var(--text)", background: "var(--surface)", boxSizing: "border-box" }} />
                                  </div>
                                </div>
                                <div>
                                  <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "5px", color: "var(--text-muted)" }}>{tr({ en: "Reason", my: "အကြောင်းရင်း", ko: "사유", vi: "Lý do" })}</label>
                                  <select value={leaveForm.reasonType} onChange={e => setLeaveForm(p => ({ ...p, reasonType: e.target.value, attachment: e.target.value === "medical" ? p.attachment : null }))}
                                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 12px", fontSize: "12px", fontFamily: "inherit", color: "var(--text)", background: "var(--surface)" }}>
                                    <option value="medical">{tr({ en: "Medical", my: "ကျန်းမာရေး", ko: "병가", vi: "Lý do sức khỏe" })}</option>
                                    <option value="family">{tr({ en: "Family event", my: "မိသားစုကိစ္စ", ko: "가족 행사", vi: "Việc gia đình" })}</option>
                                    <option value="travel">{tr({ en: "Travel", my: "ခရီးသွား", ko: "여행", vi: "Đi lại" })}</option>
                                    <option value="other">{tr({ en: "Other", my: "အခြား", ko: "기타", vi: "Khác" })}</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "5px", color: "var(--text-muted)" }}>{tr({ en: "Add details (visible to teacher)", my: "အသေးစိတ် ထည့်ပါ (ဆရာမြင်မည်)", ko: "세부 내용 추가 (선생님에게 표시됨)", vi: "Thêm chi tiết (giáo viên sẽ thấy)" })}</label>
                                  <textarea value={leaveForm.details} onChange={e => setLeaveForm(p => ({ ...p, details: e.target.value }))}
                                    placeholder={tr({ en: "e.g. Doctor appointment at 9am", my: "ဥပမာ — နံနက် ၉ နာရီ ဆေးပြမည်", ko: "예: 오전 9시 병원 진료", vi: "vd: Khám bệnh lúc 9 giờ sáng" })}
                                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 12px", fontSize: "12px", fontFamily: "inherit", color: "var(--text)", background: "var(--surface)", height: "60px", resize: "none", boxSizing: "border-box" }} />
                                </div>
                                {leaveForm.reasonType === "medical" && (
                                  <div>
                                    <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "5px", color: "var(--text-muted)" }}>{tr({ en: "Hospital note / medical certificate (optional)", my: "ဆေးရုံစာ / ဆေးလက်မှတ် (ရွေးချယ်နိုင်)", ko: "진단서 / 의료 증명서 (선택 사항)", vi: "Giấy khám bệnh / giấy chứng nhận y tế (tùy chọn)" })}</label>
                                    {leaveForm.attachment ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 12px" }}>
                                        <Icon name="attach" size={16} alt="" />
                                        <span style={{ fontSize: "12px", color: "var(--text)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leaveForm.attachment.name}</span>
                                        <button type="button" onClick={() => setLeaveForm(p => ({ ...p, attachment: null }))}
                                          style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
                                      </div>
                                    ) : (
                                      <label style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 12px", cursor: "pointer" }}>
                                        <Icon name="attach" size={16} alt="" />
                                        <span style={{ fontSize: "12px", color: "#1a73e8", fontWeight: 500 }}>{tr({ en: "Attach file", my: "ဖိုင်တွဲရန်", ko: "파일 첨부", vi: "Đính kèm tệp" })}</span>
                                        <input type="file" accept="image/*,.pdf" onChange={e => setLeaveForm(p => ({ ...p, attachment: e.target.files[0] || null }))} style={{ display: "none" }} />
                                      </label>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                                <button onClick={() => setLeaveModal(null)} style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>{tr({ en: "Cancel", my: "မလုပ်တော့", ko: "취소", vi: "Hủy" })}</button>
                                <button onClick={submitLeaveRequest}
                                  style={{ background: "#0F172A", color: "#fff", border: "none", borderRadius: "9px", padding: "9px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>{tr({ en: "Submit request", my: "တောင်းဆိုမည်", ko: "요청 제출", vi: "Gửi yêu cầu" })}</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ── Leave request confirmation ── */}
                        {leaveModal === "confirm" && (
                          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
                            <div style={{ background: "var(--surface)", borderRadius: "16px", width: "360px", overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,0.2)", padding: "34px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "12px" }}>
                              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(34,197,94,0.15)", color: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>✓</div>
                              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{tr({ en: "Request sent", my: "တောင်းဆိုချက် ပေးပို့ပြီး", ko: "요청이 전송되었습니다", vi: "Đã gửi yêu cầu" })}</div>
                              <div style={{ fontSize: "12px", color: "var(--text-faint)", maxWidth: "270px" }}>{tr({ en: "Your teacher will review this request. You'll be notified once it's approved or declined.", my: "ဆရာ/ဆရာမ စစ်ဆေးပြီး အတည်ပြုချက် သို့မဟုတ် ငြင်းပယ်ချက် ပြန်ကြားပါမည်။", ko: "선생님이 이 요청을 검토할 예정이에요. 승인 또는 반려되면 알려드릴게요.", vi: "Giáo viên sẽ xem xét yêu cầu này. Bạn sẽ được thông báo khi được duyệt hoặc từ chối." })}</div>
                              <button onClick={() => setLeaveModal(null)} style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "9px", padding: "9px 20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", marginTop: "4px" }}>{tr({ en: "Done", my: "ပြီးပြီ", ko: "완료", vi: "Xong" })}</button>
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Leave Request Detail Modal (teacher) */}
              {leaveDetailModal && (() => {
                const req = leaveDetailModal;
                const icons = { medical: "🩺", family: "👪", travel: "✈️", other: "📝" };
                const reasonLabels = { medical: tr({ en: "Medical", my: "ကျန်းမာရေး", ko: "병가", vi: "Lý do sức khỏe" }), family: tr({ en: "Family event", my: "မိသားစု", ko: "가족 행사", vi: "Việc gia đình" }), travel: tr({ en: "Travel", my: "ခရီးသွား", ko: "여행", vi: "Đi lại" }), other: tr({ en: "Other", my: "အခြား", ko: "기타", vi: "Khác" }) };
                const fromD = req.from_date?.slice(0,10);
                const toD = req.to_date?.slice(0,10);
                const dateStr = fromD === toD
                  ? new Date(fromD + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                  : `${new Date(fromD + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(toD + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
                const submittedOn = req.created_at ? new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                return (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200 }}
                    onClick={() => setLeaveDetailModal(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "20px", width: "440px", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }}>
                      {/* Header */}
                      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "var(--primary-tint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>{icons[req.reason_type] || "📝"}</div>
                          <div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>{req.student_name || "Student"}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "1px" }}>{req.student_email || ""}</div>
                          </div>
                        </div>
                        <button onClick={() => setLeaveDetailModal(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)", lineHeight: 1 }}>×</button>
                      </div>

                      {/* Body */}
                      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                        {/* Reason */}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>{tr({ en: "Reason", my: "အကြောင်းရင်း", ko: "사유", vi: "Lý do" })}</span>
                          <span style={{ fontSize: "12px", color: "var(--text)", fontWeight: 600 }}>{reasonLabels[req.reason_type] || req.reason_type}</span>
                        </div>
                        {/* Date */}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>{tr({ en: "Date", my: "နေ့ရက်", ko: "날짜", vi: "Ngày" })}</span>
                          <span style={{ fontSize: "12px", color: "var(--text)" }}>{dateStr}</span>
                        </div>
                        {/* Submitted */}
                        {submittedOn && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>{tr({ en: "Submitted", my: "တင်သွင်းချိန်", ko: "제출 시간", vi: "Thời gian gửi" })}</span>
                            <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>{submittedOn}</span>
                          </div>
                        )}
                        {/* Details */}
                        {req.details && (
                          <div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600, marginBottom: "6px" }}>{tr({ en: "Details", my: "အသေးစိတ်", ko: "세부 정보", vi: "Chi tiết" })}</div>
                            <div style={{ background: "var(--surface-alt)", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", color: "var(--text)", lineHeight: 1.6 }}>{req.details}</div>
                          </div>
                        )}
                        {/* Attachment */}
                        {req.attachment_path && (() => {
                          const url = `http://localhost:5001/uploads/${req.attachment_path}`;
                          const isImage = /\.(png|jpe?g|gif|webp)$/i.test(req.attachment_path);
                          return (
                            <div>
                              <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600, marginBottom: "8px" }}>{tr({ en: "Attachment", my: "ပူးတွဲဖိုင်", ko: "첨부 파일", vi: "Tệp đính kèm" })}</div>
                              {isImage ? (
                                <a href={url} target="_blank" rel="noreferrer">
                                  <img src={url} alt="attachment" style={{ width: "100%", maxHeight: "240px", objectFit: "contain", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface-alt)", cursor: "pointer" }} />
                                </a>
                              ) : (
                                <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px", textDecoration: "none" }}>
                                  <span style={{ fontSize: "20px" }}>📄</span>
                                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)" }}>{tr({ en: "View attached file", my: "ဖိုင်ကြည့်ရန်", ko: "첨부 파일 보기", vi: "Xem tệp đính kèm" })}</span>
                                </a>
                              )}
                            </div>
                          );
                        })()}
                        {/* Status badge */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>{tr({ en: "Status", my: "အခြေအနေ", ko: "상태", vi: "Trạng thái" })}</span>
                          <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 12px", borderRadius: "999px",
                            background: req.status === "approved" ? "rgba(34,197,94,0.12)" : req.status === "rejected" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.12)",
                            color: req.status === "approved" ? "#16a34a" : req.status === "rejected" ? "#dc2626" : "#b45309" }}>
                            {req.status === "approved" ? (tr({ en: "Approved", my: "အတည်ပြုပြီး", ko: "승인됨", vi: "Đã duyệt" })) : req.status === "rejected" ? (tr({ en: "Rejected", my: "ငြင်းပယ်ပြီး", ko: "거절됨", vi: "Đã từ chối" })) : (tr({ en: "Pending", my: "ဆိုင်းငံ့", ko: "대기 중", vi: "Đang chờ" }))}
                          </span>
                        </div>
                      </div>

                      {/* Footer actions */}
                      {req.status === "pending" && (
                        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                          <button onClick={() => { reviewLeave(req.id, "rejected"); setLeaveDetailModal(r => ({ ...r, status: "rejected" })); }}
                            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "10px 20px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                            {tr({ en: "Reject", my: "ငြင်းပယ်မည်", ko: "거절", vi: "Từ chối" })}
                          </button>
                          <button onClick={() => { reviewLeave(req.id, "approved"); setLeaveDetailModal(r => ({ ...r, status: "approved" })); }}
                            style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                            {tr({ en: "Approve", my: "အတည်ပြုမည်", ko: "승인", vi: "Duyệt" })}
                          </button>
                        </div>
                      )}
                      {req.status !== "pending" && (
                        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
                          <button onClick={() => setLeaveDetailModal(null)} style={{ background: "var(--surface-alt)", color: "var(--text-muted)", border: "none", borderRadius: "10px", padding: "10px 20px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                            {tr({ en: "Close", my: "ပိတ်မည်", ko: "닫기", vi: "Đóng" })}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* New Session Modal */}
              {newSessionModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                  <div style={{ background: "var(--surface)", borderRadius: "16px", padding: "28px", width: "400px" }}>
                    <h3 style={{ margin: "0 0 20px", fontSize: "16px", fontWeight: 700 }}>{tr({ en: "New Attendance Session", my: "Session အသစ် ဖန်တီးမည်", ko: "새 출석 세션", vi: "Buổi điểm danh mới" })}</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>{tr({ en: "Title", my: "ခေါင်းစဉ်", ko: "제목", vi: "Tiêu đề" })}</label>
                        <input value={newSessionForm.title} onChange={e => setNewSessionForm(p => ({ ...p, title: e.target.value }))} placeholder={tr({ en: "e.g. Week 3 Class", my: "ဥပမာ Week 3 သင်ကြားချိန်", ko: "예: 3주차 수업", vi: "vd: Buổi học tuần 3" })} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", fontSize: "14px", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>{tr({ en: "Date", my: "နေ့စွဲ", ko: "날짜", vi: "Ngày" })}</label>
                        <input type="date" value={newSessionForm.session_date} onChange={e => setNewSessionForm(p => ({ ...p, session_date: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1.5px solid var(--border)", fontSize: "14px", boxSizing: "border-box" }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
                      <button onClick={() => setNewSessionModal(false)} style={{ background: "var(--surface-alt)", color: "var(--text-muted)", border: "none", borderRadius: "8px", padding: "9px 18px", fontWeight: 600, cursor: "pointer" }}>{tr({ en: "Cancel", my: "မလုပ်တော့ပါ", ko: "취소", vi: "Hủy" })}</button>
                      <button onClick={createAttendanceSession} style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 18px", fontWeight: 700, cursor: "pointer" }}>{tr({ en: "Create", my: "ဖန်တီးမည်", ko: "생성", vi: "Tạo" })}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ATTENDANCE FULL-PAGE PANEL ── */}
          {attendanceMarkModal && activeSession && (() => {
            const statusColors = { present: "#0F9D6E", late: "#D97706", absent: "#E1483F" };
            const statusBg = { present: "#E6F7EF", late: "#FFF8E6", absent: "#FFF0F0" };
            const isSavedSession = Object.keys(originalRecords).length > 0;
            const filteredRecords = activeSession.records.filter(r =>
              !attendanceSearchQuery || r.name.toLowerCase().includes(attendanceSearchQuery.toLowerCase())
            );
            const presentCount = Object.values(sessionRecords).filter(v => v === "present").length;
            const lateCount = Object.values(sessionRecords).filter(v => v === "late").length;
            const absentCount = Object.values(sessionRecords).filter(v => v === "absent").length;
            const changedCount = Object.keys(sessionRecords).filter(sid => originalRecords[sid] && sessionRecords[sid] !== originalRecords[sid]).length;
            return (
              <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg)", display: "flex", flexDirection: "column" }}>

                {/* ── Top bar ── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: "62px", background: "var(--surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <button onClick={() => window.history.back()}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "22px", lineHeight: 1, padding: "4px", borderRadius: "50%", display: "flex", alignItems: "center" }}>←</button>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{activeSession.title}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>
                        {activeSession.session_date
                          ? new Date(activeSession.session_date.slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                          : ""}
                        {" · "}{activeSession.records?.length || 0} {tr({ en: "students", my: "ကျောင်းသား", ko: "학생", vi: "học sinh" })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {isSavedSession && !attendanceModalEditMode && (
                      <button onClick={() => setAttendanceModalEditMode(true)}
                        style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#0B0B1E", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                        {tr({ en: "Edit", my: "ပြင်မည်", ko: "수정", vi: "Sửa" })}
                      </button>
                    )}
                    {attendanceModalEditMode && (
                      <>
                        <button onClick={() => { setSessionRecords({ ...originalRecords }); setAttendanceModalEditMode(false); }}
                          style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                          {tr({ en: "Cancel", my: "မလုပ်တော့", ko: "취소", vi: "Hủy" })}
                        </button>
                        <button onClick={saveAttendance} disabled={savingAttendance}
                          style={{ padding: "8px 22px", borderRadius: "8px", border: "none", background: "var(--primary)", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: savingAttendance ? "default" : "pointer" }}>
                          {savingAttendance ? (tr({ en: "Saving…", my: "သိမ်းနေသည်…", ko: "저장 중…", vi: "Đang lưu…" })) : tr({ en: "Save", my: "သိမ်းမည်", ko: "저장", vi: "Lưu" })}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Status strip (saved session) ── */}
                {isSavedSession && (
                  <div style={{ padding: "10px 28px", background: attendanceModalEditMode ? "rgba(217,119,6,0.07)" : "rgba(91,95,233,0.06)", borderBottom: "1px solid var(--border)", flexShrink: 0, fontSize: "12px", fontWeight: 600, color: attendanceModalEditMode ? "#D97706" : "#5B5FE9" }}>
                    {attendanceModalEditMode
                      ? (tr({ en: "✏️ Editing — changes will update the saved record", my: "✏️ ပြင်နေသည် — သိမ်းမှ record ပြောင်းမည်", ko: "✏️ 수정 중 — 저장하면 기록이 변경됩니다", vi: "✏️ Đang chỉnh sửa — thay đổi sẽ cập nhật hồ sơ đã lưu" }))
                      : (tr({ en: "🔒 Viewing saved record", my: "🔒 မှတ်ပြီးသော record ကြည့်နေသည်", ko: "🔒 저장된 기록 보는 중", vi: "🔒 Đang xem hồ sơ đã lưu" }))}
                    {attendanceModalEditMode && changedCount > 0 && (
                      <span style={{ marginLeft: "12px", fontWeight: 400, color: "#D97706" }}>
                        · {changedCount} {tr({ en: "changed", my: "ပြောင်းလဲပြီ", ko: "변경됨", vi: "đã thay đổi" })}
                      </span>
                    )}
                  </div>
                )}

                {/* ── Toolbar (edit mode) ── */}
                {attendanceModalEditMode && (
                  <div style={{ padding: "12px 28px", display: "flex", gap: "10px", alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                    <div style={{ flex: 1, maxWidth: "400px", display: "flex", alignItems: "center", gap: "8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "8px 14px" }}>
                      <span style={{ color: "var(--text-faint)" }}>🔍</span>
                      <input value={attendanceSearchQuery} onChange={e => setAttendanceSearchQuery(e.target.value)}
                        placeholder={tr({ en: "Search student…", my: "ကျောင်းသား ရှာပါ…", ko: "학생 검색…", vi: "Tìm học sinh…" })}
                        style={{ border: "none", background: "transparent", outline: "none", fontSize: "13px", color: "var(--text)", width: "100%" }} />
                    </div>
                    <button onClick={() => { const all = {}; activeSession.records.forEach(r => { all[r.student_id] = "present"; }); setSessionRecords(all); }}
                      style={{ fontSize: "12px", fontWeight: 600, color: "#5B5FE9", background: "var(--primary-tint)", border: "none", borderRadius: "10px", padding: "10px 16px", cursor: "pointer", whiteSpace: "nowrap" }}>
                      {tr({ en: "✓ Mark all present", my: "✓ အားလုံး တက်ရောက်", ko: "✓ 전체 출석 처리", vi: "✓ Đánh dấu tất cả có mặt" })}
                    </button>
                  </div>
                )}

                {/* ── Student list (scrollable) ── */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <div style={{ maxWidth: "860px", margin: "0 auto", padding: "12px 20px 80px" }}>
                    {filteredRecords.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-faint)" }}>
                        <div style={{ fontSize: "30px", marginBottom: "10px" }}>🔍</div>
                        <div style={{ fontSize: "14px", fontWeight: 600 }}>
                          {activeSession.records.length === 0
                            ? (tr({ en: "No students enrolled.", my: "ကျောင်းသား မရှိသေးပါ", ko: "등록된 학생이 없습니다.", vi: "Chưa có học sinh nào." }))
                            : (tr({ en: "No match found", my: "မတွေ့ပါ", ko: "일치하는 결과 없음", vi: "Không tìm thấy" }))}
                        </div>
                      </div>
                    ) : filteredRecords.map(r => {
                      const st = sessionRecords[r.student_id] || "present";
                      const isChanged = isSavedSession && attendanceModalEditMode && originalRecords[r.student_id] && sessionRecords[r.student_id] !== originalRecords[r.student_id];
                      return (
                        <div key={r.student_id}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderRadius: "14px", marginBottom: "4px", transition: "background 0.12s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg,#5B5FE9,#22D3EE)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "14px", flexShrink: 0 }}>
                              {r.name[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{r.name}</span>
                                {isChanged && <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#5B5FE9", background: "var(--primary-tint)", padding: "2px 7px", borderRadius: "999px" }}>{tr({ en: "Changed", my: "ပြောင်းလဲ", ko: "변경됨", vi: "Đã thay đổi" })}</span>}
                              </div>
                              <div style={{ fontSize: "11.5px", color: "var(--text-faint)" }}>{r.email}</div>
                            </div>
                          </div>
                          {attendanceModalEditMode ? (
                            <div style={{ display: "flex", background: "rgba(11,11,30,0.05)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                              {[["present", tr({ en: "Present", my: "တက်", ko: "출석", vi: "Có mặt" })], ["late", tr({ en: "Late", my: "နောက်ကျ", ko: "지각", vi: "Đi muộn" })], ["absent", tr({ en: "Absent", my: "မတက်", ko: "결석", vi: "Vắng mặt" })]].map(([val, label]) => (
                                <button key={val} onClick={() => setSessionRecords(prev => ({ ...prev, [r.student_id]: val }))}
                                  style={{ border: "none", fontSize: "12px", fontWeight: 600, padding: "8px 16px", borderRadius: "8px", cursor: "pointer",
                                    background: st === val ? "#fff" : "transparent",
                                    color: st === val ? statusColors[val] : "var(--text-muted)",
                                    boxShadow: st === val ? "0 1px 4px rgba(11,11,30,0.1)" : "none" }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", fontWeight: 700, padding: "7px 16px", borderRadius: "999px", background: statusBg[st], color: statusColors[st] }}>
                              {st === "present" ? (tr({ en: "Present", my: "တက်", ko: "출석", vi: "Có mặt" })) : st === "late" ? (tr({ en: "Late", my: "နောက်ကျ", ko: "지각", vi: "Đi muộn" })) : (tr({ en: "Absent", my: "မတက်", ko: "결석", vi: "Vắng mặt" }))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Bottom bar (fixed) ── */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "12px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {/* Summary dots */}
                  <div style={{ display: "flex", gap: "18px", fontSize: "12.5px", color: "var(--text-muted)" }}>
                    <span><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#0F9D6E", display: "inline-block", marginRight: "6px" }} />{presentCount} {tr({ en: "Present", my: "တက်", ko: "출석", vi: "Có mặt" })}</span>
                    <span><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#D97706", display: "inline-block", marginRight: "6px" }} />{lateCount} {tr({ en: "Late", my: "နောက်ကျ", ko: "지각", vi: "Đi muộn" })}</span>
                    <span><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#E1483F", display: "inline-block", marginRight: "6px" }} />{absentCount} {tr({ en: "Absent", my: "မတက်", ko: "결석", vi: "Vắng mặt" })}</span>
                  </div>
                  {/* Delete */}
                  <button onClick={async () => {
                    await deleteAttendanceSession(activeSession.id);
                    setAttendanceMarkModal(false);
                    setAttendanceSearchQuery("");
                    setAttendanceModalEditMode(false);
                  }} style={{ fontSize: "12.5px", fontWeight: 600, color: "#E1483F", background: "transparent", border: "1px solid #E1483F", borderRadius: "8px", padding: "8px 16px", cursor: "pointer" }}>
                    🗑 {tr({ en: "Delete session", my: "Session ဖျက်မည်", ko: "세션 삭제", vi: "Xóa buổi học" })}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── PEOPLE TAB ── */}
          {activeTab === "people" && (() => {
            const gradeColor = pct => pct === null ? "var(--text-faint)" : pct >= 75 ? "#16A34A" : pct >= 50 ? "#D97706" : "#DC2626";
            const filtered = richMembers || [];
            const compact = !!selectedStudent;
            const rowCols = compact ? "1fr" : "1fr 60px 60px 40px";
            return (
              <div style={{ display: "grid", gridTemplateColumns: compact ? "280px 1fr" : "1fr", gap: "20px", alignItems: "start" }}>
                {/* LEFT — student list: full table normally, a narrow name-only rail once a student is open */}
                <div>
                  {!compact && teacher && (
                    <div style={{ ...memberRow, marginBottom: "16px" }}>
                      <div style={{ ...memberAvatar, background: "var(--primary)" }}>{teacher.name[0].toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{teacher.name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>{teacher.email}</div>
                      </div>
                    </div>
                  )}

                  {!compact && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                      <button onClick={() => setInviteModal(true)} style={{ ...btnPrimary, fontSize: "12px", padding: "6px 14px", width: "auto" }}>+ Invite</button>
                    </div>
                  )}

                  {/* Column header */}
                  <div style={{ display: "grid", gridTemplateColumns: rowCols, gap: "8px", padding: "6px 14px", fontSize: "10px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" }}>
                    <span>Name</span>
                    {!compact && <span style={{ textAlign: "center" }}>Grade</span>}
                    {!compact && <span style={{ textAlign: "center" }}>Att.</span>}
                    {!compact && <span style={{ textAlign: "center" }}>Note</span>}
                  </div>

                  {richLoading ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "var(--text-faint)" }}>Loading...</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "var(--text-faint)" }}>No students.</div>
                  ) : filtered.map(row => (
                    <div key={row.id} onClick={() => { openStudentStats(row); setSelectedStudent(row); }}
                      style={{
                        display: "grid", gridTemplateColumns: rowCols, gap: "8px",
                        padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer",
                        background: selectedStudent?.id === row.id ? "var(--primary-tint)" : "transparent",
                        alignItems: "center",
                      }}
                      onMouseEnter={e => { if (selectedStudent?.id !== row.id) e.currentTarget.style.background = "var(--surface-alt)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = selectedStudent?.id === row.id ? "var(--primary-tint)" : "transparent"; }}
                    >
                      {/* Name */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
                          {row.name[0].toUpperCase()}
                        </div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</div>
                      </div>

                      {!compact && (
                        <div style={{ textAlign: "center", fontSize: "12px", fontWeight: 700, color: gradeColor(row.gradePct) }}>
                          {row.gradePct !== null ? `${row.gradePct}%` : "—"}
                        </div>
                      )}

                      {!compact && (
                        <div style={{ textAlign: "center", fontSize: "12px", fontWeight: 700, color: gradeColor(row.attPct) }}>
                          {row.attPct !== null ? `${row.attPct}%` : "—"}
                        </div>
                      )}

                      {!compact && (
                        <div style={{ textAlign: "center" }}>
                          <button onClick={e => { e.stopPropagation(); setNotePanel(row); setNoteCategory("concern"); setNoteMessage(""); }}
                            style={{ width: "24px", height: "24px", borderRadius: "7px", background: "var(--primary-tint)", color: "var(--primary)", border: "none", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                            ✎
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* RIGHT — member detail panel */}
                {selectedStudent && (() => {
                  const rich = (richMembers || []).find(r => r.id === selectedStudent.id);
                  return (
                    <div style={{ background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--border)", overflow: "hidden", position: "sticky", top: "20px" }}>
                      {/* Gradient header */}
                      <div style={{ background: "linear-gradient(150deg,var(--primary),var(--primary-light))", padding: "18px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
                        <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          {selectedStudent.name[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>{selectedStudent.name}</div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.8)", marginTop: "2px" }}>Student</div>
                        </div>
                        <button onClick={() => setSelectedStudent(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "8px", color: "#fff", fontSize: "14px", cursor: "pointer", padding: "4px 8px" }}>✕</button>
                      </div>

                      <div style={{ padding: "16px 18px" }}>
                        {/* Quick stats */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                          {[
                            { label: "Grade avg", value: rich?.gradePct !== null && rich?.gradePct !== undefined ? `${rich.gradePct}%` : "—", color: gradeColor(rich?.gradePct) },
                            { label: "Attendance", value: rich?.attPct !== null && rich?.attPct !== undefined ? `${rich.attPct}%` : "—", color: gradeColor(rich?.attPct) },
                            { label: "Pending", value: studentStats?.stats?.totalAssignments != null ? (studentStats.stats.totalAssignments - studentStats.stats.submittedCount) : "—", color: "var(--text-muted)" },
                          ].map(stat => (
                            <div key={stat.label} style={{ background: "#F8FAFC", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                              <div style={{ fontSize: "16px", fontWeight: 800, color: stat.color }}>{stat.value}</div>
                              <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "2px" }}>{stat.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Recent grades */}
                        {studentStatsLoading ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "var(--text-faint)", fontSize: "12px" }}>Loading...</div>
                        ) : studentStats?.assignments?.slice(0, 5).map(a => (
                          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F1F2F5", fontSize: "12px" }}>
                            <span style={{ color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "8px" }}>{a.title}</span>
                            {a.submission?.grade != null
                              ? <span style={{ fontWeight: 700, color: gradeColor(Math.round((a.submission.grade / a.points) * 100)) }}>{a.submission.grade}/{a.points}</span>
                              : <span style={{ fontSize: "10px", fontWeight: 600, color: a.status === "missing" ? "#DC2626" : "var(--primary)", background: a.status === "missing" ? "#FEF2F2" : "var(--primary-tint)", padding: "2px 8px", borderRadius: "20px" }}>{a.status === "missing" ? "Missing" : "Submitted"}</span>
                            }
                          </div>
                        ))}

                        {/* Note button */}
                        <button onClick={() => { setNotePanel(selectedStudent); setNoteCategory("reminder"); setNoteMessage(""); }}
                          style={{ ...btnOutline, marginTop: "14px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                          ✎ Send a note
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Material context / three-dot menu */}
      {matMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setMatMenu(null)} />
          <div style={{
            position: "fixed", top: matMenu.y, left: matMenu.x, zIndex: 1000,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)",
            minWidth: "176px",
            padding: "5px",
          }}>
            <button
              onClick={() => { openEditMatById(matMenu.id); setMatMenu(null); }}
              style={{ width: "100%", padding: "9px 12px", border: "none", background: "none", borderRadius: "8px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-alt)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit lesson
            </button>
            <div style={{ height: "1px", background: "var(--border)", margin: "3px 0" }} />
            <button
              onClick={() => { setMatDeleteConfirm(matMenu.id); setMatMenu(null); }}
              style={{ width: "100%", padding: "9px 12px", border: "none", background: "none", borderRadius: "8px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
              onMouseEnter={e => e.currentTarget.style.background = "#FEF2F2"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Delete lesson
            </button>
          </div>
        </>
      )}

      {/* Delete lesson confirm dialog */}
      {matDeleteConfirm && (
        <div style={overlayStyle} onClick={() => setMatDeleteConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "380px", padding: "28px 24px 24px", textAlign: "center" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>Delete lesson?</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.6", marginBottom: "24px" }}>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>"{materials.find(m => m.id === matDeleteConfirm)?.title}"</span>{" "}
              will be permanently removed along with all its files and comments.
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setMatDeleteConfirm(null)} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
              <button onClick={() => deleteMaterial(matDeleteConfirm)} style={{ flex: 1, background: "#DC2626", color: "#fff", border: "none", borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance session right-click context menu */}
      {sessCtxMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setSessCtxMenu(null)} />
          <div style={{
            position: "fixed", top: sessCtxMenu.y, left: sessCtxMenu.x, zIndex: 1000,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)",
            minWidth: "176px",
            padding: "5px",
          }}>
            <button
              onClick={() => { const s = attendanceSessions?.find(x => x.id === sessCtxMenu.id); if (s) { setRenamingSessionId(s.id); setRenamingTitle(s.title); } setSessCtxMenu(null); }}
              style={{ width: "100%", padding: "9px 12px", border: "none", background: "none", borderRadius: "8px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-alt)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              {tr({ en: "Rename", my: "ခေါင်းစဉ်ပြင်", ko: "이름 변경", vi: "Đổi tên" })}
            </button>
            <div style={{ height: "1px", background: "var(--border)", margin: "3px 0" }} />
            <button
              onClick={async () => { const sid = sessCtxMenu.id; const date = attendanceSessions?.find(x => x.id === sid)?.session_date?.slice(0, 10); setSessCtxMenu(null); await deleteAttendanceSession(sid); if (calSelectedDate === date) setCalSelectedDate(null); }}
              style={{ width: "100%", padding: "9px 12px", border: "none", background: "none", borderRadius: "8px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
              onMouseEnter={e => e.currentTarget.style.background = "#FEF2F2"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              {tr({ en: "Delete session", my: "ဖျက်မည်", ko: "세션 삭제", vi: "Xóa buổi học" })}
            </button>
          </div>
        </>
      )}

      {/* Send Note Panel */}
      {notePanel && (
        <div style={overlayStyle} onClick={() => setNotePanel(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "360px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Send a note to {notePanel.name}</div>
              <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Appears as a notice on their dashboard</div>
            </div>
            <label style={lbl}>Category</label>
            <select value={noteCategory} onChange={e => setNoteCategory(e.target.value)}
              style={{ ...inp, marginBottom: "12px" }}>
              <option value="concern">⚠ Attendance/Grade concern</option>
              <option value="reminder">📌 General reminder</option>
              <option value="positive">✅ Positive feedback</option>
            </select>
            <label style={lbl}>Message</label>
            <textarea value={noteMessage} onChange={e => setNoteMessage(e.target.value)}
              placeholder="e.g. Let's talk after class tomorrow"
              style={{ ...inp, height: "72px", resize: "none", marginBottom: "16px" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setNotePanel(null)} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
              <button onClick={sendNote} disabled={noteSending || !noteMessage.trim()}
                style={{ ...btnPrimary, flex: 1, opacity: noteSending || !noteMessage.trim() ? 0.5 : 1 }}>
                {noteSending ? "Sending..." : "Send note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Student Modal */}
      {inviteModal && (
        <div style={overlayStyle} onClick={() => { setInviteModal(false); setInviteMsg(null); setInviteEmail(""); }}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "420px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0 }}>✉️ Invite Student</h3>
              <button onClick={() => { setInviteModal(false); setInviteMsg(null); setInviteEmail(""); }} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
              {tr({ en: "Enter the student's email — they must have an account", my: "ကျောင်းသားရဲ့ email ထည့်ပါ — အကောင့်ရှိပါမှ ထည့်နိုင်မည်", ko: "학생의 이메일을 입력하세요 — 계정이 있어야 합니다", vi: "Nhập email của học sinh — họ phải có tài khoản" })}
            </div>
            <input
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleInvite()}
              placeholder="student@email.com"
              type="email"
              style={{ ...inp, width: "100%", marginBottom: "12px" }}
              autoFocus
            />
            {inviteMsg && (
              <div style={{ fontSize: "13px", color: inviteMsg.ok ? "#22c55e" : "#ef4444", marginBottom: "12px", fontWeight: 600 }}>
                {inviteMsg.text}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setInviteModal(false); setInviteMsg(null); setInviteEmail(""); }} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
              <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} style={{ ...btnPrimary, flex: 1 }}>
                {inviting ? "Inviting..." : "Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Assignment Modal */}
      {editAssignModal && selectedAssign && (
        <div style={{ ...overlayStyle, zIndex: 1100 }} onClick={() => setEditAssignModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "540px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", margin: "0 0 20px", display: "flex", alignItems: "center", gap: "8px" }}><Icon name="edit" size={18} alt="" /> Edit Assignment</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={lbl}>Title *</label>
                <input value={editAssignForm.title}
                  onChange={e => setEditAssignForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Assignment title"
                  style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Instructions</label>
                <textarea value={editAssignForm.instructions}
                  onChange={e => setEditAssignForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="What should students do?"
                  style={{ ...inp, height: "100px", resize: "none" }} />
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Due Date</label>
                  <input type="datetime-local" value={editAssignForm.due_date}
                    onChange={e => setEditAssignForm(f => ({ ...f, due_date: e.target.value }))}
                    style={inp} />
                </div>
                <div style={{ width: "110px" }}>
                  <label style={lbl}>Points</label>
                  <input type="number" min="0" max="1000" value={editAssignForm.points}
                    onChange={e => setEditAssignForm(f => ({ ...f, points: e.target.value }))}
                    style={inp} />
                </div>
              </div>
              {/* Existing files */}
              {selectedAssign?.files?.length > 0 && (
                <div>
                  <label style={lbl}>Current Attachments</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {selectedAssign.files.map(f => (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: editDeleteFileIds.includes(f.id) ? "var(--text-faint)" : "var(--text-muted)", background: editDeleteFileIds.includes(f.id) ? "#fef2f2" : "var(--surface-alt)", padding: "4px 10px", borderRadius: "6px", border: `1px solid ${editDeleteFileIds.includes(f.id) ? "#fca5a5" : "var(--border)"}`, textDecoration: editDeleteFileIds.includes(f.id) ? "line-through" : "none" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="file" size={13} alt="" /> {f.file_name}</span>
                        <button onClick={() => setEditDeleteFileIds(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                          style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "12px", color: editDeleteFileIds.includes(f.id) ? "#22c55e" : "#ef4444" }}>
                          {editDeleteFileIds.includes(f.id) ? "↩ Restore" : "× Remove"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* New file attachments */}
              <div>
                <label style={lbl}>Add New Attachments</label>
                <div style={{ border: "1.5px dashed var(--border)", borderRadius: "10px", padding: "10px", background: "var(--surface-alt)" }}>
                  <input ref={editAssignFileRef} type="file" multiple style={{ display: "none" }}
                    onChange={e => setEditAssignFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  <button type="button" onClick={() => editAssignFileRef.current?.click()}
                    style={{ fontSize: "13px", color: "var(--primary)", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="attach" size={14} alt="" /> Add files
                  </button>
                  {editAssignFiles.length > 0 && (
                    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {editAssignFiles.map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)", background: "var(--surface)", padding: "4px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="file" size={13} alt="" /> {f.name}</span>
                          <button onClick={() => setEditAssignFiles(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "flex" }}><Icon name="multiply" size={12} alt="Remove" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {editAssignError && <p style={{ color: "#ef4444", fontSize: "13px", marginTop: "10px" }}>{editAssignError}</p>}
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button onClick={() => { setEditAssignModal(false); setEditAssignFiles([]); setEditDeleteFileIds([]); }} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
              <button onClick={() => handleUpdateAssignment(true)}
                disabled={editAssignSaving || !editAssignForm.title.trim()}
                style={{ ...btnOutline, flex: 1, color: "var(--text-muted)", opacity: (!editAssignForm.title.trim() || editAssignSaving) ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                <Icon name="file" size={14} alt="" /> Save as Draft
              </button>
              <button onClick={() => handleUpdateAssignment(false)}
                disabled={editAssignSaving || !editAssignForm.title.trim()}
                style={{ ...btnPrimary, flex: 1, opacity: (!editAssignForm.title.trim() || editAssignSaving) ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                {editAssignSaving ? "Saving..." : <><Icon name="save" size={14} alt="" style={{ filter: "brightness(0) invert(1)" }} /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Post Modal */}
      {editingPost && (
        <div style={overlayStyle} onClick={() => setEditingPost(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "480px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0 }}>✏️ Edit Announcement</h3>
              <button onClick={() => setEditingPost(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>
            <textarea value={editingPost.content} onChange={e => setEditingPost(p => ({ ...p, content: e.target.value }))}
              style={{ ...inp, width: "100%", height: "120px", resize: "none", marginBottom: "14px" }} />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setEditingPost(null)} style={btnOutline}>Cancel</button>
              <button onClick={handleEditPost} style={btnPrimary}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Stats Modal */}
      {submissionStats && (
        <div style={overlayStyle} onClick={() => setSubmissionStats(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "520px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}><Icon name="bar-chart" size={16} alt="" /> Submission Status</h3>
              <button onClick={() => setSubmissionStats(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>
            {submissionStats.loading ? (
              <div style={{ textAlign: "center", padding: "32px", color: "var(--text-faint)" }}>Loading...</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                  {[
                    { label: "Submitted", count: submissionStats.students?.filter(s => s.status !== "missing").length || 0, color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
                    { label: "Missing", count: submissionStats.students?.filter(s => s.status === "missing").length || 0, color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
                    { label: "Graded", count: submissionStats.students?.filter(s => s.status === "graded").length || 0, color: "var(--primary)", bg: "var(--primary-tint)" },
                  ].map(stat => (
                    <div key={stat.label} style={{ flex: 1, background: stat.bg, borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                      <div style={{ fontSize: "24px", fontWeight: 800, color: stat.color }}>{stat.count}</div>
                      <div style={{ fontSize: "12px", color: stat.color, fontWeight: 600 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
                  {submissionStats.students?.map(s => (
                    <div key={s.student.id}>
                      <div
                        onClick={() => s.submission && setSelectedSubmission(selectedSubmission?.id === s.submission?.id ? null : s)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 16px", borderBottom: "1px solid var(--surface-alt)",
                          cursor: s.submission ? "pointer" : "default",
                          background: selectedSubmission?.student?.id === s.student.id ? "var(--primary-tint)" : "transparent",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>
                            {s.student.name[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: "14px", color: "var(--text)", fontWeight: 500 }}>{s.student.name}</div>
                            {s.submission && <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                              {new Date(s.submission.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {s.submission?.grade !== null && s.submission?.grade !== undefined && (
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--primary)" }}>{s.submission.grade}/{submissionStats.assignment?.points} pts</span>
                          )}
                          <span style={{
                            fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px",
                            background: s.status === "missing" ? "rgba(239,68,68,0.1)" : s.status === "graded" ? "var(--primary-tint)" : "rgba(34,197,94,0.12)",
                            color: s.status === "missing" ? "#ef4444" : s.status === "graded" ? "var(--primary)" : "#22c55e",
                          }}>
                            {s.status === "missing" ? "Missing" : s.status === "graded" ? "Graded" : "Submitted"}
                          </span>
                          {s.submission && <span style={{ fontSize: "14px", color: "var(--text-faint)" }}>{selectedSubmission?.student?.id === s.student.id ? "▲" : "▼"}</span>}
                        </div>
                      </div>

                      {/* Expanded submission detail */}
                      {selectedSubmission?.student?.id === s.student.id && s.submission && (
                        <div style={{ background: "var(--surface-alt)", borderBottom: "1px solid var(--border)", padding: "14px 20px" }}>
                          {/* Text content */}
                          {s.submission.content && (
                            <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "10px", lineHeight: 1.6, background: "var(--surface)", borderRadius: "8px", padding: "10px 12px", border: "1px solid var(--border)" }}>
                              {s.submission.content}
                            </div>
                          )}
                          {/* Files */}
                          {(s.submission.submission_files?.length > 0 ? s.submission.submission_files : s.submission.file_path ? [{ file_name: "Attached file", file_path: s.submission.file_path }] : []).map((f, fi) => (
                            <a key={fi} href={`http://localhost:5001/uploads/${f.file_path}`} target="_blank" rel="noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--primary)", fontWeight: 600, marginBottom: "6px", background: "var(--primary-tint)", padding: "6px 12px", borderRadius: "8px", textDecoration: "none", marginRight: "6px" }}>
                              <Icon name="attach" size={14} alt="" /> {f.file_name}
                            </a>
                          ))}

                          {/* Grade input */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                            <input
                              type="number" min="0" max={submissionStats.assignment?.points || 100}
                              placeholder="Grade"
                              value={gradeInputs[s.submission.id] ?? (s.submission.grade ?? "")}
                              onChange={e => setGradeInputs(g => ({ ...g, [s.submission.id]: e.target.value }))}
                              style={{ ...inp, width: "80px" }}
                            />
                            <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>/ {submissionStats.assignment?.points || 100} pts</span>
                            <button
                              disabled={grading[s.submission.id]}
                              onClick={async () => {
                                const grade = parseInt(gradeInputs[s.submission.id]);
                                if (isNaN(grade)) return;
                                setGrading(g => ({ ...g, [s.submission.id]: true }));
                                try {
                                  await API.post(`/classroom/submissions/${s.submission.id}/grade`, { grade });
                                  setSubmissionStats(prev => ({
                                    ...prev,
                                    students: prev.students.map(st =>
                                      st.student.id === s.student.id
                                        ? { ...st, submission: { ...st.submission, grade }, status: "graded" }
                                        : st
                                    ),
                                  }));
                                } catch (err) { console.error(err); }
                                finally { setGrading(g => ({ ...g, [s.submission.id]: false })); }
                              }}
                              style={{ ...btnPrimary, fontSize: "12px", padding: "6px 14px" }}>
                              {grading[s.submission.id] ? "..." : "Grade"}
                            </button>
                          </div>

                          {/* Private comments inline */}
                          <SubmissionComments
                            assignId={submissionStats.assignment?.id}
                            studentId={s.student.id}
                            studentName={s.student.name}
                            myName={myName}
                            myId={myId}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Topic Modal */}
      {topicModal && (
        <div style={overlayStyle} onClick={() => setTopicModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "380px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}><Icon name="opened-folder" size={15} alt="" /> Set Topic</h3>
            <input value={topicInput} onChange={e => setTopicInput(e.target.value)}
              placeholder="e.g. Chapter 1, Week 2, HTML Basics..."
              style={{ ...inp, width: "100%", marginBottom: "14px" }} autoFocus
              onKeyDown={e => e.key === "Enter" && saveTopic()} />
            <div style={{ fontSize: "12px", color: "var(--text-faint)", marginBottom: "14px" }}>{tr({ en: "Leave blank and Save to remove the topic", my: "Topic ကို ဖယ်ရှားဖို့ blank ထားပြီး Save နှိပ်ပါ", ko: "주제를 삭제하려면 비워두고 저장하세요", vi: "Để trống và Lưu để xóa chủ đề" })}</div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setTopicModal(null)} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
              <button onClick={saveTopic} style={{ ...btnPrimary, flex: 1 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Result Modal */}
      {aiModal && aiModal !== "chat" && (
        <div style={overlayStyle} onClick={() => setAiModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "540px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", margin: 0 }}>
                {aiModal === "highlights" ? "✏️ Smart Highlighting" : aiModal === "summary" ? "📋 Auto-Summary" : "❓ Practice Quiz"}
              </h2>
              <button onClick={() => setAiModal(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>

            {aiLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-faint)" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>🤖</div>
                <p>AI is analyzing the material...</p>
              </div>
            ) : aiResult?.error ? (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "16px", color: "#ef4444", fontSize: "14px" }}>
                ⚠️ {aiResult.error}
              </div>
            ) : aiModal === "highlights" && Array.isArray(aiResult) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {aiResult.map((item, i) => (
                  <div key={i} style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "10px", padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <div style={{ fontWeight: 700, color: "#92400e", fontSize: "14px" }}>🔑 {item.term}</div>
                      {item.category && (
                        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#92400e", background: "rgba(251,191,36,0.25)", padding: "2px 7px", borderRadius: "999px" }}>
                          {item.category}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>{item.explanation}</div>
                    {item.example && (
                      <div style={{ fontSize: "12px", color: "var(--text-faint)", fontStyle: "italic", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(251,191,36,0.25)" }}>
                        "{item.example}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : aiModal === "summary" && Array.isArray(aiResult) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Cached results made before this prompt was upgraded may still be plain
                    strings rather than {label, detail} — render either shape. */}
                {aiResult.map((point, i) => {
                  const isStructured = point && typeof point === "object";
                  return (
                    <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0, marginTop: "2px" }}>
                        {i + 1}
                      </div>
                      <div>
                        {isStructured && point.label && (
                          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--primary)", marginBottom: "2px" }}>
                            {point.label}
                          </div>
                        )}
                        <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
                          {isStructured ? point.detail : point}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : aiModal === "quiz" && Array.isArray(aiResult) ? (
              <QuizView questions={aiResult} />
            ) : null}
          </div>
        </div>
      )}

      {/* ── Teacher: AI Tutor Setup Modal ── */}
      {tutorSetupOpen && (
        <div style={overlayStyle} onClick={() => setTutorSetupOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "520px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg,#22c55e,#16a34a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>🤖</div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>AI Tutor Setup</div>
                <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Hint-only mode — students get clues, never direct answers</div>
              </div>
              <button onClick={() => setTutorSetupOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>

            {/* Enable toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-alt)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>Enable AI Tutor for students</div>
                <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>Students will see "AI Tutor" card in their study panel</div>
              </div>
              <button onClick={() => setTutorForm(f => ({ ...f, enabled: !f.enabled }))}
                style={{ width: "44px", height: "24px", borderRadius: "999px", border: "none", cursor: "pointer", background: tutorForm.enabled ? "#22c55e" : "var(--border)", position: "relative", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: "3px", left: tutorForm.enabled ? "22px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>

            {/* Lesson context */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>📚 Lesson Context</label>
              <textarea value={tutorForm.lesson_context} onChange={e => setTutorForm(f => ({ ...f, lesson_context: e.target.value }))}
                placeholder="Describe what students are studying this week. e.g. 'Chapter 3: OOP in Java — classes, objects, inheritance. Students should understand encapsulation and polymorphism.'"
                style={{ width: "100%", minHeight: "100px", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "var(--text)", background: "var(--surface-alt)", fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Homework context */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>📝 Homework Context (optional)</label>
              <textarea value={tutorForm.homework_context} onChange={e => setTutorForm(f => ({ ...f, homework_context: e.target.value }))}
                placeholder="Describe current homework. e.g. 'Problem set on loops and arrays. Students must submit by Friday. No giving answers — only hint at approach.'"
                style={{ width: "100%", minHeight: "80px", border: "1.5px solid var(--border)", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "var(--text)", background: "var(--surface-alt)", fontFamily: "inherit", lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>

            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "10px 14px", marginBottom: "20px", fontSize: "12px", color: "#f59e0b" }}>
              ⚠️ AI Tutor will NEVER give direct answers — it guides students with hints and questions only.
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setTutorSetupOpen(false)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 18px", fontSize: "13px", color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button>
              <button onClick={saveTutorConfig} disabled={tutorSaving} style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 20px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                {tutorSaving ? "Saving..." : "Save & Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Tutor Chat Modal (students) ── */}
      {aiModal === "tutor" && (
        <div style={overlayStyle} onClick={() => setAiModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "520px", display: "flex", flexDirection: "column", height: "600px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "linear-gradient(135deg,#22c55e,#16a34a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🎓</div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>AI Tutor</div>
                <div style={{ fontSize: "11px", color: "#f59e0b", fontWeight: 600 }}>💡 Hint-only mode — I guide, you discover</div>
              </div>
              <button onClick={() => setAiModal(null)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>

            {/* Intro if no history */}
            {tutorHistory.length === 0 && (
              <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "12px", padding: "14px 16px", marginBottom: "12px", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text)" }}>👋 {tr({ en: "Hi! I'm your AI Tutor.", my: "မင်္ဂလာပါ! ကျွန်တော် AI ဆရာ ဖြစ်ပါတယ်။", ko: "안녕하세요! 저는 여러분의 AI 튜터예요.", vi: "Xin chào! Tôi là Gia sư AI của bạn." })}</strong><br />
                {lang === "en"
                  ? "I won't give you direct answers — but I'll give you hints and ask guiding questions to help you think it through. Ask me anything about the lesson or homework!"
                  : "တိုက်ရိုက် အဖြေမပေးဘူး — ဒါပေမဲ့ hint နဲ့ မေးခွန်းတွေနဲ့ သင်ကိုယ်တိုင် ရှာဖွေနိုင်အောင် ကူညီပေးမယ်။ သင်ခန်းစာ ဒါမှမဟုတ် အိမ်စာနဲ့ ပတ်သက်ပြီး ဘာမဆို မေးနိုင်တယ်!"}
              </div>
            )}

            {/* Chat messages */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", padding: "4px 0", marginBottom: "12px" }}>
              {tutorHistory.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: "8px" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg,#22c55e,#16a34a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>🎓</div>
                  )}
                  <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: "14px", fontSize: "13.5px", lineHeight: 1.6,
                    background: msg.role === "user" ? "var(--primary)" : "var(--surface-alt)",
                    color: msg.role === "user" ? "#fff" : "var(--text)",
                    borderBottomRightRadius: msg.role === "user" ? "4px" : "14px",
                    borderBottomLeftRadius: msg.role === "assistant" ? "4px" : "14px",
                  }}>
                    <span dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>") }} />
                  </div>
                </div>
              ))}
              {tutorSending && (
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg,#22c55e,#16a34a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>🎓</div>
                  <div style={{ background: "var(--surface-alt)", borderRadius: "14px", borderBottomLeftRadius: "4px", padding: "10px 14px", fontSize: "13px", color: "var(--text-faint)" }}>
                    {tr({ en: "Thinking of a hint...", my: "Hint ပြင်ဆင်နေသည်...", ko: "힌트를 생각하는 중...", vi: "Đang nghĩ gợi ý..." })}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <textarea value={tutorInput} onChange={e => setTutorInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTutorMessage(); } }}
                placeholder={tr({ en: "Ask about the lesson or homework... (Enter to send)", my: "သင်ခန်းစာ ဒါမှမဟုတ် အိမ်စာနဲ့ ပတ်သက်ပြီး မေးပါ...", ko: "수업이나 숙제에 대해 질문하세요... (Enter로 전송)", vi: "Hỏi về bài học hoặc bài tập... (Nhấn Enter để gửi)" })}
                rows={2}
                style={{ flex: 1, border: "1.5px solid var(--border)", borderRadius: "12px", padding: "10px 14px", fontSize: "13px", color: "var(--text)", background: "var(--surface-alt)", fontFamily: "inherit", lineHeight: 1.5, resize: "none", outline: "none" }}
              />
              <button onClick={sendTutorMessage} disabled={!tutorInput.trim() || tutorSending}
                style={{ background: tutorInput.trim() && !tutorSending ? "#22c55e" : "var(--border)", color: "#fff", border: "none", borderRadius: "12px", padding: "10px 16px", fontSize: "18px", cursor: tutorInput.trim() && !tutorSending ? "pointer" : "not-allowed" }}>
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level_Up Chat Modal */}
      {aiModal === "chat" && (
        <div style={overlayStyle} onClick={() => setAiModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "520px", display: "flex", flexDirection: "column", height: levelUpLevel ? "600px" : "auto" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "linear-gradient(135deg,var(--primary),var(--primary-light))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>⚡</div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>Level Up Chat</div>
                {levelUpLevel && <div style={{ fontSize: "11px", color: "#22c55e", fontWeight: 600 }}>
                  ● {levelUpLevel === "beginner"
                    ? tr({ en: "🌱 Beginner", my: "🌱 စတင်သင်", ko: "🌱 초급", vi: "🌱 Mới bắt đầu" })
                    : levelUpLevel === "intermediate"
                    ? tr({ en: "📘 Intermediate", my: "📘 တစ်ဝက်နားလည်", ko: "📘 중급", vi: "📘 Trung cấp" })
                    : tr({ en: "🔥 Advanced", my: "🔥 နားလည်ပြီး", ko: "🔥 고급", vi: "🔥 Nâng cao" })} mode
                </div>}
              </div>
              <button onClick={() => { setAiModal(null); setLevelUpLevel(null); }} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>

            {/* Level selector screen */}
            {!levelUpLevel ? (
              <div>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div style={{ fontSize: "32px", marginBottom: "10px" }}>🎯</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>
                    {tr({ en: "How well do you know this material?", my: "ဒီသင်ခန်းစာနဲ့ ပတ်သက်ပြီး ဘယ်လောက်နားလည်သလဲ?", ko: "이 자료를 얼마나 잘 알고 있나요?", vi: "Bạn hiểu tài liệu này đến mức nào?" })}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)" }}><strong>{selectedMat?.title}</strong></div>
                </div>
                {[
                  { key: "beginner", icon: "🌱",
                    label: tr({ en: "Just starting out", my: "စတင်သင်", ko: "이제 막 시작", vi: "Mới bắt đầu" }),
                    desc: tr({ en: "New to this material — need basic explanations", my: "ဒီသင်ခန်းစာနဲ့ ပထမဆုံးတွေ့ဆုံနေသည်၊ အခြေခံ ရှင်းပြချက်လိုသည်", ko: "이 자료는 처음이에요 — 기본 설명이 필요해요", vi: "Lần đầu tiếp xúc tài liệu này — cần giải thích cơ bản" }),
                    color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)" },
                  { key: "intermediate", icon: "📘",
                    label: tr({ en: "Know the basics", my: "တစ်ဝက်နားလည်", ko: "기본은 알고 있음", vi: "Biết cơ bản" }),
                    desc: tr({ en: "I know some parts but still have gaps", my: "အခြေခံသိသော်လည်း အချို့နေရာများ မရှင်းသေးပါ", ko: "일부는 알지만 아직 부족한 부분이 있어요", vi: "Tôi biết một phần nhưng vẫn còn thiếu sót" }),
                    color: "var(--primary)", bg: "var(--primary-tint)", border: "var(--border)" },
                  { key: "advanced", icon: "🔥",
                    label: tr({ en: "Ready to be challenged", my: "နားလည်ပြီး စစ်ချင်", ko: "도전할 준비가 됨", vi: "Sẵn sàng thử thách" }),
                    desc: tr({ en: "I know it well — give me hard questions", my: "ကောင်းစွာသိပြီး ခက်ခဲသောမေးခွန်းများ ဖြေချင်သည်", ko: "잘 알고 있어요 — 어려운 질문을 주세요", vi: "Tôi hiểu rõ — hãy cho tôi câu hỏi khó" }),
                    color: "#dc2626", bg: "#fff7ed", border: "#fca5a5" },
                ].map(l => (
                  <div key={l.key} onClick={() => startLevelUpChat(l.key)}
                    style={{ background: l.bg, border: `2px solid ${l.border}`, borderRadius: "12px", padding: "16px 18px", marginBottom: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "14px", transition: "transform 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "none"}
                  >
                    <div style={{ fontSize: "28px", flexShrink: 0 }}>{l.icon}</div>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: l.color }}>{l.label}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{l.desc}</div>
                    </div>
                    <div style={{ marginLeft: "auto", color: l.color, fontSize: "18px" }}>›</div>
                  </div>
                ))}
                {chatSending && <div style={{ textAlign: "center", color: "var(--text-faint)", fontSize: "13px", padding: "10px" }}>
                  {tr({ en: "AI is preparing...", my: "AI ပြင်ဆင်နေသည်...", ko: "AI가 준비하는 중...", vi: "AI đang chuẩn bị..." })}
                </div>}
              </div>
            ) : (
            <>
            {/* Chat messages */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", padding: "4px 0", marginBottom: "12px" }}>
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "82%", padding: "10px 14px", borderRadius: "14px", fontSize: "14px", lineHeight: 1.5,
                    background: msg.role === "user" ? "var(--primary)" : "var(--surface-alt)",
                    color: msg.role === "user" ? "#fff" : "var(--text-muted)",
                    borderBottomRightRadius: msg.role === "user" ? "4px" : "14px",
                    borderBottomLeftRadius: msg.role === "assistant" ? "4px" : "14px",
                  }}>
                    <span dangerouslySetInnerHTML={{ __html: msg.content
                      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                      .replace(/\n/g, "<br/>") }} />
                  </div>
                </div>
              ))}
              {chatSending && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ background: "var(--surface-alt)", padding: "10px 14px", borderRadius: "14px", fontSize: "14px", color: "var(--text-faint)" }}>
                    ⚡ {tr({ en: "AI is thinking...", my: "AI တွေးဆနေသည်...", ko: "AI가 생각하는 중...", vi: "AI đang suy nghĩ..." })}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Level badge + change level */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>
                {levelUpLevel === "beginner"
                  ? tr({ en: "🌱 Beginner mode", my: "🌱 စတင်သင် mode", ko: "🌱 초급 모드", vi: "🌱 Chế độ mới bắt đầu" })
                  : levelUpLevel === "intermediate"
                  ? tr({ en: "📘 Intermediate mode", my: "📘 တစ်ဝက်နားလည် mode", ko: "📘 중급 모드", vi: "📘 Chế độ trung cấp" })
                  : tr({ en: "🔥 Advanced mode", my: "🔥 နားလည်ပြီး mode", ko: "🔥 고급 모드", vi: "🔥 Chế độ nâng cao" })}
              </span>
              <button onClick={() => { setLevelUpLevel(null); setChatHistory([]); }} style={{ background: "none", border: "none", fontSize: "11px", color: "var(--primary)", cursor: "pointer", fontWeight: 700 }}>
                {tr({ en: "Change level", my: "Level ပြောင်း", ko: "레벨 변경", vi: "Đổi cấp độ" })}
              </button>
            </div>

            {/* Chat input */}
            <div style={{ display: "flex", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                placeholder={tr({ en: "Type your answer...", my: "မေးခွန်းထည့်ပါ...", ko: "답변을 입력하세요...", vi: "Nhập câu trả lời của bạn..." })}
                style={{ ...inp, flex: 1, borderRadius: "20px" }}
                autoFocus
              />
              <button onClick={sendChat} disabled={chatSending || !chatInput.trim()} style={{ ...btnPrimary, width: "44px", height: "44px", borderRadius: "50%", padding: 0, fontSize: "18px", flexShrink: 0 }}>
                →
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* Add Resource Modal */}
      {resourceModal && (
        <div style={overlayStyle} onClick={() => setResourceModal(false)}>
          <div onClick={e => e.stopPropagation()} style={modalStyle}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", margin: "0 0 20px" }}>📂 Add Resource</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={lbl}>Title *</label>
                <input value={resourceForm.title} onChange={e => setResourceForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Week 1 Reference" style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Link URL</label>
                <input value={resourceForm.url} onChange={e => setResourceForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." style={inp} disabled={!!resourceFile} />
              </div>
              <div style={{ textAlign: "center", color: "var(--text-faint)", fontSize: "13px" }}>— or —</div>
              <div>
                <label style={lbl}>Upload File</label>
                <input type="file" ref={resourceFileRef} onChange={e => setResourceFile(e.target.files[0])} style={{ fontSize: "13px" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button onClick={() => { setResourceModal(false); setResourceFile(null); }} style={{ ...btnOutline, flex: 1 }}>Cancel</button>
              <button onClick={addResource} disabled={resourceAdding || !resourceForm.title.trim()} style={{ ...btnPrimary, flex: 1, opacity: (!resourceForm.title.trim() || resourceAdding) ? 0.6 : 1 }}>
                {resourceAdding ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Assignment — full screen Google Classroom style */}
      {assignModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: "64px", background: "var(--surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button onClick={() => window.history.back()}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", borderRadius: "50%", display: "flex", alignItems: "center" }}><Icon name="multiply" size={18} alt="Close" /></button>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "32px", height: "32px", background: "var(--primary-tint)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="note" size={16} alt="" />
                </div>
                <span style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)" }}>Create assignment</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => createAssignment(true)} disabled={assignCreating || !assignForm.title.trim()}
                style={{ background: "var(--surface-alt)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 20px", fontSize: "13px", fontWeight: 600, cursor: assignCreating || !assignForm.title.trim() ? "not-allowed" : "pointer", opacity: !assignForm.title.trim() ? 0.5 : 1 }}>
                Save draft
              </button>
              <button onClick={() => createAssignment(false)} disabled={assignCreating || !assignForm.title.trim()}
                style={{ background: assignCreating || !assignForm.title.trim() ? "var(--primary-tint)" : "var(--primary)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 24px", fontSize: "14px", fontWeight: 700, cursor: assignCreating || !assignForm.title.trim() ? "not-allowed" : "pointer" }}>
                {assignCreating ? "Posting..." : "Post"}
              </button>
            </div>
          </div>

          {/* Body — 2 column layout */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
            <div style={{ width: "100%", maxWidth: "900px", display: "flex", gap: "20px", alignItems: "flex-start" }}>

              {/* Left — main form */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Title */}
                <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", overflow: "hidden" }}>
                  <input
                    value={assignForm.title}
                    onChange={e => setAssignForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Assignment title"
                    autoFocus
                    style={{ width: "100%", border: "none", outline: "none", fontSize: "22px", fontWeight: 600, color: "var(--text)", padding: "20px 24px", boxSizing: "border-box", background: "transparent" }}
                  />
                </div>

                {/* Instructions */}
                <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "20px 24px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "10px" }}>Instructions (optional)</span>
                  <textarea
                    value={assignForm.instructions}
                    onChange={e => setAssignForm(f => ({ ...f, instructions: e.target.value }))}
                    placeholder="Tell students what to do..."
                    style={{ width: "100%", minHeight: "120px", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", fontSize: "14px", color: "var(--text-muted)", resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit", lineHeight: "1.6" }}
                  />
                </div>

                {/* File attachments */}
                <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "20px 24px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "12px" }}>Attachments (optional)</span>
                  <input ref={assignFileRef} type="file" multiple style={{ display: "none" }}
                    onChange={e => setAssignFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  {assignFiles.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                      {assignFiles.map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px" }}>
                          <Icon name="file" size={18} alt="" />
                          <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          <button onClick={() => setAssignFiles(prev => prev.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", display: "flex" }}><Icon name="multiply" size={14} alt="Remove" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px dashed var(--primary-tint)", borderRadius: "10px", padding: "24px", cursor: "pointer", color: "var(--text-muted)", gap: "6px" }}>
                    <Icon name="attach" size={28} alt="" />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary)" }}>Attach files</span>
                    <input type="file" multiple style={{ display: "none" }}
                      onChange={e => setAssignFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  </label>
                </div>

                {assignError && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "12px 16px", color: "#ef4444", fontSize: "13px" }}>
                    {assignError}
                  </div>
                )}
              </div>

              {/* Right — settings panel */}
              <div style={{ width: "240px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", overflow: "hidden" }}>
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--surface-alt)" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Points</div>
                    <input type="number" min="0" max="1000" value={assignForm.points}
                      onChange={e => setAssignForm(f => ({ ...f, points: e.target.value }))}
                      style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 10px", fontSize: "16px", fontWeight: 700, color: "var(--primary)", outline: "none", textAlign: "center", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Due date</div>
                    <input type="datetime-local" value={assignForm.due_date}
                      onChange={e => setAssignForm(f => ({ ...f, due_date: e.target.value }))}
                      style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 10px", fontSize: "13px", color: "var(--text-muted)", outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Detail Modal */}
      {/* Teacher Assignment Full-Page View */}
      {selectedAssign && isTeacher && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 900, overflowY: "auto" }}>
          {/* Top bar */}
          <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 28px", display: "flex", alignItems: "center", gap: "14px", position: "sticky", top: 0, zIndex: 10 }}>
            <button onClick={() => { setSelectedAssign(null); setAssignDetail(null); setSelectedSubmissionStudent(null); }}
              style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}><Icon name="note" size={16} alt="" /> {selectedAssign.title}</div>
              <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>
                {selectedAssign.due_date ? `Due: ${formatDate(selectedAssign.due_date)}` : "No due date"} • {selectedAssign.points} pts
              </div>
            </div>
            <button onClick={() => openEditAssign(selectedAssign)}
              style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary)", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon name="edit" size={13} alt="" /> Edit
            </button>
          </div>

          {/* Body */}
          <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 0, minHeight: "calc(100vh - 64px)" }}>
            {/* LEFT — student list */}
            <div style={{ background: "var(--surface)", borderRight: "1px solid var(--border)", padding: "16px" }}>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                {[
                  { label: "Submitted", count: assignDetail?.submissions?.length || 0, color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
                  { label: "Missing", count: Math.max(0, (students?.length || 0) - (assignDetail?.submissions?.length || 0)), color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
                  { label: "Graded", count: assignDetail?.submissions?.filter(s => s.status === "graded" || s.status === "returned").length || 0, color: "var(--primary)", bg: "var(--primary-tint)" },
                ].map(stat => (
                  <div key={stat.label} style={{ background: stat.bg, borderRadius: "10px", padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: stat.color }}>{stat.count}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-faint)", marginBottom: "10px", letterSpacing: "0.05em" }}>STUDENTS</div>

              {!assignDetail ? (
                <div style={{ color: "var(--text-faint)", fontSize: "13px", textAlign: "center", padding: "32px" }}>Loading...</div>
              ) : students.map(st => {
                const sub = assignDetail.submissions?.find(s => s.student_id === st.id);
                const isSelected = selectedSubmissionStudent?.id === st.id;
                return (
                  <div key={st.id} onClick={() => setSelectedSubmissionStudent({ ...st, submission: sub || null })}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", cursor: "pointer", marginBottom: "4px", background: isSelected ? "var(--primary-tint)" : "transparent", border: isSelected ? "1.5px solid var(--primary)" : "1.5px solid transparent", transition: "all 0.12s" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: isSelected ? "var(--primary)" : "var(--border)", color: isSelected ? "#fff" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, flexShrink: 0 }}>
                      {st.name[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{st.name}</div>
                      {sub ? (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{formatDate(sub.submitted_at)}</div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#ef4444" }}>Missing</div>
                      )}
                    </div>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", flexShrink: 0,
                      background: !sub ? "rgba(239,68,68,0.1)" : (sub.status === "graded" || sub.status === "returned") ? "var(--primary-tint)" : "rgba(34,197,94,0.12)",
                      color: !sub ? "#ef4444" : (sub.status === "graded" || sub.status === "returned") ? "var(--primary)" : "#22c55e",
                    }}>
                      {!sub ? "Missing" : (sub.status === "graded" || sub.status === "returned") ? `${sub.grade}/${selectedAssign.points}` : "Submitted"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* RIGHT — submission detail */}
            <div style={{ padding: "24px 32px", overflowY: "auto" }}>
              {!selectedSubmissionStudent ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-faint)", gap: "12px" }}>
                  <Icon name="hand-cursor" size={48} alt="" />
                  <div style={{ fontSize: "14px" }}>Select a student to view their submission</div>
                </div>
              ) : !selectedSubmissionStudent.submission ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-faint)", gap: "12px" }}>
                  <Icon name="empty-box" size={48} alt="" />
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-muted)" }}>{selectedSubmissionStudent.name}</div>
                  <div style={{ fontSize: "13px" }}>No submission yet</div>
                </div>
              ) : (() => {
                const sub = selectedSubmissionStudent.submission;
                return (
                  <div>
                    {/* Student header */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 700 }}>
                        {selectedSubmissionStudent.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{selectedSubmissionStudent.name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>Submitted {formatDate(sub.submitted_at)}{sub.status === "late" ? " (Late)" : ""}</div>
                      </div>
                      <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 700, padding: "4px 12px", borderRadius: "20px",
                        background: (sub.status === "graded" || sub.status === "returned") ? "var(--primary-tint)" : "rgba(34,197,94,0.12)",
                        color: (sub.status === "graded" || sub.status === "returned") ? "var(--primary)" : "#22c55e" }}>
                        {(sub.status === "graded" || sub.status === "returned") ? `Graded: ${sub.grade}/${selectedAssign.points}` : "Submitted"}
                      </span>
                    </div>

                    {/* Submission content */}
                    {sub.content && (
                      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "16px", fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.7 }}>
                        {sub.content}
                      </div>
                    )}

                    {/* Files */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
                      {(sub.submission_files?.length > 0 ? sub.submission_files : sub.file_path ? [{ file_name: "Attached file", file_path: sub.file_path }] : []).map((f, fi) => (
                        <a key={fi} href={`http://localhost:5001/uploads/${f.file_path}`} target="_blank" rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--primary)", fontWeight: 600, background: "var(--primary-tint)", padding: "8px 16px", borderRadius: "10px", textDecoration: "none", border: "1px solid var(--border)" }}>
                          <Icon name="attach" size={14} alt="" /> {f.file_name}
                        </a>
                      ))}
                    </div>

                    {/* Grade section */}
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "12px" }}>Grade</div>
                      {(sub.status === "graded" || sub.status === "returned") ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "22px", fontWeight: 800, color: "#22c55e" }}>{sub.grade}</span>
                          <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>/ {selectedAssign.points} pts</span>
                          {sub.grade_comment && <span style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>— {sub.grade_comment}</span>}
                          {sub.status === "graded" && (
                            <button onClick={() => returnSubmission(sub.id)} disabled={returning[sub.id]}
                              style={{ marginLeft: "auto", background: "rgba(34,197,94,0.12)", border: "1px solid #22c55e", color: "#22c55e", borderRadius: "8px", padding: "6px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                              {returning[sub.id] ? "..." : "Return to Student"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          <input type="number" min="0" max={selectedAssign.points}
                            placeholder={`Score (0-${selectedAssign.points})`}
                            value={gradeInputs[sub.id]?.grade ?? ""}
                            onChange={e => setGradeInputs(g => ({ ...g, [sub.id]: { ...g[sub.id], grade: e.target.value } }))}
                            style={{ ...inp, width: "120px" }} />
                          <input type="text" placeholder="Comment (optional)"
                            value={gradeInputs[sub.id]?.comment || ""}
                            onChange={e => setGradeInputs(g => ({ ...g, [sub.id]: { ...g[sub.id], comment: e.target.value } }))}
                            style={{ ...inp, flex: 1, minWidth: "160px" }} />
                          <button onClick={async () => {
                            const grade = parseInt(gradeInputs[sub.id]?.grade);
                            if (isNaN(grade)) return;
                            setGrading(g => ({ ...g, [sub.id]: true }));
                            try {
                              await API.post(`/classroom/submissions/${sub.id}/grade`, { grade, comment: gradeInputs[sub.id]?.comment || "" });
                              const { data } = await API.get(`/classroom/assignments/${selectedAssign.id}`);
                              setAssignDetail(data);
                              setSelectedSubmissionStudent(prev => ({ ...prev, submission: data.submissions?.find(s => s.student_id === prev.id) || prev.submission }));
                            } catch (err) { console.error(err); }
                            finally { setGrading(g => ({ ...g, [sub.id]: false })); }
                          }} disabled={grading[sub.id]} style={{ ...btnPrimary, padding: "10px 20px" }}>
                            {grading[sub.id] ? "..." : "Grade"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Private comment */}
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" }}>
                      <SubmissionComments
                        assignId={selectedAssign.id}
                        studentId={selectedSubmissionStudent.id}
                        studentName={selectedSubmissionStudent.name}
                        myName={myName}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Student Assignment Modal (non-teacher) */}
      {selectedAssign && !isTeacher && (
        <div style={overlayStyle} onClick={() => setSelectedAssign(null)}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, width: "600px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: "8px" }}><Icon name="note" size={17} alt="" /> {selectedAssign.title}</h2>
                <div style={{ fontSize: "12px", color: "var(--text-faint)" }}>
                  {selectedAssign.due_date ? `Due: ${formatDate(selectedAssign.due_date)}` : "No due date"} • {selectedAssign.points} pts
                </div>
              </div>
              <button onClick={() => setSelectedAssign(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "var(--text-faint)" }}>×</button>
            </div>
            {selectedAssign.instructions && (
              <div style={{ background: "var(--bg)", borderRadius: "10px", padding: "14px", marginBottom: "12px", fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                {selectedAssign.instructions}
              </div>
            )}
            {selectedAssign.files?.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px" }}>ATTACHMENTS</div>
                {selectedAssign.files.map(f => (
                  <a key={f.id} href={`http://localhost:5001/uploads/${f.file_path}`} target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--primary)", fontWeight: 600, background: "var(--primary-tint)", padding: "6px 12px", borderRadius: "8px", textDecoration: "none", border: "1px solid var(--border)", marginRight: "8px", marginBottom: "4px" }}>
                    <Icon name="file" size={14} alt="" /> {f.file_name}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload / Edit Material Modal — full screen Google Classroom style */}
      {uploadModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: "64px", background: "var(--surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button onClick={closeUploadModal}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", borderRadius: "50%", display: "flex", alignItems: "center" }}><Icon name="multiply" size={18} alt="Close" /></button>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "32px", height: "32px", background: "var(--primary)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="file" size={16} alt="" style={{ filter: "brightness(0) invert(1)" }} />
                </div>
                <span style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)" }}>{materialEditId ? "Edit material" : "Create material"}</span>
              </div>
            </div>
            <button onClick={handleUpload} disabled={uploading || !uploadForm.title.trim()}
              style={{ background: uploading || !uploadForm.title.trim() ? "var(--primary-tint)" : "var(--primary)", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 24px", fontSize: "14px", fontWeight: 700, cursor: uploading || !uploadForm.title.trim() ? "not-allowed" : "pointer", transition: "background 0.2s" }}>
              {uploading ? "Saving..." : materialEditId ? "Save Changes" : "Post"}
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
            <div style={{ width: "100%", maxWidth: "720px", display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Title */}
              <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
                <input
                  value={uploadForm.title}
                  onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Title"
                  autoFocus
                  style={{ flex: 1, border: "none", outline: "none", fontSize: "15px", fontWeight: 600, color: "var(--text)", background: "transparent", minWidth: 0 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <span style={{ fontSize: "11px", color: "var(--text-faint)", fontWeight: 600 }}>WEEK</span>
                  <input type="number" min="1" max="20" value={uploadForm.week}
                    onChange={e => setUploadForm(f => ({ ...f, week: e.target.value }))}
                    style={{ width: "52px", border: "1px solid var(--border)", borderRadius: "6px", padding: "4px 8px", fontSize: "13px", fontWeight: 600, color: "var(--primary)", textAlign: "center", outline: "none" }} />
                </div>
              </div>

              {/* YouTube suggestions */}
              <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="video" size={13} alt="" /> Related YouTube Videos</span>
                    <span style={{ fontSize: "11px", color: "var(--text-faint)", marginLeft: "8px" }}>{tr({ en: "AI reads PDF or search by topic", my: "PDF ဖတ်ပြီး AI ညွှန်းသည် / topic ရိုက်ထည့်ပြီး ရှာနိုင်သည်", ko: "AI가 PDF를 읽거나 주제로 검색합니다", vi: "AI đọc PDF hoặc tìm theo chủ đề" })}</span>
                  </div>
                  {uploadFile && (
                    <button
                      onClick={() => handleSuggestVideos(undefined, true)}
                      disabled={suggestingVideos}
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        background: suggestingVideos ? "var(--surface-alt)" : "#fff7ed",
                        color: "#ea580c", border: "1px solid #fed7aa",
                        borderRadius: "20px", padding: "5px 14px",
                        fontSize: "12px", fontWeight: 700,
                        cursor: suggestingVideos ? "not-allowed" : "pointer",
                        flexShrink: 0,
                      }}>
                      {suggestingVideos ? <><Icon name="hourglass" size={14} alt="" /> Searching...</> : <><Icon name="refresh" size={14} alt="" /> Re-search</>}
                    </button>
                  )}
                </div>

                {/* Manual prompt search row */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <input
                    value={ytPromptQuery}
                    onChange={e => setYtPromptQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && ytPromptQuery.trim() && !suggestingVideos) handleSuggestVideos(null, false); }}
                    placeholder={tr({ en: "Search YouTube by topic (e.g. Korean grammar beginner)...", my: "Topic ရိုက်ပြီး YouTube ရှာပါ (ဥပမာ English grammar A2)...", ko: "주제로 YouTube 검색 (예: 한국어 문법 초급)...", vi: "Tìm YouTube theo chủ đề (vd: ngữ pháp tiếng Hàn cơ bản)..." })}
                    style={{ flex: 1, border: "1.5px solid var(--border)", borderRadius: "10px", padding: "9px 14px", fontSize: "13px", color: "var(--text)", background: "var(--surface-alt)", outline: "none", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={() => { if (ytPromptQuery.trim() && !suggestingVideos) handleSuggestVideos(null, false); }}
                    disabled={!ytPromptQuery.trim() || suggestingVideos}
                    style={{ background: !ytPromptQuery.trim() || suggestingVideos ? "var(--surface-alt)" : "var(--primary)", color: !ytPromptQuery.trim() || suggestingVideos ? "var(--text-faint)" : "#fff", border: "none", borderRadius: "10px", padding: "9px 18px", fontSize: "12px", fontWeight: 700, cursor: !ytPromptQuery.trim() || suggestingVideos ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                    {suggestingVideos ? "Searching..." : tr({ en: "Search", my: "ရှာမည်", ko: "검색", vi: "Tìm kiếm" })}
                  </button>
                </div>

                {/* Language hint row */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: (suggestedVideos.length > 0 || suggestingVideos) ? "14px" : "8px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-faint)", flexShrink: 0 }}>{tr({ en: "Video language:", my: "Video ဘာသာစကား:", ko: "영상 언어:", vi: "Ngôn ngữ video:" })}</span>
                  {[{ label: "ENG", value: "English" }, { label: "KOR", value: "Korean" }].map(btn => (
                    <button key={btn.value} onClick={() => setYtLanguageHint(btn.value)}
                      style={{
                        fontSize: "11px", fontWeight: 700,
                        padding: "3px 12px", borderRadius: "14px",
                        border: `1px solid ${ytLanguageHint === btn.value ? "var(--primary)" : "var(--border)"}`,
                        background: ytLanguageHint === btn.value ? "var(--primary)" : "var(--surface-alt)",
                        color: ytLanguageHint === btn.value ? "#fff" : "var(--text-muted)",
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                      {btn.label}
                    </button>
                  ))}
                </div>
                {suggestingVideos && (
                  <div style={{ display: "flex", gap: "10px" }}>
                    {[1,2,3].map(i => (
                      <div key={i} style={{ flex: 1, borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
                        <div style={{ height: "80px", background: "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.1))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>▶</div>
                        <div style={{ padding: "8px", background: "var(--surface-alt)" }}>
                          <div style={{ height: "8px", background: "var(--border)", borderRadius: "4px", marginBottom: "4px" }} />
                          <div style={{ height: "6px", background: "var(--border)", borderRadius: "4px", width: "70%" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {suggestedVideos.length > 0 && (
                  <div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "nowrap", overflowX: "auto", paddingBottom: "4px" }}>
                      {suggestedVideos.map((v, i) => {
                        const isSelected = selectedVideoUrls.has(v.url);
                        return (
                          <div key={i} onClick={() => setSelectedVideoUrls(prev => {
                            const next = new Set(prev);
                            isSelected ? next.delete(v.url) : next.add(v.url);
                            return next;
                          })}
                            style={{ flex: "0 0 200px", borderRadius: "8px", overflow: "hidden", border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`, cursor: "pointer", display: "block", transition: "border-color 0.15s, box-shadow 0.15s", boxShadow: isSelected ? "0 0 0 3px rgba(59,55,204,0.15)" : "none", userSelect: "none" }}>
                            <div style={{ position: "relative" }}>
                              {v.thumbnail ? (
                                <img src={v.thumbnail} alt={v.title} style={{ width: "100%", height: "112px", objectFit: "cover", display: "block" }} />
                              ) : (
                                <div style={{ height: "112px", background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", color: "#fff" }}>▶</div>
                              )}
                              <div style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "2px 5px", borderRadius: "4px" }}>YouTube</div>
                              {isSelected && (
                                <div style={{ position: "absolute", top: "6px", left: "6px", background: "var(--primary)", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="checkmark" size={12} alt="" style={{ filter: "brightness(0) invert(1)" }} /></div>
                              )}
                            </div>
                            <div style={{ padding: "8px 10px", background: isSelected ? "rgba(59,55,204,0.06)" : "var(--surface)" }}>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text)", lineHeight: 1.4, marginBottom: "3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
                              <div style={{ fontSize: "10px", color: "var(--text-faint)" }}>{v.channel}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                      <div style={{ fontSize: "11px", color: selectedVideoUrls.size > 0 ? "var(--primary)" : "var(--text-faint)", display: "flex", alignItems: "center", gap: "5px" }}>
                        {selectedVideoUrls.size > 0
                          ? <><Icon name="checkmark" size={11} alt="" /> {tr({
                              en: `${selectedVideoUrls.size} video selected — will be added to lesson on post`,
                              my: `${selectedVideoUrls.size} video ရွေးထားသည် — post လုပ်သောအခါ lesson မှာ ထည့်သွင်းမည်`,
                              ko: `${selectedVideoUrls.size}개 영상 선택됨 — 게시 시 수업에 추가됩니다`,
                              vi: `Đã chọn ${selectedVideoUrls.size} video — sẽ được thêm vào bài học khi đăng`,
                            })}</>
                          : tr({
                              en: "Click a video to select — chosen ones will be added to the lesson",
                              my: "Video ကို နှိပ်ပြီး ရွေးပါ — ကြိုက်သောဟာကို lesson မှာ ထည့်နိုင်သည်",
                              ko: "영상을 클릭해 선택하세요 — 선택한 영상이 수업에 추가됩니다",
                              vi: "Nhấp vào video để chọn — video đã chọn sẽ được thêm vào bài học",
                            })}
                      </div>
                      {selectedVideoUrls.size > 0 && (
                        <button onClick={() => setSelectedVideoUrls(new Set())}
                          style={{ fontSize: "10px", color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", padding: "0" }}>
                          {tr({ en: "Clear", my: "ဖျက်မည်", ko: "지우기", vi: "Xóa" })}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {!suggestingVideos && suggestedVideos.length === 0 && (
                  <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Icon name="file" size={16} alt="" />
                    {tr({
                      en: "Upload a PDF and AI will read it to automatically suggest matching YouTube videos",
                      my: "PDF file တင်လိုက်တာနဲ့ AI က file အကြောင်းကို ဖတ်ပြီး သင်ခန်းစာနဲ့ ကိုက်ညီတဲ့ YouTube videos အလိုအလျောက် ညွှန်းပေးမည်",
                      ko: "PDF를 업로드하면 AI가 내용을 읽고 관련 YouTube 영상을 자동으로 추천합니다",
                      vi: "Tải lên PDF, AI sẽ đọc nội dung và tự động đề xuất video YouTube phù hợp",
                    })}
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>Instructions for students</span>
                    <span style={{ fontSize: "11px", color: "var(--text-faint)", marginLeft: "8px" }}>{tr({ en: "AI reads the syllabus and writes for you", my: "AI က သင်ရိုးကြည့်ပြီး ရေးပေးမည်", ko: "AI가 강의 계획서를 읽고 작성해 드립니다", vi: "AI sẽ đọc giáo trình và soạn giúp bạn" })}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex", borderRadius: "20px", overflow: "hidden", border: "1px solid var(--border)" }}>
                      {["en", "ko"].map(lang => (
                        <button key={lang} onClick={() => {
                          setInstructionLang(lang);
                          if (uploadFile && !generatingInstructions) handleGenerateInstructions(lang);
                        }}
                          style={{ padding: "4px 12px", fontSize: "11px", fontWeight: 700, border: "none", cursor: "pointer", background: instructionLang === lang ? "var(--primary)" : "var(--surface)", color: instructionLang === lang ? "#fff" : "var(--text-faint)", transition: "background 0.15s" }}>
                          {lang === "en" ? "ENG" : "KOR"}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleGenerateInstructions}
                      disabled={generatingInstructions || !uploadFile}
                      title={!uploadFile ? tr({ en: "Upload a PDF first", my: "PDF တင်မှ အသုံးပြုနိုင်မည်", ko: "먼저 PDF를 업로드하세요", vi: "Vui lòng tải PDF lên trước" }) : ""}
                      style={{ display: "flex", alignItems: "center", gap: "6px", background: generatingInstructions ? "var(--surface-alt)" : !uploadFile ? "var(--surface-alt)" : "var(--primary-tint)", color: !uploadFile ? "var(--text-faint)" : "var(--primary)", border: `1px solid ${!uploadFile ? "var(--border)" : "var(--primary-tint)"}`, borderRadius: "20px", padding: "5px 14px", fontSize: "12px", fontWeight: 700, cursor: (generatingInstructions || !uploadFile) ? "not-allowed" : "pointer", opacity: !uploadFile ? 0.6 : 1 }}>
                      {generatingInstructions ? (
                        <><Icon name="hourglass" size={14} alt="" /> Generating...</>
                      ) : (
                        <><Icon name={!uploadFile ? "lock" : "sparkling"} size={14} alt="" /> Generate with AI</>
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  value={uploadForm.instructions}
                  onChange={e => setUploadForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="Add instructions for your students..."
                  style={{ width: "100%", minHeight: "120px", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", fontSize: "14px", color: "var(--text-muted)", resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit", lineHeight: "1.6" }}
                />
              </div>

              {/* File upload */}
              <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "20px 24px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "12px" }}>Attach PDF (optional)</span>
                {uploadFile ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 16px" }}>
                    <Icon name="file" size={24} alt="" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{uploadFile.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-faint)" }}>{(uploadFile.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <button onClick={() => {
                      setUploadFile(null); if (fileRef.current) fileRef.current.value = "";
                      videoSearchSeq.current++; setSuggestedVideos([]); setYtNextPageToken(null);
                    }}
                      style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", display: "flex" }}><Icon name="multiply" size={16} alt="Remove" /></button>
                  </div>
                ) : (
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px dashed var(--primary-tint)", borderRadius: "10px", padding: "32px", cursor: "pointer", color: "var(--text-muted)", gap: "8px" }}>
                    <Icon name="attach" size={32} alt="" />
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>Click to attach a PDF</span>
                    <span style={{ fontSize: "12px", color: "var(--text-faint)" }}>PDF files only</span>
                    <input type="file" accept="application/pdf" ref={fileRef} onChange={e => {
                      const f = e.target.files[0];
                      if (!f) return;
                      setUploadFile(f);
                      setSuggestedVideos([]);
                      setYtNextPageToken(null);
                      cachedInstructionText.current = "";
                      handleSuggestVideos(f);
                    }} style={{ display: "none" }} />
                  </label>
                )}
              </div>

              {/* Additional attachments */}
              <div style={{ background: "var(--surface)", borderRadius: "12px", border: "1px solid var(--border)", padding: "20px 24px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "12px" }}>Additional attachments (optional)</span>

                {materialEditId && selectedMat?.files?.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                    {selectedMat.files.map(f => (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: deleteAttachmentIds.includes(f.id) ? "var(--text-faint)" : "var(--text-muted)", background: deleteAttachmentIds.includes(f.id) ? "#fef2f2" : "var(--surface-alt)", padding: "8px 12px", borderRadius: "8px", border: `1px solid ${deleteAttachmentIds.includes(f.id) ? "#fca5a5" : "var(--border)"}`, textDecoration: deleteAttachmentIds.includes(f.id) ? "line-through" : "none" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="file" size={14} alt="" /> {f.file_name}</span>
                        <button type="button" onClick={() => setDeleteAttachmentIds(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                          style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "12px", color: deleteAttachmentIds.includes(f.id) ? "#22c55e" : "#ef4444" }}>
                          {deleteAttachmentIds.includes(f.id) ? "↩ Restore" : "× Remove"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadExtraFiles.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                    {uploadExtraFiles.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "var(--text)", background: "#f8f9ff", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--primary-tint)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><Icon name="attach" size={14} alt="" /> {f.name}</span>
                        <button type="button" onClick={() => setUploadExtraFiles(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", display: "flex" }}><Icon name="multiply" size={12} alt="Remove" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <input ref={extraFileRef} type="file" multiple style={{ display: "none" }}
                  onChange={e => {
                    const picked = Array.from(e.target.files);
                    setUploadExtraFiles(prev => [...prev, ...picked]);
                    e.target.value = "";
                  }} />
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => extraFileRef.current?.click()}
                    style={{ fontSize: "13px", color: "var(--primary)", background: "var(--primary-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}>
                    + Add files
                  </button>
                  {!materialEditId && !linkedAssign && (
                    <button type="button" onClick={() => setLinkedAssign({ title: "", due_date: "", points: 100 })}
                      style={{ fontSize: "13px", color: "#0F9D6E", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}>
                      + Assignment
                    </button>
                  )}
                </div>

                {/* Inline assignment form */}
                {linkedAssign && (
                  <div style={{ marginTop: "14px", background: "var(--surface-alt)", border: "1px solid #86EFAC", borderRadius: "12px", padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F9D6E" }}>📋 Linked Assignment</span>
                      <button type="button" onClick={() => setLinkedAssign(null)}
                        style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <input
                        placeholder="Assignment title *"
                        value={linkedAssign.title}
                        onChange={e => setLinkedAssign(p => ({ ...p, title: e.target.value }))}
                        style={{ padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13px", outline: "none" }}
                      />
                      <div style={{ display: "flex", gap: "10px" }}>
                        <input
                          type="date"
                          value={linkedAssign.due_date}
                          onChange={e => setLinkedAssign(p => ({ ...p, due_date: e.target.value }))}
                          style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13px", outline: "none" }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: "0 0 auto" }}>
                          <input
                            type="number"
                            min="1"
                            value={linkedAssign.points}
                            onChange={e => setLinkedAssign(p => ({ ...p, points: e.target.value }))}
                            style={{ width: "72px", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "13px", outline: "none" }}
                          />
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>pts</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {uploadError && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "12px 16px", color: "#ef4444", fontSize: "13px" }}>
                  {uploadError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

