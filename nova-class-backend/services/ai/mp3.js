// Joining MP3 clips by simple concatenation works for playback, but every clip
// the TTS returns starts with an ID3 tag and a "Xing"/"Info" frame whose frame
// count describes ONLY that clip. A browser trusts the first one it meets, so
// the joined file would report the first clip's length (wrong progress bar,
// wrong time). Stripping both from every clip leaves bare audio frames, whose
// length a player works out correctly from the file size.

const BITRATES = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

// Length in bytes of the MPEG Layer III frame starting at `offset`, or 0 if
// there isn't a valid one there.
function frameLengthAt(buffer, offset) {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) return 0;
  const version = (buffer[offset + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (buffer[offset + 1] >> 1) & 3; // 1 = Layer III
  if (layer !== 1 || version === 1) return 0;
  const bitrateIndex = buffer[offset + 2] >> 4;
  const rateIndex = (buffer[offset + 2] >> 2) & 3;
  const padding = (buffer[offset + 2] >> 1) & 1;
  const bitrate = (version === 3 ? BITRATES.mpeg1 : BITRATES.mpeg2)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  if (!bitrate || !sampleRate || bitrateIndex === 15) return 0;
  return Math.floor(((version === 3 ? 144 : 72) * bitrate) / sampleRate) + padding;
}

function stripMp3Header(buffer) {
  let offset = 0;
  if (buffer.length > 10 && buffer.toString("latin1", 0, 3) === "ID3") {
    const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
    offset = 10 + size + ((buffer[5] & 0x10) ? 10 : 0);
  }
  const length = frameLengthAt(buffer, offset);
  if (length) {
    const tag = buffer.toString("latin1", offset + 4, offset + 4 + 60);
    // The Xing/Info frame is an empty "frame" carrying only the header text.
    if (/Xing|Info/.test(tag)) offset += length;
  }
  return offset > 0 ? buffer.subarray(offset) : buffer;
}

function joinMp3(clips) {
  return Buffer.concat(clips.map(stripMp3Header));
}

module.exports = { stripMp3Header, joinMp3, frameLengthAt };
