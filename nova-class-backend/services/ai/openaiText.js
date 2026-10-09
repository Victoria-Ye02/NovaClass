const OpenAI = require("openai");

require("dotenv").config();

// Separate from groqText.js's textClient on purpose — that one is OpenRouter
// (a different API key, different base URL, different model roster) even
// though it uses the same `openai` SDK class under the hood. Code Assistant
// specifically wants to hit OpenAI's own API directly, not proxy through
// OpenRouter like the rest of the app's text completions do.
const TEXT_MODEL = "gpt-4o-mini";
let client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function completeText({ messages, maxTokens = 1024, temperature, model = TEXT_MODEL }) {
  return client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
  });
}

function setClientForTests(testClient) {
  client = testClient;
}

module.exports = { TEXT_MODEL, completeText, setClientForTests };
