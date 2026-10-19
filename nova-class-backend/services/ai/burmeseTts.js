const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const { burmeseSsml, cleanForSpeech, toParagraphs, SENTENCE_PAUSE_MS, PARAGRAPH_PAUSE_MS } = require("./speechPrep");

// Burmese TTS. ElevenLabs has no Burmese voice at all (it returns mispronounced
// audio, not an error), so Burmese replies use the Azure Neural voice
// "my-MM-NilarNeural" instead. That voice is reachable two ways, and this
// module picks automatically:
//
//   1. Official Azure Speech REST — used when AZURE_SPEECH_KEY + REGION are
//      set (higher quota, an SLA, supported for production).
//   2. Microsoft Edge's free "Read Aloud" endpoint via msedge-tts — the *same*
//      neural voices with no account, key, or card. This is the default so
//      Burmese voice works out of the box. It's an undocumented endpoint, fine
//      for a class app; the audio is identical to (1), so adding a key later
//      changes nothing a listener hears.
const DEFAULT_VOICE = "my-MM-NilarNeural";
const DEFAULT_LOCALE = "my-MM";
const REQUEST_TIMEOUT_MS = 20000;

// The SSML body (Azure REST path) is XML, so these five characters in the
// reply text would otherwise break the document or, for < and &, let injected
// markup through. Escape them before interpolating.
function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function synthesizeWithAzureRest(text, voiceName, { lecture = false } = {}) {
  const region = process.env.AZURE_SPEECH_REGION;
  const ssml = lecture
    ? burmeseSsml(text, { voice: voiceName })
    : `<speak version='1.0' xml:lang='${DEFAULT_LOCALE}'>` +
      `<voice xml:lang='${DEFAULT_LOCALE}' name='${voiceName}'>${escapeXml(text)}</voice>` +
      `</speak>`;

  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "NovaClass",
    },
    body: ssml,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const error = new Error(`Azure TTS request failed: ${res.status} ${detail}`.slice(0, 300));
    error.code = "BURMESE_TTS_REQUEST_FAILED";
    throw error;
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Microsoft Edge's Read Aloud service — same neural voices, no auth. Streams
// MP3 chunks over a WebSocket; collect them into one Buffer so the caller gets
// the same shape (an MP3 Buffer) as every other TTS path.
async function synthesizeWithEdge(text, voiceName, { lecture = false } = {}) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  // Lectures get hand-built SSML (pauses + a gentler pace); quick chat replies
  // keep the plain path so they start as fast as before.
  const { audioStream } = lecture
    ? tts.rawToStream(burmeseSsml(text, { voice: voiceName }))
    : tts.toStream(text);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const fail = (message) => {
      try { tts.close(); } catch { /* best-effort */ }
      const error = new Error(message);
      error.code = "BURMESE_TTS_REQUEST_FAILED";
      reject(error);
    };
    const timer = setTimeout(() => fail("Edge TTS request timed out"), REQUEST_TIMEOUT_MS);
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("end", () => {
      clearTimeout(timer);
      try { tts.close(); } catch { /* best-effort */ }
      resolve(Buffer.concat(chunks));
    });
    audioStream.on("error", (err) => {
      clearTimeout(timer);
      fail(`Edge TTS request failed: ${err.message}`);
    });
  });
}

// Microsoft's free Edge endpoint rejects <break> tags for this voice, so
// lecture pauses there are built by hand: each sentence is synthesized on its
// own (which also gives it a proper sentence-final intonation) and the clips
// are joined with silent MP3 frames. A frame at 24 kHz / 48 kbps mono is
// 24 ms; the header is MPEG-2 Layer III with a zeroed payload, which decodes to
// silence and concatenates cleanly with the voice clips (same format).
const SILENT_FRAME = Buffer.concat([Buffer.from([0xff, 0xf3, 0x64, 0xc4]), Buffer.alloc(140)]);
const SILENT_FRAME_MS = 24;
// Every Edge clip ends with ~0.85 s of its own silence (measured the same on
// every sentence), which would make the gaps long and choppy. Most of it is cut
// off, leaving a short natural tail, and the intended pause is added back.
const EDGE_TRAILING_SILENCE_TRIM_MS = 700;

// Bitrate tables for MPEG-2/2.5 Layer III (what the 24 kHz voice uses).
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MPEG2_SAMPLE_RATES = [22050, 24000, 16000, 0];

// Drops the last `ms` of an MP3 by whole frames. If the buffer isn't the
// frame layout we expect, it is returned untouched rather than risk damaging it.
function trimTrailingSilence(buffer, ms = EDGE_TRAILING_SILENCE_TRIM_MS) {
  const frames = [];
  let offset = 0;
  // Skip an ID3v2 tag if present.
  if (buffer.length > 10 && buffer.toString("latin1", 0, 3) === "ID3") {
    offset = 10 + (((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f));
  }
  const audioStart = offset;
  while (offset + 4 <= buffer.length) {
    const b1 = buffer[offset + 1];
    const isMpeg2Layer3 = buffer[offset] === 0xff && (b1 & 0xfe) === 0xf2; // 0xF2/0xF3: MPEG-2, Layer III
    const bitrate = MPEG2_L3_BITRATES[buffer[offset + 2] >> 4] * 1000;
    const sampleRate = MPEG2_SAMPLE_RATES[(buffer[offset + 2] >> 2) & 3];
    if (!isMpeg2Layer3 || !bitrate || !sampleRate) return buffer;
    const length = Math.floor((72 * bitrate) / sampleRate) + ((buffer[offset + 2] >> 1) & 1);
    if (offset + length > buffer.length) break; // a truncated last frame: ignore it
    frames.push({ offset, length, ms: (576 / sampleRate) * 1000 });
    offset += length;
  }
  if (frames.length < 10) return buffer;
  let dropMs = 0;
  let keep = frames.length;
  while (keep > 5 && dropMs + frames[keep - 1].ms <= ms) { dropMs += frames[keep - 1].ms; keep -= 1; }
  const end = frames[keep - 1].offset + frames[keep - 1].length;
  return buffer.subarray(0, end > audioStart ? end : buffer.length);
}

function silence(ms) {
  const frames = Math.max(1, Math.round(ms / SILENT_FRAME_MS));
  return Buffer.concat(Array(frames).fill(SILENT_FRAME));
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function synthesizeLectureWithEdge(text, voiceName) {
  const jobs = [];
  const paragraphs = toParagraphs(text);
  paragraphs.forEach((sentences, paragraphIndex) => {
    sentences.forEach((sentence, sentenceIndex) => {
      const endsParagraph = sentenceIndex === sentences.length - 1;
      const isLast = endsParagraph && paragraphIndex === paragraphs.length - 1;
      jobs.push({ sentence, pause: isLast ? 0 : (endsParagraph ? PARAGRAPH_PAUSE_MS : SENTENCE_PAUSE_MS) });
    });
  });
  const clips = await mapWithLimit(jobs, 3, async job => trimTrailingSilence(await synthesizeWithEdge(job.sentence, voiceName, { lecture: true })));
  return Buffer.concat(clips.flatMap((clip, i) => (jobs[i].pause ? [clip, silence(jobs[i].pause)] : [clip])));
}

async function textToSpeech(text, voice, { lecture = false } = {}) {
  const voiceName = voice || process.env.AZURE_SPEECH_VOICE || DEFAULT_VOICE;
  const spoken = lecture ? cleanForSpeech(text) : text;
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
    return synthesizeWithAzureRest(spoken, voiceName, { lecture });
  }
  return lecture ? synthesizeLectureWithEdge(spoken, voiceName) : synthesizeWithEdge(spoken, voiceName);
}

module.exports = { textToSpeech, DEFAULT_VOICE, trimTrailingSilence };
