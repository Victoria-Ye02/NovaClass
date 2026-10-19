const OpenAI = require("openai");

require("dotenv").config();

// OpenAI's own API (OPENAI_API_KEY), not OpenRouter: Code Assistant / Homework
// Coach and the PDF classroom tutor (Nova Teacher, lesson summaries, page
// reading) all go through here. groqText.js still serves the features that
// have not moved yet (it is a different key, base URL and model roster).
// Set OPENAI_TEXT_MODEL to trade speed for quality (e.g. "gpt-4o").
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
let client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function completeText({ messages, maxTokens = 1024, temperature, model = TEXT_MODEL, responseFormat }) {
  return client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });
}

// Yields text deltas as they arrive so voice mode can start speaking the first
// sentence while the model is still writing the rest.
async function* streamCompletion({ messages, maxTokens = 1024, temperature, model = TEXT_MODEL }) {
  const stream = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// Reads an image (a rasterised PDF page) with OpenAI vision and returns the
// model's text answer. `detail: "high"` makes small slide text legible.
async function describeImage({ base64, mimeType = "image/png", prompt, maxTokens = 1200, model = TEXT_MODEL, detail = "auto" }) {
  const completion = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail } },
      ],
    }],
  });
  return (completion.choices?.[0]?.message?.content || "").trim();
}

function setClientForTests(testClient) {
  client = testClient;
}

module.exports = { TEXT_MODEL, completeText, streamCompletion, describeImage, setClientForTests };
