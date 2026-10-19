const test = require("node:test");
const assert = require("node:assert/strict");

const service = require("../services/ai/burmeseTts");
const originalFetch = global.fetch;
const originalKey = process.env.AZURE_SPEECH_KEY;
const originalRegion = process.env.AZURE_SPEECH_REGION;
const originalVoice = process.env.AZURE_SPEECH_VOICE;

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test.afterEach(() => {
  global.fetch = originalFetch;
  restore("AZURE_SPEECH_KEY", originalKey);
  restore("AZURE_SPEECH_REGION", originalRegion);
  restore("AZURE_SPEECH_VOICE", originalVoice);
});

// These tests cover the *official Azure* path, taken only when a key + region
// are configured. The default path (Microsoft Edge's free Read Aloud endpoint)
// hits a live network service and is verified manually rather than here, to
// keep the suite offline and deterministic.

test("uses the Azure REST endpoint with the subscription key and returns audio bytes when a key is configured", async () => {
  process.env.AZURE_SPEECH_KEY = "test-key";
  process.env.AZURE_SPEECH_REGION = "southeastasia";
  delete process.env.AZURE_SPEECH_VOICE;

  let capturedUrl, capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("azure-mp3-bytes").buffer };
  };

  const audio = await service.textToSpeech("မင်္ဂလာပါ");

  assert.equal(capturedUrl, "https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.equal(capturedOptions.headers["Ocp-Apim-Subscription-Key"], "test-key");
  assert.equal(capturedOptions.headers["Content-Type"], "application/ssml+xml");
  assert.match(capturedOptions.body, /name='my-MM-NilarNeural'/);
  assert.match(capturedOptions.body, /မင်္ဂလာပါ/);
  assert.ok(Buffer.isBuffer(audio));
  assert.equal(audio.toString(), "azure-mp3-bytes");
});

test("XML-escapes special characters so they can't break or inject into the SSML", async () => {
  process.env.AZURE_SPEECH_KEY = "test-key";
  process.env.AZURE_SPEECH_REGION = "eastus";

  let body;
  global.fetch = async (_url, options) => {
    body = options.body;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  await service.textToSpeech(`Tom & Jerry say "<hi>"`);

  assert.match(body, /Tom &amp; Jerry say &quot;&lt;hi&gt;&quot;/);
  assert.doesNotMatch(body, /<hi>/); // the raw tag must not survive into the SSML
});

test("uses AZURE_SPEECH_VOICE when set, overridable per call", async () => {
  process.env.AZURE_SPEECH_KEY = "test-key";
  process.env.AZURE_SPEECH_REGION = "eastus";
  process.env.AZURE_SPEECH_VOICE = "my-MM-ThihaNeural";

  let body;
  global.fetch = async (_url, options) => {
    body = options.body;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  await service.textToSpeech("hi");
  assert.match(body, /name='my-MM-ThihaNeural'/);

  await service.textToSpeech("hi", "my-MM-NilarNeural");
  assert.match(body, /name='my-MM-NilarNeural'/);
});

test("throws a coded error on a non-OK Azure response", async () => {
  process.env.AZURE_SPEECH_KEY = "test-key";
  process.env.AZURE_SPEECH_REGION = "eastus";
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "Unauthorized" });

  await assert.rejects(
    () => service.textToSpeech("hi"),
    (err) => {
      assert.equal(err.code, "BURMESE_TTS_REQUEST_FAILED");
      assert.match(err.message, /401/);
      return true;
    },
  );
});

test("lecture mode sends SSML with sentence pauses and a gentler pace, with the text still escaped", async () => {
  process.env.AZURE_SPEECH_KEY = "test-key";
  process.env.AZURE_SPEECH_REGION = "southeastasia";
  delete process.env.AZURE_SPEECH_VOICE;
  let body;
  global.fetch = async (url, options) => {
    body = options.body;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("x").buffer };
  };

  await service.textToSpeech("မင်္ဂလာပါ။ ဒီနေ့သင်ခန်းစာက A & B ပါ။\nနောက်အပိုဒ်။", undefined, { lecture: true });

  assert.match(body, /<prosody rate="-8%"/);
  assert.match(body, /<break time="320ms"\/>/);
  assert.match(body, /<break time="720ms"\/>/);
  assert.match(body, /A &amp; B/);
});

// ---- trimTrailingSilence -----------------------------------------------------
// 24 kHz / 48 kbps mono MPEG-2 Layer III: 144-byte frames of 24 ms each.
const FRAME = Buffer.concat([Buffer.from([0xff, 0xf3, 0x64, 0xc4]), Buffer.alloc(140, 1)]);
const frames = n => Buffer.concat(Array(n).fill(FRAME));

test("trimTrailingSilence removes whole frames from the end and keeps the rest intact", () => {
  const audio = frames(100); // 2.4 s
  const trimmed = service.trimTrailingSilence(audio, 700); // 29 frames fit in 700 ms
  assert.equal(trimmed.length, (100 - 29) * 144);
  assert.equal(trimmed.compare(audio, 0, trimmed.length), 0, "the kept part is byte-for-byte the original");
});

test("trimTrailingSilence never trims a short clip down to nothing", () => {
  const audio = frames(8);
  assert.equal(service.trimTrailingSilence(audio, 700), audio, "too short to parse safely → untouched");
  const mid = frames(20);
  assert.ok(service.trimTrailingSilence(mid, 700).length >= 5 * 144, "always keeps a few frames");
});

test("trimTrailingSilence leaves anything that is not the expected MP3 layout untouched", () => {
  const junk = Buffer.from("this is not an mp3 at all, just bytes".repeat(20));
  assert.equal(service.trimTrailingSilence(junk, 700), junk);
  const wrongLayer = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(500)]); // MPEG-1 Layer III
  assert.equal(service.trimTrailingSilence(wrongLayer, 700), wrongLayer);
});

test("trimTrailingSilence ignores a truncated final frame", () => {
  const audio = Buffer.concat([frames(60), FRAME.subarray(0, 50)]);
  const trimmed = service.trimTrailingSilence(audio, 700);
  assert.equal(trimmed.length, (60 - 29) * 144);
});
