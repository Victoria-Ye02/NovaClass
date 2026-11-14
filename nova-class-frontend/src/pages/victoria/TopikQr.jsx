import { useEffect, useState } from "react";
import QRCode from "qrcode";

// A phone cannot reach "localhost", so the QR must point at this Mac's LAN address.
// Override with VITE_PUBLIC_BASE when the app is deployed.
const PUBLIC_BASE = import.meta.env.VITE_PUBLIC_BASE || "http://192.168.0.4:5174";
const TARGET_PATH = "/topik-hub/smart-drill";

export default function TopikQr() {
  const target = `${PUBLIC_BASE}${TARGET_PATH}`;
  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(target, { width: 360, margin: 2 })
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(""); });
    return () => { alive = false; };
  }, [target]);

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: "0 20px", textAlign: "center", fontFamily: "inherit" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>TOPIK 스마트 드릴 QR</h1>
      <p style={{ color: "#5b607a", marginBottom: 24 }}>휴대폰 카메라로 QR을 스캔하면 바로 연습을 시작합니다.</p>
      {src ? (
        <img src={src} alt="TOPIK Smart Drill QR code" style={{ width: 360, maxWidth: "100%", borderRadius: 16, border: "1px solid #e4e6f0" }} />
      ) : (
        <p>QR 코드를 만드는 중...</p>
      )}
      <p style={{ marginTop: 18, fontSize: 14, color: "#5b607a", wordBreak: "break-all" }}>{target}</p>
    </div>
  );
}
