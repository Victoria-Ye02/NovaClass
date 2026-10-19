// Turns written lecture text into something a TTS engine can perform: no
// markdown or emoji to stumble over, and real pauses where a person would
// breathe. Pure functions so they can be unit-tested without any audio.

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

function cleanForSpeech(text) {
  return String(text || "")
    .replace(EMOJI_RE, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>~]+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function xmlEscape(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Splits into paragraphs, then sentences (Latin, CJK and Burmese endings).
function toParagraphs(text) {
  return cleanForSpeech(text)
    .split(/\n{1,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map(paragraph => (paragraph.match(/[^.!?。！？။]+[.!?。！？။]*["')\]]*\s*/g) || [paragraph])
      .map(sentence => sentence.trim())
      .filter(Boolean));
}

const SENTENCE_PAUSE_MS = 320;
const PARAGRAPH_PAUSE_MS = 720;

// SSML for the Burmese neural voice. The voice has no emotion styles, so the
// natural feel comes from rhythm: a slightly slower pace, a touch more pitch
// than flat, and a real pause after every sentence and a longer one between
// paragraphs. `express` adds an "expressive" tag only where the engine
// supports it (Azure REST); the free Edge endpoint ignores unknown tags.
function burmeseSsml(text, { voice, locale = "my-MM" } = {}) {
  const paragraphs = toParagraphs(text);
  const body = paragraphs
    .map(sentences => sentences.map(sentence => xmlEscape(sentence)).join(`<break time="${SENTENCE_PAUSE_MS}ms"/>`))
    .join(`<break time="${PARAGRAPH_PAUSE_MS}ms"/>`);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voice}">` +
    `<prosody rate="-8%" pitch="+3%" volume="+0%">${body}</prosody>` +
    `</voice></speak>`
  );
}

// ElevenLabs reads "<break time=…/>" tags (not on v3). Pauses only go between
// paragraphs: stuffing breaks after every sentence makes the voice unstable.
function elevenLabsLectureText(text) {
  return toParagraphs(text)
    .map(sentences => sentences.join(" "))
    .join(' <break time="0.7s" /> ');
}

// Groups whole sentences into pieces of at most `maxChars`, in order, never
// cutting a sentence in half. Long narrations are generated piece by piece in
// parallel and joined, which is several times faster than one long request.
function splitForSpeech(text, maxChars = 380) {
  const chunks = [];
  let current = "";
  for (const sentence of toParagraphs(text).flat()) {
    if (current && (current.length + 1 + sentence.length) > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

module.exports = { splitForSpeech, cleanForSpeech, burmeseSsml, elevenLabsLectureText, toParagraphs, SENTENCE_PAUSE_MS, PARAGRAPH_PAUSE_MS };
