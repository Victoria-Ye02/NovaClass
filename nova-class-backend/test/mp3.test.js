const test = require("node:test");
const assert = require("node:assert/strict");
const { stripMp3Header, joinMp3, frameLengthAt } = require("../services/ai/mp3");

// MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo → 417-byte frames (no padding).
const HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
const frame = fill => Buffer.concat([HEADER, Buffer.alloc(413, fill)]);
const infoFrame = () => {
  const f = frame(0);
  f.write("Info", 36, "latin1");
  return f;
};
const id3 = (payload = 20) => {
  const tag = Buffer.alloc(10 + payload);
  tag.write("ID3", 0, "latin1");
  tag[3] = 4;
  tag[9] = payload; // syncsafe size (small)
  return tag;
};
const clip = (frames, fill) => Buffer.concat([id3(), infoFrame(), ...Array.from({ length: frames }, () => frame(fill))]);

test("frameLengthAt reads MPEG-1 and MPEG-2 Layer III frame sizes", () => {
  assert.equal(frameLengthAt(frame(1), 0), 417);
  assert.equal(frameLengthAt(Buffer.concat([Buffer.from([0xff, 0xf3, 0x64, 0xc4]), Buffer.alloc(140)]), 0), 144);
  assert.equal(frameLengthAt(Buffer.from("not an mp3"), 0), 0);
});

test("stripMp3Header removes the ID3 tag and the Info frame, leaving only audio frames", () => {
  const stripped = stripMp3Header(clip(5, 7));
  assert.equal(stripped.length, 5 * 417);
  assert.equal(stripped.subarray(0, 4).compare(HEADER), 0);
  assert.equal(stripped.includes(Buffer.from("Info")), false);
});

test("a clip without any header is returned untouched", () => {
  const bare = Buffer.concat([frame(1), frame(2)]);
  assert.equal(stripMp3Header(bare), bare);
});

test("joinMp3 gives a file whose length is exactly the audio frames of every clip", () => {
  const joined = joinMp3([clip(3, 1), clip(4, 2), clip(2, 3)]);
  assert.equal(joined.length, (3 + 4 + 2) * 417);
  assert.equal(joined.includes(Buffer.from("Info")), false, "no stale frame counts left to confuse a player");
  assert.equal(joined.toString("latin1", 0, 3) === "ID3", false);
});

test("non-MP3 data passes through joinMp3 unchanged (so a stubbed or odd clip is never damaged)", () => {
  assert.equal(joinMp3([Buffer.from("abc"), Buffer.from("def")]).toString(), "abcdef");
});
