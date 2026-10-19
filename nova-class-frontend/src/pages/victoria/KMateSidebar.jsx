import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLang } from "../../LanguageContext";
import { useTheme } from "../../ThemeContext";
import Icon from "../../components/Icon";

// The K_MATE page's own left bar: the ☰ button opens it and folds it down to a narrow strip, and the room in
// the middle is for K_MATE's own tools (pass them as `children`). Dashboard / Classroom / Exam mode / Settings
// sit at the bottom as icons. It follows the app's light / dark theme (the Homework Coach has its own dark one).
const COLLAPSE_KEY = "kmate_topik_sidebar_collapsed";
const NAV_ITEMS = [
  { path: "/", icon: "dashboard", key: "dashboard" },
  { path: "/classroom", icon: "graduation-cap", key: "classroom" },
  { path: "/exam", icon: "exam", key: "examMode" },
  { path: "/settings", icon: "settings", key: "settings" },
];

function readCollapsed() {
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    return saved === null ? window.innerWidth < 900 : saved === "1";
  } catch {
    return false;
  }
}

export default function KMateSidebar({ children }) {
  const { t } = useLang();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const userName = localStorage.getItem("nova_name") || "Student";
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* the choice just is not remembered */ }
      return !c;
    });
  }

  function logout() {
    ["nova_token", "nova_name", "nova_role", "nova_email"].forEach(key => localStorage.removeItem(key));
    navigate("/login");
  }

  return (
    <aside style={{ ...k.sidebar, width: collapsed ? 68 : 272 }} aria-label="K_MATE">
      <div style={{ ...k.head, justifyContent: collapsed ? "center" : "flex-start" }}>
        <button
          type="button"
          style={k.iconBtn}
          onClick={toggle}
          aria-label={collapsed ? t("coachExpand") : t("coachCollapse")}
          aria-expanded={!collapsed}
          title={collapsed ? t("coachExpand") : t("coachCollapse")}
        >☰</button>
        {!collapsed && <span style={k.brand}>Nova Class</span>}
      </div>

      <div style={k.slot} data-testid="kmate-sidebar-slot">{children}</div>

      <nav style={{ ...k.navRow, flexDirection: collapsed ? "column" : "row" }} aria-label="Pages">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.path} to={item.path} end={item.path === "/"} style={k.navLink} title={t(item.key)} aria-label={t(item.key)}>
            <Icon name={item.icon} size={18} alt="" />
          </NavLink>
        ))}
      </nav>

      <div style={{ ...k.foot, flexDirection: collapsed ? "column" : "row" }}>
        <div style={k.avatar} title={userName}>{userName[0]?.toUpperCase()}</div>
        {!collapsed && <span style={k.userName}>{userName}</span>}
        <button
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          style={k.themeSwitch}
          onClick={toggleTheme}
          title={theme === "dark" ? t("coachLightMode") : t("coachDarkMode")}
          aria-label={t("coachDarkMode")}
        >
          <span style={{ ...k.themeKnob, left: theme === "dark" ? "15px" : "2px" }} />
        </button>
        {!collapsed && <button type="button" style={k.logoutBtn} onClick={logout}>{t("logout")}</button>}
      </div>
    </aside>
  );
}

const k = {
  sidebar: { position: "sticky", top: 0, alignSelf: "flex-start", height: "100vh", flexShrink: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px", padding: "14px 12px", background: "var(--surface)", borderRight: "1px solid var(--border)", transition: "width .18s ease", overflow: "hidden" },
  head: { display: "flex", alignItems: "center", gap: "10px", minHeight: "40px" },
  iconBtn: { width: "40px", height: "40px", borderRadius: "10px", border: "1px solid transparent", background: "transparent", color: "var(--text)", fontSize: "20px", cursor: "pointer", flexShrink: 0 },
  brand: { fontWeight: 700, fontSize: "16px", color: "var(--primary)", whiteSpace: "nowrap" },
  slot: { flex: 1, minHeight: 0, overflowY: "auto" },
  navRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", paddingTop: "10px", borderTop: "1px solid var(--border)" },
  navLink: { width: "38px", height: "38px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: "var(--surface-alt)", border: "1px solid var(--border)" },
  foot: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", paddingTop: "4px" },
  avatar: { width: "34px", height: "34px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 },
  userName: { flex: 1, minWidth: 0, fontSize: "14px", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  themeSwitch: { position: "relative", width: "32px", height: "18px", borderRadius: "9px", border: "none", background: "var(--border)", cursor: "pointer", flexShrink: 0, padding: 0 },
  themeKnob: { position: "absolute", top: "2px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left .15s" },
  logoutBtn: { border: "none", background: "transparent", color: "var(--danger)", fontSize: "12px", fontWeight: 700, cursor: "pointer" },
};
