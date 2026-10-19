const test = require("node:test");
const assert = require("node:assert/strict");
const { toSpokenBurmese } = require("../services/ai/burmeseTerms");

test("technical terms become the way Burmese speakers say them", () => {
  assert.equal(toSpokenBurmese("Java နဲ့ database"), "ဂျာဗား နဲ့ ဒေတာဘေ့စ်");
  assert.equal(toSpokenBurmese("ဒီ slide ကို"), "ဒီ စလိုက်ဒ် ကို");
  assert.equal(toSpokenBurmese("MySQL server"), "မိုင်အက်စ်ကျူအယ်လ် ဆာဗာ");
});

test("matching is case-insensitive and respects word boundaries", () => {
  assert.equal(toSpokenBurmese("JAVA, Java, java"), "ဂျာဗား, ဂျာဗား, ဂျာဗား");
  assert.equal(toSpokenBurmese("javascript"), "ဂျာဗားစကရစ်", "the longer term wins over 'java'");
  assert.equal(toSpokenBurmese("dataset"), "dataset", "'data' inside another word is left alone");
});

test("leftover acronyms are spelled letter by letter, digits kept", () => {
  assert.equal(toSpokenBurmese("SQL"), "အက်စ်ကျူအယ်လ်");
  assert.equal(toSpokenBurmese("JDBC"), "ဂျေဒီဘီစီ");
  assert.equal(toSpokenBurmese("HTML5"), "အိတ်ချ်တီအမ်အယ်လ်5");
});

test("a hyphen between a converted term and a Burmese particle is removed", () => {
  assert.equal(toSpokenBurmese("slide-ကို ကြည့်မယ်"), "စလိုက်ဒ်ကို ကြည့်မယ်");
});

test("plain Burmese text and empty input pass through unchanged", () => {
  assert.equal(toSpokenBurmese("ဒေတာဘေ့စ်အကြောင်း သင်မယ်။"), "ဒေတာဘေ့စ်အကြောင်း သင်မယ်။");
  assert.equal(toSpokenBurmese(""), "");
  assert.equal(toSpokenBurmese(undefined), "");
});

test("known Thai/Korean slips are mapped to Burmese and any other leftovers are dropped", () => {
  assert.equal(toSpokenBurmese("ဘယ်လိုติดตั้งရမလဲ"), "ဘယ်လိုတပ်ဆင်ရမလဲ");
  assert.equal(toSpokenBurmese("ဖိုင် 파일 စနစ်"), "ဖိုင်  စနစ်");
  assert.equal(toSpokenBurmese("MySQL 설치"), "မိုင်အက်စ်ကျူအယ်လ် တပ်ဆင်");
});
