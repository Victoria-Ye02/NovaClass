import i18n from "./boosterI18n.json";

// The TOPIK Booster text in the language chosen in Settings. Burmese (my) is written in boosterData.js next to the
// English; Vietnamese (vi) and Korean (ko) are translations of the English text in boosterI18n.json
// (scripts/gen_booster_translations.js). Anything missing falls back to English.
export const unit = (id, lang) => i18n[lang]?.units?.[id];

export function subOf(item, lang) {
  if (lang === "my") return item.sub.my;
  return unit(item.id, lang)?.sub ?? item.sub.en;
}
export function stepsOf(item, lang) {
  if (!item.steps) return [];
  if (lang === "my") return item.steps.my;
  const translated = unit(item.id, lang)?.steps;
  return translated?.length === item.steps.en.length ? translated : item.steps.en;
}
export function tipOf(item, index, lang) {
  const tip = item.tips[index];
  if (lang === "my") return tip.my;
  return unit(item.id, lang)?.tips?.[index] ?? tip.en;
}
export const kindLabel = (kind, lang) => kind[lang] ?? kind.en;

// the fields of a guide card in the chosen language
export function guideOf(guide, lang) {
  if (lang === "my") {
    return { title: guide.title.my, listTitle: guide.listTitle?.my, head: guide.table?.head.my, rows: guide.table?.rows.map(([label]) => label.my), list: guide.list.map(x => x.my), leads: guide.list.map(x => x.lead?.my) };
  }
  const u = unit(`guide:${guide.id}`, lang);
  const pick = (translated, source) => (translated && translated.length === source.length ? translated : source);
  return {
    title: u?.title ?? guide.title.en,
    listTitle: guide.listTitle ? (u?.listTitle ?? guide.listTitle.en) : undefined,
    head: guide.table ? pick(u?.tableHead, guide.table.head.en) : undefined,
    rows: guide.table ? pick(u?.rowLabels, guide.table.rows.map(([label]) => label.en)) : undefined,
    list: pick(u?.list, guide.list.map(x => x.en)),
    leads: pick(u?.leads, guide.list.map(x => x.lead?.en || "")).map(x => x || undefined),
  };
}

export const generalTipOf = (tip, lang) => (lang === "my" ? tip.my : unit("general", lang)?.text ?? tip.en);
