import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useLang } from "../LanguageContext";
import { useTheme } from "../ThemeContext";
import Icon from "./Icon";

// `dark` lets a page (currently K_MATE's Code Assistant mode) force the
// Devline dark-IDE palette on the sidebar without touching every other page,
// which still follows the app's normal light/dark theme toggle.
// TOPIK Hub opens a short list of its own pages. "Old Questions" is the past-paper exam (kept at /exam).
const HUB_ITEMS = [
  { path: "/topik-hub/grammar",     icon: "book",   key: "hubGrammar" },
  { path: "/topik-hub/booster",     icon: "flash-on", key: "hubBooster" },
  { path: "/topik-hub/smart-drill", icon: "target", key: "hubSmartDrill" },
  { path: "/exam",                  icon: "note",   key: "hubOldQuestions" },
];

export default function Sidebar({ dark }) {
  const navigate = useNavigate();
  const name = localStorage.getItem("nova_name") || "Student";
  const { t } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const inHub = HUB_ITEMS.some(h => pathname === h.path || pathname.startsWith(`${h.path}/`));
  const [hubOpen, setHubOpen] = useState(inHub);

  const navItems = [
    { path: "/",         icon: "dashboard",      key: "dashboard"  },
    { path: "/classroom",icon: "graduation-cap", key: "classroom"  },
    { path: "/kmate",    icon: "bot",            key: "kmate"      },
    { key: "topikHub", icon: "exam", children: HUB_ITEMS },
    { path: "/settings", icon: "settings",       key: "settings"   },
  ];

  function logout() {
    localStorage.removeItem("nova_token");
    localStorage.removeItem("nova_name");
    localStorage.removeItem("nova_role");
    localStorage.removeItem("nova_email");
    navigate("/login");
  }

  const c = dark ? darkPalette : null;

  return (
    <aside style={{ ...styles.sidebar, ...(c ? { background: c.panelBg, borderRight: `1px solid ${c.borderColor}` } : {}) }}>
      <div style={{ ...styles.logo, ...(c ? { borderBottom: `1px solid ${c.borderColor}` } : {}) }}>
        <span style={{ ...styles.logoText, ...(c ? { color: c.textColor } : {}) }}>Nova Class</span>
        <span style={{ ...styles.logoSub, ...(c ? { color: c.mutedTextColor } : {}) }}>Educational Portal</span>
      </div>

      <nav style={styles.nav}>
        {navItems.map(item => item.children ? (
          <div key={item.key}>
            <button
              type="button"
              aria-expanded={hubOpen || inHub}
              onClick={() => setHubOpen(o => !o)}
              style={{ ...styles.navItem, ...styles.navGroupBtn, ...(inHub ? { color: "var(--primary)", background: "var(--surface-alt)" } : {}), ...(c && !inHub ? { color: c.mutedTextColor } : {}) }}
            >
              <Icon name={item.icon} size={16} style={styles.navIcon} />
              <span style={{ flex: 1, textAlign: "left" }}>{t(item.key)}</span>
              <span aria-hidden="true" style={{ fontSize: "10px" }}>{hubOpen || inHub ? "▾" : "▸"}</span>
            </button>
            {(hubOpen || inHub) && (
              <div style={styles.subNav}>
                {item.children.map(sub => (
                  <NavLink
                    key={sub.path}
                    to={sub.path}
                    style={({ isActive }) => ({
                      ...styles.navItem, ...styles.subItem,
                      ...(c && !isActive ? { color: c.mutedTextColor } : {}),
                      ...(isActive ? styles.navActive : {}),
                      ...(isActive && c ? { background: c.accent, color: c.panelBg } : {}),
                    })}
                  >
                    <Icon name={sub.icon} size={14} style={styles.navIcon} />
                    {t(sub.key)}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ) : (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            style={({ isActive }) => ({
              ...styles.navItem,
              ...(c && !isActive ? { color: c.mutedTextColor } : {}),
              ...(isActive ? styles.navActive : {}),
              ...(isActive && c ? { background: c.accent, color: c.panelBg } : {}),
            })}
          >
            <Icon name={item.icon} size={16} style={styles.navIcon} />
            {item.label || t(item.key)}
          </NavLink>
        ))}
      </nav>

      <div style={{ ...styles.bottom, ...(c ? { borderTop: `1px solid ${c.borderColor}` } : {}) }}>
        <div style={styles.userBox}>
          <div style={{ ...styles.avatar, ...(c ? { background: c.accent, color: c.panelBg } : {}) }}>{name[0]?.toUpperCase()}</div>
          <div>
            <div style={{ ...styles.userName, ...(c ? { color: c.textColor } : {}) }}>{name}</div>
          </div>
        </div>
        <button onClick={toggleTheme} style={{ ...styles.themeBtn, ...(c ? { background: c.surfaceAltBg, border: `1px solid ${c.borderColor}`, color: c.mutedTextColor } : {}) }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
          <div style={{ width: "30px", height: "17px", borderRadius: "9px", background: theme === "dark" ? "var(--primary)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ width: "13px", height: "13px", borderRadius: "50%", background: "#fff", position: "absolute", top: "2px", left: theme === "dark" ? "15px" : "2px", transition: "left 0.2s" }} />
          </div>
        </button>
        <button onClick={logout} style={{ ...styles.logoutBtn, ...(c ? { background: c.surfaceAltBg } : {}) }}>{t("logout")}</button>
        <a href="https://icons8.com" target="_blank" rel="noreferrer" style={{ ...styles.iconCredit, ...(c ? { color: c.mutedTextColor } : {}) }}>
          Icons by Icons8
        </a>
      </div>
    </aside>
  );
}

const darkPalette = {
  panelBg: "#0F1013", surfaceAltBg: "#1B1D21", borderColor: "#2E3137",
  textColor: "#E6E4DF", mutedTextColor: "#9A9DA3", accent: "#5CC8B8",
};

const styles = {
  sidebar: {
    width: "240px", minHeight: "100vh", background: "var(--surface)",
    borderRight: "1px solid var(--border)", display: "flex",
    flexDirection: "column", padding: "24px 16px", position: "fixed",
    top: 0, left: 0,
  },
  logo: { padding: "8px 12px 24px", borderBottom: "1px solid var(--border)", marginBottom: "16px" },
  logoText: { display: "block", fontWeight: 700, fontSize: "18px", color: "var(--primary)" },
  logoSub: { fontSize: "12px", color: "var(--text-muted)" },
  nav: { display: "flex", flexDirection: "column", gap: "4px", flex: 1 },
  navItem: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 12px", borderRadius: "8px", fontSize: "14px",
    fontWeight: 500, color: "var(--text-muted)", transition: "all 0.2s",
  },
  navGroupBtn: { width: "100%", border: "none", background: "transparent", cursor: "pointer" },
  subNav: { display: "flex", flexDirection: "column", gap: "2px", margin: "2px 0 4px 18px", paddingLeft: "8px", borderLeft: "1px solid var(--border)" },
  subItem: { padding: "8px 10px", fontSize: "13px" },
  navActive: { background: "var(--primary)", color: "#fff" },
  navIcon: { flexShrink: 0 },
  bottom: { borderTop: "1px solid var(--border)", paddingTop: "16px" },
  userBox: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" },
  avatar: {
    width: "36px", height: "36px", borderRadius: "50%",
    background: "var(--primary)", color: "#fff", display: "flex",
    alignItems: "center", justifyContent: "center", fontWeight: 700,
  },
  userName: { fontSize: "14px", fontWeight: 600, color: "var(--text)" },
  userRole: { fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" },
  themeBtn: {
    width: "100%", padding: "8px 12px", background: "var(--surface-alt)",
    border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px",
    fontWeight: 600, color: "var(--text-muted)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: "8px",
  },
  logoutBtn: {
    width: "100%", padding: "8px", background: "var(--surface-alt)",
    borderRadius: "8px", fontSize: "13px", color: "#ef4444",
    fontWeight: 600, border: "none",
  },
  iconCredit: {
    display: "block", textAlign: "center", marginTop: "10px",
    fontSize: "10px", color: "var(--text-faint)", textDecoration: "none",
  },
};
