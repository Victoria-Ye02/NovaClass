const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
process.env.KMATE_AI_PROVIDER = "openai";

const { DOMAINS, domainByKey, rangeByKey, publicDomains } = require("../services/topik/questionRanges");
const { publicOptions } = require("../services/topik/questionTypes");
const { PATTERNS, patternFor } = require("../services/topik/rangePatterns");

test("three domains with their question ranges", () => {
  assert.deepEqual(Object.values(DOMAINS).map(d => [d.key, d.ko, d.ranges.length]), [["reading", "읽기", 16], ["listening", "듣기", 21], ["writing", "쓰기", 3]]);
  assert.equal(rangeByKey("reading", "r-13-15").ko, "문장 순서 배열");
  assert.equal(rangeByKey("listening", "l-4-8").ko, "이어질 수 있는 말");
  assert.equal(rangeByKey("writing", "w-54").range, "54");
});

test("Reading can also be chosen by level band, with what each band is about", () => {
  const bands = DOMAINS.reading.bands;
  assert.deepEqual(bands.map(b => b.range), ["1~10", "11~25", "26~38", "39~50"]);
  assert.match(rangeByKey("reading", "b-11-25").focus, /main ideas/);
  assert.match(rangeByKey("reading", "b-39-50").focus, /academic, news or literary/);
  assert.equal(rangeByKey("listening", "b-1-10"), null);                    // only Reading has bands
  assert.deepEqual(Object.keys(publicDomains()[0].bands[0]), ["key", "range", "ko"]);
  assert.deepEqual(publicDomains()[1].bands, []);
});

test("a range only belongs to its own domain, unknown values are null", () => {
  assert.equal(rangeByKey("listening", "r-13-15"), null);
  assert.equal(rangeByKey("nope", "r-13-15"), null);
  assert.equal(domainByKey("nope"), null);
  assert.equal(domainByKey(undefined), null);
});

test("the screen gets the domains without the prompt text, inside the quiz options", () => {
  const domains = publicDomains();
  assert.ok(domains.every(d => !("rule" in d)));
  assert.equal(publicOptions().domains.length, 3);
  assert.deepEqual(Object.keys(publicOptions().domains[0].ranges[0]), ["key", "range", "ko"]);
});

test("the ranges are the same question groups as the frontend TOPIK Booster", async () => {
  const file = path.join(__dirname, "../../nova-class-frontend/src/pages/victoria/boosterData.js");
  const { BOOSTER } = await import("data:text/javascript;base64," + Buffer.from(fs.readFileSync(file, "utf8")).toString("base64"));
  for (const skill of ["reading", "listening", "writing"]) {
    const fromBooster = BOOSTER.filter(b => b.skill === skill).map(b => [b.id, b.range.replace(/\s/g, ""), b.ko]);
    assert.deepEqual(DOMAINS[skill].ranges.map(r => [r.key, r.range, r.ko]), fromBooster, `${skill} ranges are out of step with boosterData.js`);
  }
});

test("every question group has its own written pattern, and no pattern is left over", () => {
  const keys = Object.values(DOMAINS).flatMap(d => d.ranges.map(r => r.key));
  assert.deepEqual(Object.keys(PATTERNS).sort(), [...keys].sort());
  for (const key of keys) assert.match(patternFor(key), /Instruction|Two questions|Long texts|Passage/, key);
  assert.equal(patternFor("nope"), "");
});

test("the groups of Reading are not all asked alike: each has a different instruction", () => {
  const reading = DOMAINS.reading.ranges.map(r => patternFor(r.key));
  assert.equal(new Set(reading).size, reading.length);
  assert.match(patternFor("r-1-2"), /\( \)에 들어갈 가장 알맞은 것을 고르십시오/);
  assert.match(patternFor("r-3-4"), /밑줄 친 부분과 의미가 비슷한 것을 고르십시오/);
  assert.match(patternFor("r-13-15"), /순서대로 맞게 배열한 것을 고르십시오/);
  assert.match(patternFor("r-25-27"), /신문 기사의 제목/);
  assert.match(patternFor("r-39-41"), /<보기>의 문장이 들어가기에/);
});
