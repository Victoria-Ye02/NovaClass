// Revised Romanization of Hangul, syllable by syllable ("가입하다" -> "ga-ip-ha-da"). It spells each syllable as it is
// written and does NOT apply sound changes between syllables (독립 is read "dongnip", this gives "dok-rip"), so it is only a
// reading hint for the flashcards, not a pronunciation guide.
const INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const VOWEL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINAL = ["", "k", "kk", "ks", "n", "nj", "nh", "t", "l", "lk", "lm", "lb", "ls", "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

export function romanize(text) {
  return String(text ?? "").split(/\s+/).filter(Boolean).map(word =>
    [...word].map(ch => {
      const code = ch.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) return ch;
      return INITIAL[Math.floor(code / 588)] + VOWEL[Math.floor((code % 588) / 28)] + FINAL[code % 28];
    }).join("-")
  ).join(" ");
}
