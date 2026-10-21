// The "from question / to question" boxes of Smart Drill. They are plain text boxes (not type="number") because a number box
// rejects every key that is not an ASCII digit, and with a Burmese or Korean keyboard layout the digits come out as ၁၂၃ or
// full-width １２３, so nothing could be typed at all. Those digits are turned into 0-9 and anything else is dropped.
const BURMESE_ZERO = 0x1040;     // ၀ ... ၉
const FULLWIDTH_ZERO = 0xff10;   // ０ ... ９

export function toAsciiDigits(text) {
  return String(text ?? "").replace(/[၀-၉０-９]/g, ch => String(ch.charCodeAt(0) >= FULLWIDTH_ZERO ? ch.charCodeAt(0) - FULLWIDTH_ZERO : ch.charCodeAt(0) - BURMESE_ZERO))
    .replace(/\D/g, "").slice(0, 2);
}

// What a box holds once the student leaves it: a number inside [first, last]; an empty or too small / big box is put right.
export function clampQuestion(value, first, last, fallback) {
  if (value === "" || value === undefined) return String(fallback);
  return String(Math.min(Math.max(Number(value), first), last));
}

// Clicking into a box selects what is in it, so the first digit typed replaces the old number (no need to delete it first).
// The mouse-up that follows the click would drop the selection again, so it is cancelled.
export const selectAll = event => event.target.select();
export const keepSelection = event => event.preventDefault();
