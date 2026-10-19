const test = require("node:test");
const assert = require("node:assert/strict");

const service = require("../services/ai/elevenLabs");
const originalFetch = global.fetch;
const originalApiKey = process.env.ELEVENLABS_API_KEY;
const originalVoiceId = process.env.ELEVENLABS_VOICE_ID;
const originalTtsModelId = process.env.ELEVENLABS_TTS_MODEL_ID;

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalApiKey;
  if (originalVoiceId === undefined) delete process.env.ELEVENLABS_VOICE_ID;
  else process.env.ELEVENLABS_VOICE_ID = originalVoiceId;
  if (originalTtsModelId === undefined) delete process.env.ELEVENLABS_TTS_MODEL_ID;
  else process.env.ELEVENLABS_TTS_MODEL_ID = originalTtsModelId;
});

test("textToSpeech posts to the default voice with the API key header and returns audio bytes", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  delete process.env.ELEVENLABS_VOICE_ID;

  let capturedUrl, capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("fake-mp3-bytes").buffer,
    };
  };

  const audio = await service.textToSpeech("Hello there");

  assert.equal(capturedUrl, "https://api.elevenlabs.io/v1/text-to-speech/xyE2KXhy5mfTGV7xRXpD?optimize_streaming_latency=3");
  assert.equal(capturedOptions.headers["xi-api-key"], "test-key");
  assert.equal(JSON.parse(capturedOptions.body).text, "Hello there");
  assert.ok(Buffer.isBuffer(audio));
  assert.equal(audio.toString(), "fake-mp3-bytes");
});

test("textToSpeech uses ELEVENLABS_VOICE_ID when set, overridable per call", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_VOICE_ID = "env-voice-id";

  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  await service.textToSpeech("hi");
  assert.match(capturedUrl, /\/env-voice-id\?optimize_streaming_latency=3$/);

  await service.textToSpeech("hi", "explicit-voice-id");
  assert.match(capturedUrl, /\/explicit-voice-id\?optimize_streaming_latency=3$/);
});

test("textToSpeech defaults to ElevenLabs Turbo with latency optimization", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  delete process.env.ELEVENLABS_TTS_MODEL_ID;

  let capturedUrl, capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  await service.textToSpeech("Teach me about databases");

  assert.match(capturedUrl, /optimize_streaming_latency=3/);
  assert.equal(JSON.parse(capturedOptions.body).model_id, "eleven_turbo_v2_5");
});

test("textToSpeech honors ELEVENLABS_TTS_MODEL_ID for quality-first playback", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_TTS_MODEL_ID = "eleven_multilingual_v2";

  let capturedOptions;
  global.fetch = async (_url, options) => {
    capturedOptions = options;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  await service.textToSpeech("Teach me about databases");

  assert.equal(JSON.parse(capturedOptions.body).model_id, "eleven_multilingual_v2");
});

test("textToSpeech throws a coded error without calling fetch when unconfigured", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  global.fetch = async () => { throw new Error("fetch should not be called"); };

  await assert.rejects(
    () => service.textToSpeech("hi"),
    (err) => {
      assert.equal(err.code, "ELEVENLABS_NOT_CONFIGURED");
      return true;
    },
  );
});

test("textToSpeech throws a coded error on a non-OK response", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "Invalid API key" });

  await assert.rejects(
    () => service.textToSpeech("hi"),
    (err) => {
      assert.equal(err.code, "ELEVENLABS_REQUEST_FAILED");
      assert.match(err.message, /401/);
      return true;
    },
  );
});

test("speechToText posts the audio to Scribe with the API key and returns the transcript", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";

  let capturedUrl, capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, json: async () => ({ text: "မင်္ဂလာပါ", language_code: "mya" }) };
  };

  const text = await service.speechToText(Buffer.from("audio-bytes"));

  assert.equal(capturedUrl, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(capturedOptions.headers["xi-api-key"], "test-key");
  assert.ok(capturedOptions.body instanceof FormData);
  assert.equal(capturedOptions.body.get("model_id"), "scribe_v1");
  assert.equal(text, "မင်္ဂလာပါ");
});

test("speechToText throws a coded error without calling fetch when unconfigured", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  global.fetch = async () => { throw new Error("fetch should not be called"); };

  await assert.rejects(
    () => service.speechToText(Buffer.from("audio-bytes")),
    (err) => {
      assert.equal(err.code, "ELEVENLABS_NOT_CONFIGURED");
      return true;
    },
  );
});

test("speechToText throws a coded error on a non-OK response", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "missing permission speech_to_text" });

  await assert.rejects(
    () => service.speechToText(Buffer.from("audio-bytes")),
    (err) => {
      assert.equal(err.code, "ELEVENLABS_REQUEST_FAILED");
      assert.match(err.message, /401/);
      return true;
    },
  );
});

// A real client-side integration (@elevenlabs/client) replacing the drop-in
// <elevenlabs-convai> widget needs this to authenticate a session without
// ever exposing ELEVENLABS_API_KEY to the browser — the backend fetches a
// short-lived signed WebSocket URL and hands only that to the frontend.
test("getSignedUrl requests a signed URL for the given agent with the API key header", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";

  let capturedUrl, capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, json: async () => ({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?token=abc" }) };
  };

  const signedUrl = await service.getSignedUrl("agent_123");

  assert.equal(capturedUrl, "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_123");
  assert.equal(capturedOptions.headers["xi-api-key"], "test-key");
  assert.equal(signedUrl, "wss://api.elevenlabs.io/v1/convai/conversation?token=abc");
});

test("getSignedUrl throws a coded error without calling fetch when unconfigured", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  global.fetch = async () => { throw new Error("fetch should not be called"); };

  await assert.rejects(
    () => service.getSignedUrl("agent_123"),
    (err) => {
      assert.equal(err.code, "ELEVENLABS_NOT_CONFIGURED");
      return true;
    },
  );
});

test("getSignedUrl throws a coded error on a non-OK response", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  global.fetch = async () => ({ ok: false, status: 404, text: async () => "Agent not found" });

  await assert.rejects(
    () => service.getSignedUrl("agent_123"),
    (err) => {
      assert.equal(err.code, "ELEVENLABS_REQUEST_FAILED");
      assert.match(err.message, /404/);
      return true;
    },
  );
});

test("lecture mode uses the expressive multilingual model with slower, warmer voice settings", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  delete process.env.ELEVENLABS_TTS_MODEL_ID;
  delete process.env.ELEVENLABS_LECTURE_MODEL_ID;
  let body;
  global.fetch = async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("x").buffer };
  };

  await service.textToSpeech("Welcome to the lesson.", undefined, { lecture: true });

  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.voice_settings.speed, 0.97);
  assert.ok(body.voice_settings.style >= 0.45, "more expressive than the chat voice");
  assert.ok(body.voice_settings.stability <= 0.45, "enough variation to avoid a monotone");
});

test("quick chat replies keep the fast turbo model and are unaffected by lecture mode", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  delete process.env.ELEVENLABS_TTS_MODEL_ID;
  let body;
  global.fetch = async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("x").buffer };
  };

  await service.textToSpeech("Hi");

  assert.equal(body.model_id, "eleven_turbo_v2_5");
  assert.equal("speed" in body.voice_settings, false);
});

test("a model and language code can be passed for Burmese (eleven_v4), alongside lecture settings", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  let url, body;
  global.fetch = async (u, options) => {
    url = u;
    body = JSON.parse(options.body);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("x").buffer };
  };

  await service.textToSpeech("မင်္ဂလာပါ", service.BURMESE_LECTURE_VOICE_ID, { lecture: true, modelId: service.BURMESE_LECTURE_MODEL_ID, languageCode: "my" });

  assert.match(url, /text-to-speech\/EXAVITQu4vr4xnSDxMaL/);
  assert.equal(body.model_id, "eleven_v4");
  assert.equal(body.language_code, "my");
  assert.equal(body.voice_settings.speed, 0.97);
});

test("no language_code is sent unless one is asked for", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  let body;
  global.fetch = async (u, options) => {
    body = JSON.parse(options.body);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("x").buffer };
  };
  await service.textToSpeech("Hello");
  assert.equal("language_code" in body, false);
});

test("lecture requests omit optimize_streaming_latency (eleven_v4 rejects it) while chat requests keep it", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  const urls = [];
  global.fetch = async (u) => {
    urls.push(u);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode("x").buffer };
  };
  await service.textToSpeech("Hi", undefined, { lecture: true, modelId: "eleven_v4", languageCode: "my" });
  await service.textToSpeech("Hi");
  assert.equal(urls[0].includes("optimize_streaming_latency"), false);
  assert.equal(urls[1].includes("optimize_streaming_latency=3"), true);
});
