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
