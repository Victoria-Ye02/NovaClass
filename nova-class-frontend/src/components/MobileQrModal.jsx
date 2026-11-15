import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { useTheme } from "../ThemeContext";

// A phone cannot reach "localhost", so the QR must point at a public address.
// Set VITE_PUBLIC_BASE for the deployed site; the fallback is the Mac's LAN address for local testing.
const PUBLIC_BASE = import.meta.env.VITE_PUBLIC_BASE || "http://192.168.0.4:5174";
const TARGET_PATH = "/topik-hub/smart-drill";

// Modal that shows a QR code for opening TOPIK Hub on a phone.
// It is rendered into <body> through a portal, so no parent (such as the sidebar)
// can clip it or let the page behind it show through.
export default function MobileQrModal({ open, onClose }) {
  const { theme } = useTheme();
  const target = `${PUBLIC_BASE}${TARGET_PATH}`;
  const [src, setSrc] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    QRCode.toDataURL(target, { width: 360, margin: 2 })
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(""); });
    return () => { alive = false; };
  }, [open, target]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Solid colours (no transparency) so the page behind never shows through.
  const isDark = theme === "dark";
  const panel = isDark ? "#17183a" : "#ffffff";
  const text = isDark ? "#eceefe" : "#161833";
  const muted = isDark ? "#a4a9c8" : "#5b607a";
  const border = isDark ? "#2a2c55" : "#e4e6f0";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-qr-title"
      onClick={onClose}
      style={styles.backdrop}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...styles.card, background: panel, color: text, border: `1px solid ${border}` }}
      >
        <h2 id="mobile-qr-title" style={styles.title}>스마트폰으로 TOPIK Hub 접속하기</h2>
        <p style={{ ...styles.help, color: muted }}>
          스마트폰 카메라로 QR 코드를 스캔하여 모바일에서 스마트 드릴 및 기출문제를 바로 연습해 보세요.
        </p>

        <div style={styles.qrBox}>
          {src ? (
            <img src={src} alt="TOPIK Hub 접속용 QR 코드" style={{ ...styles.qrImg, border: `1px solid ${border}` }} />
          ) : (
            <p style={{ ...styles.help, margin: 0 }}>QR 코드를 만드는 중...</p>
          )}
        </div>

        <p style={{ ...styles.link, color: muted }}>{target}</p>

        <div style={styles.actions}>
          <button
            type="button"
            onClick={copyLink}
            style={{ ...styles.secondaryBtn, color: text, borderColor: border }}
          >
            {copied ? "복사됨" : "링크 복사"}
          </button>
          <button type="button" onClick={onClose} style={styles.primaryBtn}>닫기</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

const styles = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px", zIndex: 9999,
  },
  card: {
    width: "100%", maxWidth: "420px", borderRadius: "18px", padding: "28px",
    boxShadow: "0 25px 50px rgba(0, 0, 0, 0.35)", textAlign: "center",
    position: "relative", opacity: 1,
  },
  title: { fontSize: "20px", fontWeight: 800, margin: "0 0 10px", lineHeight: 1.4 },
  help: { fontSize: "14px", margin: "0 0 18px", lineHeight: 1.6, wordBreak: "keep-all" },
  qrBox: { display: "flex", justifyContent: "center", minHeight: "260px", alignItems: "center" },
  qrImg: { width: "260px", maxWidth: "100%", borderRadius: "12px", background: "#fff" },
  link: { fontSize: "12px", wordBreak: "break-all", margin: "14px 0 20px" },
  actions: { display: "flex", gap: "10px", justifyContent: "center" },
  primaryBtn: {
    padding: "10px 20px", borderRadius: "10px", border: "none",
    background: "#3b30c8", color: "#fff", fontWeight: 700, cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 20px", borderRadius: "10px", border: "1px solid",
    background: "transparent", fontWeight: 600, cursor: "pointer",
  },
};
