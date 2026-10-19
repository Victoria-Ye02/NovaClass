// Writes the Vietnamese and Korean versions of the TOPIK Booster (Claude, in batches) into
// nova-class-frontend/src/pages/victoria/boosterI18n.json: { vi: { units: { "r-1-2": {...}, "guide:reading-time": {...}, general: {...} } }, ko: {...} }.
// The English text of boosterData.js is the source. It can be stopped and started again: units already in the file are
// skipped and every batch is saved as soon as it is done.
//   node scripts/gen_booster_translations.js            both languages      --lang vi   one language      --limit 4   only the first 4 (to try it)
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { completeText } = require("../services/ai/kmateText");
const { LANGUAGES, generateBatch } = require("../services/topik/boosterTranslations");

const FRONTEND = path.join(__dirname, "../../nova-class-frontend/src/pages/victoria");
const OUT = path.join(FRONTEND, "boosterI18n.json");
const BATCH = 4;
const PARALLEL = 3;

async function loadUnits() {
  const src = fs.readFileSync(path.join(FRONTEND, "boosterData.js"), "utf8");
  const { BOOSTER, GUIDES, GENERAL_TIP, TIP_KINDS } = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  const units = [];
  for (const item of BOOSTER) {
    units.push({ id: item.id, fields: { sub: item.sub.en, ...(item.steps ? { steps: item.steps.en } : {}), tips: item.tips.map(t => t.en) } });
  }
  for (const g of GUIDES) {
    units.push({
      id: `guide:${g.id}`,
      fields: {
        title: g.title.en,
        ...(g.listTitle ? { listTitle: g.listTitle.en } : {}),
        ...(g.table ? { tableHead: g.table.head.en, rowLabels: g.table.rows.map(([label]) => label.en) } : {}),
        list: g.list.map(x => x.en),
        ...(g.list.some(x => x.lead) ? { leads: g.list.map(x => x.lead?.en || "") } : {}),
      },
    });
  }
  units.push({ id: "general", fields: { text: GENERAL_TIP.en } });
  void TIP_KINDS;
  return units;
}

async function main() {
  const arg = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
  const only = arg("--lang");
  const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
  const langs = Object.keys(LANGUAGES).filter(l => !only || l === only);
  const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const units = await loadUnits();

  const jobs = [];
  for (const lang of langs) {
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
      try { results = await generateBatch(completeText, batch, lang); } catch (error) { batch.forEach(u => failed.push(`${lang} ${u.id} (${error.message})`)); continue; }
      for (const r of results) {
        if (r.fields) done[lang].units[r.unit.id] = r.fields;
        else failed.push(`${lang} ${r.unit.id} (${r.error})`);
      }
      fs.writeFileSync(OUT, JSON.stringify(done, null, 1));
      console.log(langs.map(l => `${l}: ${Object.keys(done[l]?.units || {}).length}`).join("  "));
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(failed.length ? `Not done (run again to retry):\n${failed.join("\n")}` : "All done.");
}

main().catch(error => { console.error(error.message); process.exit(1); });
