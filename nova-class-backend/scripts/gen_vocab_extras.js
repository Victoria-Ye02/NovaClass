// Writes the synonyms / antonyms / example sentences of the TOPIK vocabulary (Claude, in batches) into
// nova-class-frontend/src/pages/victoria/vocabExtra.json. It can be stopped and started again: words already in
// the file are skipped, and every batch is saved as soon as it is done.
//   node scripts/gen_vocab_extras.js            all words      --level 3   one level      --limit 8   only the first 8 (to try it)
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { completeText } = require("../services/ai/kmateText");
const { generateBatch } = require("../services/topik/vocabExtras");

const FRONTEND = path.join(__dirname, "../../nova-class-frontend/src/pages/victoria");
const OUT = path.join(FRONTEND, "vocabExtra.json");
const BATCH = 8;
const PARALLEL = 3;

async function loadWords() {
  const src = fs.readFileSync(path.join(FRONTEND, "vocabData.js"), "utf8");
  const { VOCAB } = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  return Object.entries(VOCAB).flatMap(([level, words]) => words.map(w => ({ level: Number(level), ...w })));
}

async function main() {
  const onlyLevel = process.argv.includes("--level") ? Number(process.argv[process.argv.indexOf("--level") + 1]) : null;
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const limit = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity;
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
        if (r.entry) done[`${r.word.level}:${r.word.no}`] = { syn: r.entry.syn, ant: r.entry.ant, example: r.entry.example };
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
