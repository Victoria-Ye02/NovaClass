const Groq = require("groq-sdk");
const OpenAI = require("openai");

require("dotenv").config();

// Text completion goes through OpenRouter. Gemini 2.5 Flash: measured ~1.4s
// per reply against ~5s for the previous z-ai/glm-5.2 (a reasoning model that
// was slow and needed reasoning explicitly disabled), with equal-or-better
// Burmese/Korean quality. The whole voice loop's latency (STT → LLM → TTS) was
// dominated by this call, so the model choice is the single biggest speed
// lever. Whisper transcription stays on Groq directly; OpenRouter doesn't
// offer it.
const TEXT_MODEL = "google/gemini-2.5-flash";
let textClient = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });
let audioClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function completeText({ messages, maxTokens = 1024, responseFormat }) {
  return textClient.chat.completions.create({
    model: TEXT_MODEL,
    messages,
    max_tokens: maxTokens,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });
}

// Yields text deltas as they arrive instead of waiting for the full reply —
// lets a caller (voice mode's sentence-by-sentence TTS, notably) start acting
// on the first sentence while the model is still generating the rest, instead
// of the whole "wait for full text, then speak" round-trip being fully serial.
async function* streamCompletion({ messages, maxTokens = 1024 }) {
  const stream = await textClient.chat.completions.create({
    model: TEXT_MODEL,
    messages,
    max_tokens: maxTokens,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

async function transcribeAudio({ file, responseFormat = "text", language }) {
  return audioClient.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    response_format: responseFormat,
    // Whisper auto-detects language when this is omitted, but for some
    // languages (Burmese notably) it mis-detects a related script and returns
    // gibberish. Passing an ISO-639-1 code forces the right language.
    ...(language ? { language } : {}),
  });
}

function setClientsForTests({ text, audio } = {}) {
  if (text) textClient = text;
  if (audio) audioClient = audio;
}

module.exports = { TEXT_MODEL, completeText, streamCompletion, transcribeAudio, setClientsForTests };
