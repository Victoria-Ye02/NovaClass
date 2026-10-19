const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";
// "Sara Kim — Warm Korean Narrator" from ElevenLabs' shared voice library — a
// real native Korean voice (not an English voice speaking Korean as a second
// language), picked after comparing several candidates for Nova Teacher's
// persona. Confirmed working directly by voice_id (no separate "add to
// library" step needed). Falls back to "Rachel" (the old default, an English
// premade voice) only if this ID is ever removed from the library.
const DEFAULT_VOICE_ID = "xyE2KXhy5mfTGV7xRXpD";
const FALLBACK_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
// eleven_turbo_v2_5 over Flash: Flash prioritizes time-to-first-audio at the
// cost of sounding noticeably flatter/more robotic, which matters a lot for a
// teaching voice. Turbo sounds close to the quality-first eleven_multilingual_v2
// but live-measured ~2x faster than Flash for this app's typical reply length
// (Flash 5.3s vs Turbo 0.5s vs multilingual_v2 1.2s on the same Korean
// sentence, same voice/settings) — no real speed/quality trade-off to make
// here. Override with ELEVENLABS_TTS_MODEL_ID if that ever needs to change.
const DEFAULT_TTS_MODEL_ID = "eleven_turbo_v2_5";

function assertConfigured() {
  if (process.env.ELEVENLABS_API_KEY) return;
  const error = new Error("ElevenLabs is not configured (ELEVENLABS_API_KEY is unset)");
  error.code = "ELEVENLABS_NOT_CONFIGURED";
  throw error;
}

// Lectures are pre-generated and replayed, so quality beats first-byte speed:
// the multilingual v2 model is the most expressive one that still honours
// pause tags, and the voice settings lean toward warmth and variation.
const LECTURE_TTS_MODEL_ID = "eleven_multilingual_v2";
const LECTURE_VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true, speed: 0.97 };

// Burmese lectures: eleven_v4 is the first ElevenLabs model that lists Burmese
// (multilingual_v2 rejects language_code "my"). "Sarah" was picked by ear from
// a side-by-side of five voices; override with ELEVENLABS_BURMESE_VOICE_ID.
const BURMESE_LECTURE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const BURMESE_LECTURE_MODEL_ID = "eleven_v4";

async function textToSpeech(text, voiceId, { lecture = false, modelId: modelOverride, languageCode, speed } = {}) {
  assertConfigured();
  const activeVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = modelOverride || (lecture
    ? (process.env.ELEVENLABS_LECTURE_MODEL_ID || LECTURE_TTS_MODEL_ID)
    : (process.env.ELEVENLABS_TTS_MODEL_ID || DEFAULT_TTS_MODEL_ID));
  // optimize_streaming_latency is a first-byte-speed knob for chat replies; the v4
  // models reject it outright, and lectures are pre-generated so they don't need it.
  const latencyQuery = lecture ? "" : "?optimize_streaming_latency=3";
  const res = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${activeVoiceId}${latencyQuery}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      ...(languageCode ? { language_code: languageCode } : {}),
      // Lower stability than the 0.5 default trades a little consistency for
      // more natural pitch/pace variation — 0.5+ reads as flat/robotic,
      // especially for a voice speaking a language it wasn't recorded in.
      // A touch of style plus speaker_boost pushes expressiveness back
      // toward how the source voice actually sounds, rather than an average.
      voice_settings: lecture ? LECTURE_VOICE_SETTINGS : { stability: 0.35, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, ...(speed ? { speed } : {}) },
    }),
    // Lectures are long, and eleven_v4 needs ~20 s per minute of speech.
    signal: AbortSignal.timeout(lecture ? 90000 : 20000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = new Error(`ElevenLabs TTS request failed: ${res.status} ${detail}`.slice(0, 300));
    error.code = "ELEVENLABS_REQUEST_FAILED";
    throw error;
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Short-lived (15 min) signed WebSocket URL for a Conversational AI agent —
// lets the frontend's @elevenlabs/client SDK authenticate a real-time voice
// session directly, without ever handing it ELEVENLABS_API_KEY. The
// resulting session itself isn't time-limited by this URL's expiry; it only
// needs to be valid at the moment the connection is opened.
async function getSignedUrl(agentId) {
  assertConfigured();
  const res = await fetch(
    `${ELEVENLABS_API_URL}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(10000) }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = new Error(`ElevenLabs signed-url request failed: ${res.status} ${detail}`.slice(0, 300));
    error.code = "ELEVENLABS_REQUEST_FAILED";
    throw error;
  }

  const data = await res.json();
  return data.signed_url;
}

// Speech-to-Text via the Scribe model. Used specifically for Burmese voice
// input: Groq's whisper-large-v3 can't transcribe Burmese at all (it returns
// script gibberish), whereas Scribe transcribes it accurately and auto-detects
// the language. `audio` is a Buffer of the recorded clip; languageCode (an
// ISO-639-3 code like "mya") is optional — Scribe auto-detects well without it.
async function speechToText(audio, { filename = "audio.webm", languageCode } = {}) {
  assertConfigured();
  const form = new FormData();
  form.append("file", new Blob([audio]), filename);
  form.append("model_id", "scribe_v1");
  if (languageCode) form.append("language_code", languageCode);

  const res = await fetch(`${ELEVENLABS_API_URL}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = new Error(`ElevenLabs speech-to-text request failed: ${res.status} ${detail}`.slice(0, 300));
    error.code = "ELEVENLABS_REQUEST_FAILED";
    throw error;
  }

  const data = await res.json();
  return (data.text || "").trim();
}

module.exports = { BURMESE_LECTURE_VOICE_ID, BURMESE_LECTURE_MODEL_ID, textToSpeech, getSignedUrl, speechToText, DEFAULT_VOICE_ID, DEFAULT_TTS_MODEL_ID };
