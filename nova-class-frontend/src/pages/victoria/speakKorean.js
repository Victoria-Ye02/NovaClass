import API from "../../services/api";

// Reads a Korean sentence aloud with the ElevenLabs voice (the server makes each MP3 once and keeps it).
// speed is "normal" or "slow". If the server cannot make the audio (no key, offline) the browser's own
// speech synthesis reads it instead, so the speaker button still does something.
const urls = new Map();            // "speed|text" -> object URL of the MP3 already fetched this session
let playing = null;

export const canSpeak = () => typeof window !== "undefined" && (typeof Audio !== "undefined" || "speechSynthesis" in window);

export function stopSpeaking() {
  if (playing) { playing.pause(); playing = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function browserSpeak(text, speed) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = speed === "slow" ? 0.75 : 0.9;
  const korean = window.speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().replace("_", "-").startsWith("ko"));
  if (korean) utterance.voice = korean;
  window.speechSynthesis.speak(utterance);
  return true;
}

async function audioUrl(text, speed) {
  const key = `${speed}|${text}`;
  let url = urls.get(key);
  if (!url) {
    const res = await API.post("/kmate/tts", { text, speed }, { responseType: "blob" });
    url = URL.createObjectURL(res.data);
    urls.set(key, url);
  }
  return url;
}

// The lines of a listening script as they are read aloud: the speaker labels ("남자:", "여자:") are not spoken, and a long
// line is cut at sentence ends so each piece fits the server limit.
export function scriptLines(script) {
  return String(script || "").split(/\n+/)
    .map(line => line.replace(/^\s*[가-힣A-Za-z0-9 ]{1,6}\s*[:：]\s*/, "").trim())
    .flatMap(line => line.match(/[^.!?。]+[.!?。]?/g) || [])
    .map(piece => piece.trim())
    .filter(piece => /[가-힣]/.test(piece));
}

// Reads the lines one after the other with the same voice (each waits for the one before it to end). `shouldStop()` is
// asked between lines so a button can cancel. Resolves to "elevenlabs", "browser" or "none".
export async function speakLines(lines, speed = "normal", shouldStop = () => false, onProgress = () => {}) {
  stopSpeaking();
  let used = "none";
  for (const [index, line] of lines.entries()) {
    if (shouldStop()) break;
    onProgress(index + 1, lines.length);
    try {
      const audio = new Audio(await audioUrl(line, speed));
      playing = audio;
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play().catch(reject);
      });
      used = "elevenlabs";
    } catch {
      if (!browserSpeak(line, speed)) break;
      used = "browser";
      await new Promise(resolve => setTimeout(resolve, Math.min(8000, 300 + line.length * 180)));     // the browser voice gives no end signal here
    }
  }
  return used;
}

// resolves to "elevenlabs" or "browser" (what actually spoke), or "none"
export async function speakKorean(text, speed = "normal") {
  if (!text) return "none";
  stopSpeaking();
  const key = `${speed}|${text}`;
  try {
    let url = urls.get(key);
    if (!url) {
      const res = await API.post("/kmate/tts", { text, speed }, { responseType: "blob" });
      url = URL.createObjectURL(res.data);
      urls.set(key, url);
    }
    playing = new Audio(url);
    await playing.play();
    return "elevenlabs";
  } catch {
    return browserSpeak(text, speed) ? "browser" : "none";
  }
}
