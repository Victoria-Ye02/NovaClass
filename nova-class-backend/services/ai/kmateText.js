// Text generation for K-Mate TOPIK (the practice quiz here; the TOPIK tutor runs in the Python service): Claude when KMATE_AI_PROVIDER is "claude"
// (and a key is set), otherwise OpenAI. The providers are looked up at call time so tests can stub them.
function completeText(request) {
  const provider = (process.env.KMATE_AI_PROVIDER || "").toLowerCase();
  if (provider === "claude" && process.env.ANTHROPIC_API_KEY) return require("./claudeText").completeText(request);
  return require("./openaiText").completeText(request);
}

module.exports = { completeText };
