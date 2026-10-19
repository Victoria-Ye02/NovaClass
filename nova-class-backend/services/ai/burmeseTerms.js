// A Burmese voice can't read Latin letters, and the language model keeps
// leaving technical terms in English no matter how it is asked. So terms are
// converted after writing, the way Burmese speakers say them out loud.

const TERMS = {
  javascript: "ဂျာဗားစကရစ်",
  java: "ဂျာဗား",
  python: "ပိုက်သွန်",
  mysql: "မိုင်အက်စ်ကျူအယ်လ်",
  database: "ဒေတာဘေ့စ်",
  databases: "ဒေတာဘေ့စ်များ",
  server: "ဆာဗာ",
  servers: "ဆာဗာများ",
  slide: "စလိုက်ဒ်",
  slides: "စလိုက်ဒ်များ",
  programming: "ပရိုဂရမ်မင်း",
  program: "ပရိုဂရမ်",
  code: "ကုဒ်",
  file: "ဖိုင်",
  files: "ဖိုင်များ",
  application: "အက်ပလီကေးရှင်း",
  applications: "အက်ပလီကေးရှင်းများ",
  software: "ဆော့ဖ်ဝဲ",
  internet: "အင်တာနက်",
  data: "ဒေတာ",
  table: "ဇယား",
  tables: "ဇယားများ",
};

// Words the model sometimes writes in Thai or Korean instead of Burmese ("to
// install" is a repeat offender), replaced wherever they appear.
const LITERALS = { "ติดตั้ง": "တပ်ဆင်", "설치": "တပ်ဆင်" };
// Anything of these scripts still left over can't be spoken by the voice;
// dropping it is better than leaving a gap of garbled sound.
const UNSPEAKABLE_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u0E00-\u0E7F]+/g;

const LETTERS = {
  A: "အေ", B: "ဘီ", C: "စီ", D: "ဒီ", E: "အီး", F: "အက်ဖ်", G: "ဂျီ", H: "အိတ်ချ်", I: "အိုင်", J: "ဂျေ",
  K: "ကေ", L: "အယ်လ်", M: "အမ်", N: "အန်", O: "အို", P: "ပီ", Q: "ကျူ", R: "အာ", S: "အက်စ်", T: "တီ",
  U: "ယူ", V: "ဗွီ", W: "ဒဗလျူ", X: "အက်စ်", Y: "ဝိုင်", Z: "ဇက်",
};

const TERM_RE = new RegExp(`\\b(${Object.keys(TERMS).sort((a, b) => b.length - a.length).join("|")})\\b`, "gi");
// An upper-case acronym (SQL, JDBC, HTML, API…), optionally ending in a digit run.
const ACRONYM_RE = /\b[A-Z]{2,8}(?=\d*\b)/g;

// Words first, then whatever acronyms are left are spelled letter by letter.
function toSpokenBurmese(text) {
  let out = String(text || "");
  for (const [word, burmese] of Object.entries(LITERALS)) out = out.split(word).join(burmese);
  return out
    .replace(/\b(MySQL)\b/g, (m) => TERMS[m.toLowerCase()])
    .replace(TERM_RE, (m) => TERMS[m.toLowerCase()])
    .replace(ACRONYM_RE, (acronym) => [...acronym].map((letter) => LETTERS[letter]).join(""))
    // A hyphen left between a converted term and a Burmese particle ("slide-ကို").
    .replace(UNSPEAKABLE_RE, "")
    .replace(/(\p{Script=Myanmar})-(?=\p{Script=Myanmar})/gu, "$1");
}

module.exports = { toSpokenBurmese, TERMS, LETTERS };
