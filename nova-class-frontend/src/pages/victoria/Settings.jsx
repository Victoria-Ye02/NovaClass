import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import { useLang } from "../../LanguageContext";
import { useTheme } from "../../ThemeContext";
import API from "../../services/api";
import TeacherVoiceCard from "./TeacherVoiceCard";

// The API reports failures as { error: "..." }; anything without a response
// never reached the server (a plain "failed" message would blame the wrong thing).
function apiErrorText(err, fallback) {
  if (!err.response) return "Cannot reach the server. Is the backend running?";
  return err.response.data?.error || fallback;
}

export default function Settings() {
  const [name, setName] = useState(localStorage.getItem("nova_name") || "Student");
  const [notif, setNotif]   = useState(true);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");
  const [deleting, setDeleting] = useState(false);
  const { lang, changeLang, t } = useLang();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  async function save() {
    setError(""); setSaved(false);
    try {
      const res = await API.put("/auth/me", { name: name.trim() });
      localStorage.setItem("nova_name", res.data.name);
      setName(res.data.name);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(apiErrorText(err, t("couldntSave")));
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(t("confirmDeleteAccount"));
    if (!confirmed) return;

    setError(""); setDeleting(true);
    try {
      await API.delete("/auth/me");
      localStorage.removeItem("nova_token");
      localStorage.removeItem("nova_name");
      localStorage.removeItem("nova_role");
      localStorage.removeItem("nova_email");
      navigate("/login");
    } catch (err) {
      setError(apiErrorText(err, t("couldntDeleteAccount")));
      setDeleting(false);
    }
  }

  return (
    <div style={s.layout}>
      <Sidebar />
      <main style={s.main}>
        <div style={s.topbar}>
          <div>
            <h2 style={s.title}>⚙️ {t("settingsTitle")}</h2>
            <p style={s.sub}>{t("manageAccountPrefs")}</p>
          </div>
        </div>

        <div style={s.grid}>
          {/* Profile */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>👤 {t("profile")}</h3>
            <div style={s.avatarRow}>
              <div style={s.bigAvatar}>{name[0]?.toUpperCase()}</div>
              <div>
                <div style={s.profileName}>{name}</div>
                <div style={s.profileRole}>{t("student")} · TOPIK II</div>
              </div>
            </div>
            <div style={s.field}>
              <label style={s.label}>{t("displayName")}</label>
              <input style={s.inp} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input style={s.inp} placeholder="your@email.com" type="email" />
            </div>
          </div>

          {/* Language */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>🌐 {t("appLanguage")}</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>{t("languageDesc")}</p>

            <div style={s.langRow}>
              {[
                { code: "en", flag: "🇬🇧", label: "English" },
                { code: "my", flag: "🇲🇲", label: "မြန်မာ" },
                { code: "ko", flag: "🇰🇷", label: "한국어" },
                { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" },
              ].map(l => (
                <div key={l.code}
                  onClick={() => changeLang(l.code)}
                  style={{
                    ...s.langCard,
                    border: lang === l.code ? "2.5px solid var(--primary)" : "2px solid var(--border)",
                    background: lang === l.code ? "var(--primary-tint)" : "var(--surface-alt)",
                  }}>
                  <div style={{ fontSize: "30px" }}>{l.flag}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: lang === l.code ? "var(--primary)" : "var(--text-muted)", marginTop: "8px" }}>{l.label}</div>
                  {lang === l.code && <div style={s.langCheck}>✓</div>}
                </div>
              ))}
            </div>

            <div style={{ ...s.toggleRow, marginTop: "20px" }}>
              <div>
                <div style={s.toggleLabel}>{t("notifications")}</div>
                <div style={s.toggleSub}>{t("notificationsDesc")}</div>
              </div>
              <div style={{ ...s.toggle, background: notif ? "var(--primary)" : "var(--border)" }}
                onClick={() => setNotif(!notif)}>
                <div style={{ ...s.toggleThumb, transform: notif ? "translateX(20px)" : "translateX(0)" }} />
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>🎨 {t("appearance")}</h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              {t("appearanceDesc")}
            </p>
            <div style={s.langRow}>
              {[
                { code: "light", icon: "☀️", label: t("light") },
                { code: "dark", icon: "🌙", label: t("dark") },
              ].map(o => (
                <div key={o.code}
                  onClick={() => { if (theme !== o.code) toggleTheme(); }}
                  style={{
                    ...s.langCard,
                    border: theme === o.code ? "2.5px solid var(--primary)" : "2px solid var(--border)",
                    background: theme === o.code ? "var(--primary-tint)" : "var(--surface-alt)",
                  }}>
                  <div style={{ fontSize: "30px" }}>{o.icon}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: theme === o.code ? "var(--primary)" : "var(--text-muted)", marginTop: "8px" }}>{o.label}</div>
                  {theme === o.code && <div style={s.langCheck}>✓</div>}
                </div>
              ))}
            </div>
          </div>

          {/* The teacher's own voice for the lessons */}
          <TeacherVoiceCard cardStyle={s.card} titleStyle={s.cardTitle} />

          {/* TOPIK Level */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>🎯 TOPIK Target</h3>
            <div style={s.levelGrid}>
              {["Level 3","Level 4","Level 5","Level 6"].map((l, i) => (
                <div key={i} style={{ ...s.levelCard, ...(i === 1 ? s.levelActive : {}) }}>
                  <div style={s.levelNum}>{i+3}</div>
                  <div style={s.levelName}>{l}</div>
                  {i === 1 && <div style={s.levelBadge}>Current Goal</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Account */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>🔐 {t("account")}</h3>
            <div style={s.field}>
              <label style={s.label}>{t("currentPassword")}</label>
              <input style={s.inp} type="password" placeholder="••••••••" />
            </div>
            <div style={s.field}>
              <label style={s.label}>{t("newPassword")}</label>
              <input style={s.inp} type="password" placeholder="••••••••" />
            </div>
            <div style={s.dangerZone}>
              <div style={s.dangerTitle}>⚠️ {t("dangerZone")}</div>
              <button style={s.dangerBtn} onClick={deleteAccount} disabled={deleting}>
                {deleting ? t("deletingAccount") : t("deleteAccountBtn")}
              </button>
            </div>
          </div>
        </div>

        <div style={s.saveRow}>
          {error && <span style={s.errorMsg}>⚠️ {error}</span>}
          {saved && <span style={s.savedMsg}>✅ {t("settingsSaved")}</span>}
          <button style={s.saveBtn} onClick={save}>{t("saveChanges")}</button>
        </div>
      </main>
    </div>
  );
}

const s = {
  layout: { display: "flex", minHeight: "100vh", background: "var(--bg)" },
  main: { marginLeft: "240px", flex: 1, padding: "24px 32px" },
  topbar: { marginBottom: "24px" },
  title: { fontSize: "22px", fontWeight: 700, color: "var(--text)" },
  sub: { fontSize: "13px", color: "var(--text-muted)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "20px", marginBottom: "24px" },
  card: { background: "var(--surface)", borderRadius: "14px", padding: "24px", border: "1px solid var(--border)" },
  cardTitle: { fontSize: "16px", fontWeight: 700, marginBottom: "20px", color: "var(--text)" },
  avatarRow: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" },
  bigAvatar: { width: "56px", height: "56px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 700 },
  profileName: { fontSize: "18px", fontWeight: 700, color: "var(--text)" },
  profileRole: { fontSize: "13px", color: "var(--text-muted)" },
  field: { marginBottom: "16px" },
  label: { display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" },
  inp: { width: "100%", padding: "10px 14px", border: "1.5px solid var(--border)", borderRadius: "10px", fontSize: "14px", color: "var(--text)", background: "var(--surface-alt)", boxSizing: "border-box" },
  langRow: { display: "flex", gap: "12px" },
  langCard: { flex: 1, borderRadius: "12px", padding: "20px 16px", textAlign: "center", cursor: "pointer", position: "relative", transition: "all 0.15s" },
  langCheck: { position: "absolute", top: "8px", right: "10px", color: "var(--primary)", fontWeight: 800, fontSize: "14px" },
  toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--border)" },
  toggleLabel: { fontSize: "14px", fontWeight: 600, color: "var(--text)" },
  toggleSub: { fontSize: "12px", color: "var(--text-faint)" },
  toggle: { width: "44px", height: "24px", borderRadius: "12px", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 },
  toggleThumb: { position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "transform 0.2s" },
  levelGrid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "12px" },
  levelCard: { border: "2px solid var(--border)", borderRadius: "10px", padding: "16px", textAlign: "center", cursor: "pointer" },
  levelActive: { border: "2px solid var(--primary)", background: "var(--primary-tint)" },
  levelNum: { fontSize: "28px", fontWeight: 800, color: "var(--primary)" },
  levelName: { fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" },
  levelBadge: { background: "var(--primary)", color: "#fff", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: 700, marginTop: "6px", display: "inline-block" },
  dangerZone: { marginTop: "20px", padding: "16px", background: "rgba(239,68,68,0.08)", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.35)" },
  dangerTitle: { fontSize: "13px", fontWeight: 700, color: "#dc2626", marginBottom: "8px" },
  dangerBtn: { padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  saveRow: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "16px" },
  savedMsg: { fontSize: "14px", color: "#10b981", fontWeight: 600 },
  errorMsg: { fontSize: "14px", color: "#dc2626", fontWeight: 600 },
  saveBtn: { background: "var(--primary)", color: "#fff", padding: "12px 28px", borderRadius: "10px", fontSize: "15px", fontWeight: 700, border: "none", cursor: "pointer" },
};
