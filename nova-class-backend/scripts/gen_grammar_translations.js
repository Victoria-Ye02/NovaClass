// Writes the Vietnamese version of the Grammar & Meaning content (Claude, in batches) into
// nova-class-frontend/src/pages/victoria/grammarI18n.json: { vi: { units: { "core:1": {...}, "similar:1": {...} } } }.
//   core:N     the short meaning and the example translations of Core Grammar item N
//   similar:N  the difference line, the nuance notes, the quiz explanation and the sentence translations of Similar Grammar group N
// The English text is the source. It can be stopped and started again: units already in the file are skipped and every
// batch is saved as soon as it is done.
//   node scripts/gen_grammar_translations.js            all units      --limit 4   only the first 4 (to try it)
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { completeText } = require("../services/ai/kmateText");
const { generateBatch } = require("../services/topik/boosterTranslations");

const FRONTEND = path.join(__dirname, "../../nova-class-frontend/src/pages/victoria");
const OUT = path.join(FRONTEND, "grammarI18n.json");
const LANGS = ["vi"];
const BATCH = Number(process.env.BATCH) || 5;
const PARALLEL = 3;

const load = async file => import("data:text/javascript;base64," + Buffer.from(fs.readFileSync(path.join(FRONTEND, file), "utf8")).toString("base64"));

async function loadUnits() {
  const { CORE_GRAMMAR, shortMeaningEn } = await load("coreGrammar.js");
  const { SIMILAR_GRAMMAR } = await load("similarGrammar.js");
  const units = [];
  for (const item of CORE_GRAMMAR) units.push({ id: `core:${item.no}`, fields: { short: shortMeaningEn(item), examples: item.examples.map(e => e.en) } });
  for (const g of SIMILAR_GRAMMAR) units.push({ id: `similar:${g.id}`, fields: { diff: g.diff, notes: g.items.map(i => i.note), why: g.quiz.why, sentences: g.items.map(i => i.en) } });
  return units;
}

async function main() {
  const limit = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity;
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const units = await loadUnits();
  const jobs = [];
  for (const lang of LANGS) {
    done[lang] ||= { units: {} };
    const todo = units.filter(u => !done[lang].units[u.id]).slice(0, limit);
    for (let i = 0; i < todo.length; i += BATCH) jobs.push({ lang, batch: todo.slice(i, i + BATCH) });
  }
  console.log(`${jobs.reduce((n, j) => n + j.batch.length, 0)} units to do`);

  const failed = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { lang, batch } = jobs[next++];
      let results;
      try { results = await generateBatch(completeText, batch, lang, "Korean grammar notes, short meanings and example translations"); } catch (error) { batch.forEach(u => failed.push(`${lang} ${u.id} (${error.message})`)); continue; }
      for (const r of results) {
        if (r.fields) done[lang].units[r.unit.id] = r.fields;
        else failed.push(`${lang} ${r.unit.id} (${r.error})`);
      }
      fs.writeFileSync(OUT, JSON.stringify(done, null, 1));
      console.log(LANGS.map(l => `${l}: ${Object.keys(done[l].units).length}`).join("  "));
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(failed.length ? `Not done (run again to retry):\n${failed.join("\n")}` : "All done.");
}

main().catch(error => { console.error(error.message); process.exit(1); });
