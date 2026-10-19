const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Korean example sentences of TOPIK Hub › Grammar & Meaning, read aloud by ElevenLabs. The same sentences are
// played again and again, so every MP3 is kept on disk (the uploads folder is not in git) and ElevenLabs is
// only called the first time a sentence is played at a given speed.
const SPEEDS = { normal: 1.0, slow: 0.75 };           // ElevenLabs accepts 0.7 - 1.2
const MAX_CHARS = 200;
const DEFAULT_CACHE_DIR = path.join(__dirname, "../../uploads/topik_audio");

class AudioRequestError extends Error {}

function cleanRequest(text, speed = "normal") {
  const clean = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!clean) throw new AudioRequestError("text is required");
  if (clean.length > MAX_CHARS) throw new AudioRequestError(`text must be at most ${MAX_CHARS} characters`);
  if (!/[가-힣]/.test(clean)) throw new AudioRequestError("text must be Korean");     // not a general-purpose TTS
  if (!(speed in SPEEDS)) throw new AudioRequestError("speed must be normal or slow");
  return { clean, speed };
}

// `tts` is injectable for tests; by default the shared ElevenLabs helper with its Korean narrator voice.
async function getSentenceAudio(text, speed, { tts, cacheDir = process.env.TOPIK_AUDIO_CACHE_DIR || DEFAULT_CACHE_DIR } = {}) {
  const request = cleanRequest(text, speed);
  const voice = process.env.ELEVENLABS_VOICE_ID || "default";
  const key = crypto.createHash("sha1").update(`${voice}|${request.speed}|${request.clean}`).digest("hex");
  const file = path.join(cacheDir, `${key}.mp3`);
  try { return { audio: await fs.promises.readFile(file), cached: true }; } catch { /* not made yet */ }

  const synth = tts || require("../ai/elevenLabs").textToSpeech;
  const audio = await synth(request.clean, undefined, { languageCode: "ko", speed: SPEEDS[request.speed] });
  try {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    await fs.promises.writeFile(file, audio);
  } catch { /* a read-only disk only costs the cache */ }
  return { audio, cached: false };
}

module.exports = { getSentenceAudio, AudioRequestError, SPEEDS, MAX_CHARS };
