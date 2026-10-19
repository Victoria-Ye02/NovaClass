// Pure helpers for the lecture teleprompter, kept out of the components so the
// highlight maths can be unit-tested without rendering anything.

// Splits narration into speakable sentences. Handles Latin, CJK and Burmese
// sentence endings, and keeps the punctuation attached to its sentence.
export function splitSentences(text) {
  const value = String(text || "");
  const parts = value.match(/[^.!?。！？။\n]+[.!?。！？။]*["')\]]*\s*/g);
  const sentences = (parts || [value]).filter(part => part.trim().length > 0);
  return sentences.length ? sentences : [value];
}

// Which sentence is being spoken at `progress` (0..1)? There are no word
// timestamps yet, so each sentence gets a share of the audio proportional to
// its length — close enough to read along with.
export function activeSentenceIndex(sentences, progress) {
  if (!sentences.length) return -1;
  const total = sentences.reduce((sum, sentence) => sum + sentence.trim().length, 0);
  if (total === 0) return 0;
  const target = Math.min(Math.max(Number(progress) || 0, 0), 0.9999) * total;
  let seen = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    seen += sentences[i].trim().length;
    if (target < seen) return i;
  }
  return sentences.length - 1;
}

export function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
