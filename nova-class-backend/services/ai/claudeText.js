require("dotenv").config();

// Anthropic's Messages API (ANTHROPIC_API_KEY), used for K-Mate TOPIK only (practice quiz; the TOPIK tutor is the
// Python service). The Homework Coach and the code assistant stay on OpenAI. It returns the same shape as openaiText.completeText (choices[0].message.content), so the
// callers do not care which provider answered. Set ANTHROPIC_MODEL to change the model.
const URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

// OpenAI-style messages -> Claude's `system` + strictly alternating user/assistant turns.
function toClaudeMessages(messages) {
  const system = [];
  const turns = [];
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content : String(m.content ?? "");
    if (m.role === "system") { system.push(text); continue; }
    const role = m.role === "assistant" ? "assistant" : "user";
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += "\n\n" + text;
    else turns.push({ role, content: text });
  }
  if (turns.length === 0 || turns[0].role !== "user") turns.unshift({ role: "user", content: "(start)" });
  return { system: system.join("\n\n"), turns };
}

// (`temperature` is accepted for compatibility but not sent: the current Claude models reject it.)
async function completeText({ messages, maxTokens = 1024, model, responseFormat }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const { system, turns } = toClaudeMessages(messages);
  const jsonRule = responseFormat?.type === "json_object" ? "\n\nRespond with one valid JSON object only: no markdown fences and no text before or after it." : "";
  const body = {
    // callers may still pass an OpenAI model name (e.g. "gpt-4o"); that is not a Claude model
    model: model && /^claude/.test(model) ? model : process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    // the limits were sized for OpenAI; Burmese and Korean take far more tokens with Claude (a lesson was cut off at 3000)
    max_tokens: Math.min(maxTokens * 3, 16000),
    messages: turns,
    // the answer is the product here; extra thinking tokens would only eat into max_tokens
    thinking: { type: "between_tools" },
    ...(system || jsonRule ? { system: system + jsonRule } : {}),
  };
  const res = await fetch(URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Claude request failed (${res.status})`);
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return { choices: [{ message: { role: "assistant", content: text }, finish_reason: data.stop_reason === "max_tokens" ? "length" : "stop" }], usage: data.usage };
}

module.exports = { completeText, toClaudeMessages };
