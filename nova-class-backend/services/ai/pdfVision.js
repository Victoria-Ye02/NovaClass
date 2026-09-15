const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const PDFTOPPM_PATH = process.env.PDFTOPPM_PATH || "/opt/homebrew/bin/pdftoppm";

// For materials whose PDF has real embedded, extractable text, that text is
// used directly — no Vision call needed. This is only reached for pages
// where the embedded font lacks a proper text-to-Unicode mapping (common in
// PPT-exported slide decks): the page renders and reads fine visually, but
// pdf-parse recovers nothing. Rasterizing the page and reading it with
// Gemini Vision works around that, since it reads pixels, not the broken
// text layer.
async function ocrPdfPageText(pdfPath, pageNumber) {
  const tmpPrefix = `/tmp/ocrpage_${Date.now()}_${pageNumber}_${Math.random().toString(36).slice(2)}`;
  const pngPath = `${tmpPrefix}.png`;
  try {
    await execFileAsync(PDFTOPPM_PATH, [
      "-r", "150", "-f", String(pageNumber), "-l", String(pageNumber), "-png", "-singlefile", pdfPath, tmpPrefix,
    ], { timeout: 30000 });
    if (!fs.existsSync(pngPath)) return null;

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const base64 = fs.readFileSync(pngPath).toString("base64");
    // The SDK retries 429s internally with growing backoff, which can hang
    // this call (and the "Continue lesson" request awaiting it) for minutes
    // once the free-tier daily quota is exhausted. Race it against a timeout
    // so a quota/rate-limit failure fails fast and falls back to "no page
    // text" instead of stalling the whole lesson turn.
    const result = await Promise.race([
      model.generateContent([
        { inlineData: { data: base64, mimeType: "image/png" } },
        "Transcribe every piece of readable text on this presentation slide or document page, exactly as written, preserving structure (headings, bullet points, labels) and whatever language it's written in. If there is truly no readable text anywhere on the page, respond with exactly: NO_TEXT_FOUND",
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Vision OCR timed out")), 10000)),
    ]);
    const text = (result.response.text() || "").trim();
    if (!text || text === "NO_TEXT_FOUND") return null;
    return text;
  } catch (err) {
    console.warn("[pdfVision] OCR failed:", err.message);
    return null;
  } finally {
    try { fs.unlinkSync(pngPath); } catch { /* already gone or never created */ }
  }
}

module.exports = { ocrPdfPageText };
