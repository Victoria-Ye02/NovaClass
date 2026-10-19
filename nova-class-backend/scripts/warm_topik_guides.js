// Writes the strategy guides for all 8 TOPIK question types in English, Korean, Burmese and Vietnamese ahead of time, so the first
// student to open a guide does not wait ~20 seconds for the model. Guides already in MySQL are skipped, so it is safe to
// run again. This calls the model (K-Mate's provider) up to 32 times the first time.
//   node scripts/warm_topik_guides.js            all types, all languages
//   node scripts/warm_topik_guides.js my         one language (en | ko | my | vi)
const pool = require("../config/db");
const { completeText } = require("../services/ai/kmateText");
const { QUESTION_TYPES } = require("../services/topik/questionTypes");
const { getStrategyGuide } = require("../services/topik/guides");

const languages = process.argv[2] ? [process.argv[2]] : ["en", "ko", "my", "vi"];

(async () => {
  let written = 0, kept = 0;
  for (const language of languages) {
    for (const type of QUESTION_TYPES) {
      const started = Date.now();
      const guide = await getStrategyGuide(pool, completeText, type.key, language);
      guide.cached ? kept++ : written++;
      console.log(`${guide.cached ? "has " : "made"} ${language}  ${type.key.padEnd(22)} ${guide.cached ? "" : `${Math.round((Date.now() - started) / 1000)}s`}`);
    }
  }
  console.log(`\n${written} written, ${kept} were already there.`);
  process.exit(0);
})().catch(err => { console.error("❌", err.message); process.exit(1); });
