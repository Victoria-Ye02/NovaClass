// Writes the Smart Drill questions ahead of time and stores them in MySQL (topik_question_bank), so a student who picks an exam
// number gets a stored question at once instead of waiting for the model. Numbers that already have enough questions are
// skipped, so it is safe to run again (a second pass with --per 2 adds a different question for every number). This calls the
// model (K-Mate's provider): about one request per 5 questions.
//   node scripts/warm_question_bank.js                         reading, listening, writing x medium, hard x my, en
//   node scripts/warm_question_bank.js reading hard my         one section / level / language
//   node scripts/warm_question_bank.js reading hard my --per 2 two questions for every number
const pool = require("../config/db");
const controller = require("../controllers/victoria/kmate.controller");
const questionBank = require("../services/topik/questionBank");
const { domainByKey } = require("../services/topik/questionRanges");

const args = process.argv.slice(2);
const perAt = args.indexOf("--per");
const per = perAt >= 0 ? Math.max(1, parseInt(args.splice(perAt, 2)[1], 10) || 1) : 1;
const [domainArg, difficultyArg, languageArg] = args;
const domains = domainArg ? [domainArg] : ["reading", "listening", "writing"];
const difficulties = difficultyArg ? [difficultyArg] : ["medium", "hard"];
const languages = languageArg ? [languageArg] : ["my", "en"];
const CHUNK = 15;                                   // numbers per request group; each is cut into batches of 5 inside

(async () => {
  let stored = 0;
  for (const domain of domains) {
    const info = domainByKey(domain);
    if (!info) throw new Error(`unknown section: ${domain}`);
    const [min, max] = domain === "writing" ? [51, 54] : [1, 50];
    for (const difficulty of difficulties) for (const language of languages) {
      const have = await questionBank.countByNumber(pool, { domain, difficulty, language });
      const need = [];
      for (let n = min; n <= max; n++) if ((have.get(n) || 0) < per) need.push(n);
      console.log(`${domain} ${difficulty} ${language}: ${need.length} of ${max - min + 1} numbers need a question`);
      for (let i = 0; i < need.length; i += CHUNK) {
        const group = need.slice(i, i + CHUNK);
        const started = Date.now();
        try {
          const n = await controller.fillQuestionBank({ domain, difficulty, language, numbers: group });
          stored += n;
          console.log(`  Q${group[0]}~${group[group.length - 1]}: ${n} stored (${Math.round((Date.now() - started) / 1000)}s)`);
        } catch (err) { console.log(`  Q${group[0]}~${group[group.length - 1]}: failed - ${err.message}`); }
      }
    }
  }
  console.log(`\n${stored} questions stored.`);
  process.exit(0);
})().catch(err => { console.error("❌", err.message); process.exit(1); });
