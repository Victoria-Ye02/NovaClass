// Writes the English / Vietnamese / Korean meanings of the TOPIK vocabulary and the English / Vietnamese translations
// of its example sentences (Claude, in batches) into nova-class-frontend/src/pages/victoria/vocabI18n.json.
// Run it after scripts/gen_vocab_extras.js (the example sentences are what gets translated). It can be stopped and
// started again: words already in the file are skipped and every batch is saved as soon as it is done.
//   node scripts/gen_vocab_translations.js            all words      --level 3   one level      --limit 8   only the first 8
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { completeText } = require("../services/ai/kmateText");
const { generateBatch } = require("../services/topik/vocabTranslations");

const FRONTEND = path.join(__dirname, "../../nova-class-frontend/src/pages/victoria");
const OUT = path.join(FRONTEND, "vocabI18n.json");
const EXTRA = path.join(FRONTEND, "vocabExtra.json");
const BATCH = 12;
const PARALLEL = 3;

async function loadWords() {
  const src = fs.readFileSync(path.join(FRONTEND, "vocabData.js"), "utf8");
  const { VOCAB } = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  const extras = fs.existsSync(EXTRA) ? JSON.parse(fs.readFileSync(EXTRA, "utf8")) : {};
  return Object.entries(VOCAB).flatMap(([level, words]) => words.map(w => ({ level: Number(level), ...w, example: extras[`${level}:${w.no}`]?.example })));
}

async function main() {
  const arg = name => (process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : null);
  const onlyLevel = arg("--level");
  const limit = arg("--limit") ?? Infinity;
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = (await loadWords()).filter(w => (!onlyLevel || w.level === onlyLevel) && !done[`${w.level}:${w.no}`]).slice(0, limit);
  console.log(`${todo.length} words to do`);

  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  const failed = [];
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      let results;
      try { results = await generateBatch(completeText, batch); } catch (error) { batch.forEach(word => failed.push(`${word.level}:${word.no} ${word.ko} (${error.message})`)); continue; }
      for (const r of results) {
        if (r.entry) done[`${r.word.level}:${r.word.no}`] = r.entry;
        else failed.push(`${r.word.level}:${r.word.no} ${r.word.ko} (${r.error})`);
      }
      fs.writeFileSync(OUT, JSON.stringify(done, null, 1));
      console.log(`${Object.keys(done).length} done`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(failed.length ? `Not done (run again to retry):\n${failed.join("\n")}` : "All done.");
}

main().catch(error => { console.error(error.message); process.exit(1); });
