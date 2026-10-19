const Groq = require("groq-sdk");

require("dotenv").config();

// Text completion now goes to OpenAI (OPENAI_API_KEY) like the rest of the app
// — see openaiText.js, which owns the client, the model (OPENAI_TEXT_MODEL,
// default gpt-4o-mini) and streaming. This module keeps its old name and
// exports so existing callers don't change, and still owns Whisper speech
// recognition, which runs on Groq.
const openai = require("./openaiText");

const TEXT_MODEL = openai.TEXT_MODEL;
let audioClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

const completeText = args => openai.completeText(args);
const streamCompletion = args => openai.streamCompletion(args);

async function transcribeAudio({ file, responseFormat = "text", language, prompt }) {
  return audioClient.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    response_format: responseFormat,
    // Whisper auto-detects language when this is omitted, but for some
    // languages (Burmese notably) it mis-detects a related script and returns
    // gibberish. Passing an ISO-639-1 code forces the right language.
    ...(language ? { language } : {}),
    // A short example of the expected speech nudges spelling and vocabulary
    // without forcing a language; temperature 0 keeps decoding deterministic.
    ...(prompt ? { prompt } : {}),
    temperature: 0,
  });
}

function setClientsForTests({ text, audio } = {}) {
  if (text) openai.setClientForTests(text);
  if (audio) audioClient = audio;
}

module.exports = { TEXT_MODEL, completeText, streamCompletion, transcribeAudio, setClientsForTests };
