// Writes the English and Vietnamese meanings of the idioms / proverbs / news metaphors (Claude, in batches) into
// nova-class-frontend/src/pages/victoria/idiomI18n.json, keyed "idiom:1", "proverb:12", "news:3". It can be stopped and
// started again: entries already in the file are skipped and every batch is saved as soon as it is done.
//   node scripts/gen_idiom_translations.js            everything      --limit 8   only the first 8 (to try it)
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { completeText } = require("../services/ai/kmateText");
const { generateBatch } = require("../services/topik/idiomTranslations");

const FRONTEND = path.join(__dirname, "../../nova-class-frontend/src/pages/victoria");
const OUT = path.join(FRONTEND, "idiomI18n.json");
const BATCH = 15;
const PARALLEL = 3;

async function loadItems() {
  const src = fs.readFileSync(path.join(FRONTEND, "idiomData.js"), "utf8");
  const { IDIOM_DATA } = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  return Object.entries(IDIOM_DATA).flatMap(([category, rows]) => rows.map(r => ({ key: `${category}:${r.n}`, ...r })));
}

async function main() {
  const limit = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity;
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = (await loadItems()).filter(x => !done[x.key]).slice(0, limit);
  console.log(`${todo.length} entries to do`);

  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  const failed = [];
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      let results;
      try { results = await generateBatch(completeText, batch); } catch (error) { batch.forEach(x => failed.push(`${x.key} ${x.kr} (${error.message})`)); continue; }
      for (const r of results) {
        if (r.entry) done[r.item.key] = r.entry;
        else failed.push(`${r.item.key} ${r.item.kr} (${r.error})`);
      }
      fs.writeFileSync(OUT, JSON.stringify(done, null, 1));
      console.log(`${Object.keys(done).length} done`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(failed.length ? `Not done (run again to retry):\n${failed.join("\n")}` : "All done.");
}

main().catch(error => { console.error(error.message); process.exit(1); });
