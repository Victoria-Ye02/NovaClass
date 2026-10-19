const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
process.env.KMATE_AI_PROVIDER = "openai";

const { getSentenceAudio, AudioRequestError } = require("../services/topik/sentenceAudio");
const controller = require("../controllers/victoria/kmate.controller");
const elevenLabs = require("../services/ai/elevenLabs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "topik-audio-"));
const res = () => ({ code: 200, headers: {}, set(h) { Object.assign(this.headers, h); return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.sent = b; return this; } });

test("makes the audio once per sentence and speed, then serves it from disk", async () => {
  const dir = tmp();
  const calls = [];
  const tts = async (text, voice, options) => { calls.push({ text, voice, options }); return Buffer.from("mp3:" + options.speed); };
  const first = await getSentenceAudio("한국에 온 지 일 년이 됐어요.", "normal", { tts, cacheDir: dir });
  const again = await getSentenceAudio("  한국에  온 지 일 년이 됐어요. ", "normal", { tts, cacheDir: dir });   // same sentence, other spacing
  assert.equal(first.cached, false);
  assert.equal(again.cached, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options, { languageCode: "ko", speed: 1 });
  assert.equal(again.audio.toString(), "mp3:1");

  const slow = await getSentenceAudio("한국에 온 지 일 년이 됐어요.", "slow", { tts, cacheDir: dir });
  assert.equal(slow.cached, false);                          // another speed is another file
  assert.equal(calls[1].options.speed, 0.75);
});

test("only short Korean sentences with a known speed are accepted", async () => {
  const tts = async () => { throw new Error("must not be called"); };
  for (const [text, speed] of [["", "normal"], [undefined, "normal"], ["hello world", "normal"], ["가".repeat(201), "normal"], ["안녕하세요", "fast"]]) {
    await assert.rejects(getSentenceAudio(text, speed, { tts, cacheDir: tmp() }), AudioRequestError);
  }
});

test("the endpoint answers with audio/mpeg, and with 400 for a bad request", async () => {
  process.env.TOPIK_AUDIO_CACHE_DIR = tmp();               // never write test audio into the real cache
  const original = elevenLabs.textToSpeech;
  const synthesized = [];
  elevenLabs.textToSpeech = async (text, voice, options) => { synthesized.push(options); return Buffer.from("audio-bytes"); };
  try {
    const bad = res();
    await controller.sentenceAudio({ body: { text: "hello" } }, bad);
    assert.equal(bad.code, 400);

    const text = `테스트 문장 ${Date.now()}`;          // new every run, so an earlier cached file is never hit
    const ok = res();
    await controller.sentenceAudio({ body: { text, speed: "slow" } }, ok);
    assert.equal(ok.code, 200);
    assert.equal(ok.headers["Content-Type"], "audio/mpeg");
    assert.equal(ok.sent.toString(), "audio-bytes");
    assert.deepEqual(synthesized[0], { languageCode: "ko", speed: 0.75 });

    const cached = res();
    await controller.sentenceAudio({ body: { text, speed: "slow" } }, cached);
    assert.equal(cached.headers["X-Audio-Cache"], "hit");
    assert.equal(synthesized.length, 1);

    elevenLabs.textToSpeech = async () => { const e = new Error("no key"); e.code = "ELEVENLABS_NOT_CONFIGURED"; throw e; };
    const down = res();
    await controller.sentenceAudio({ body: { text: `다른 문장 ${Date.now()}` } }, down);
    assert.equal(down.code, 503);
  } finally { elevenLabs.textToSpeech = original; delete process.env.TOPIK_AUDIO_CACHE_DIR; }
});

test("the speed reaches ElevenLabs as a voice setting, and is left out when not asked for", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  const bodies = [];
  global.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) }; };
  try {
    await elevenLabs.textToSpeech("안녕하세요", undefined, { languageCode: "ko", speed: 0.75 });
    await elevenLabs.textToSpeech("안녕하세요");
    assert.equal(bodies[0].voice_settings.speed, 0.75);
    assert.equal(bodies[0].language_code, "ko");
    assert.equal("speed" in bodies[1].voice_settings, false);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});
