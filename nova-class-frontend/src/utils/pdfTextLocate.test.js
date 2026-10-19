import { describe, expect, it } from "vitest";
import { findPhraseRects } from "./pdfTextLocate";

// A 600x800 page whose PDF origin is bottom-left (y up), like a real one.
const size = { width: 600, height: 800 };
const toViewportRect = (x0, y0, x1, y1) => [x0, size.height - y1, x1, size.height - y0];
const view = { toViewportRect, size };

// "Hello world" at baseline y=700 (100px from the top), 10 chars/word * 6px.
const items = [
  { str: "Hello", transform: [12, 0, 0, 12, 60, 700], width: 30, height: 12 },
  { str: "world", transform: [12, 0, 0, 12, 96, 700], width: 30, height: 12 },
  { str: "Second line here", transform: [12, 0, 0, 12, 60, 650], width: 96, height: 12 },
];

describe("findPhraseRects", () => {
  it("returns nothing for a missing phrase or an empty page", () => {
    expect(findPhraseRects(items, view, "nothing like this")).toEqual([]);
    expect(findPhraseRects(items, view, "")).toEqual([]);
    expect(findPhraseRects([], view, "Hello")).toEqual([]);
    expect(findPhraseRects(items, { toViewportRect, size: { width: 0, height: 0 } }, "Hello")).toEqual([]);
  });

  it("merges a phrase that spans two text pieces on one line into a single stroke", () => {
    const rects = findPhraseRects(items, view, "hello   WORLD");
    expect(rects).toHaveLength(1);
    const [rect] = rects;
    expect(rect.x).toBeCloseTo(60 / 600 - 0.004, 3);
    expect(rect.x + rect.width).toBeCloseTo(126 / 600 + 0.004, 3);
    // 100px from the top of an 800px page, give or take the text's own height
    expect(rect.y).toBeGreaterThan(0.1);
    expect(rect.y).toBeLessThan(0.14);
  });

  it("highlights only the matched part of a longer text piece", () => {
    const [rect] = findPhraseRects(items, view, "line");
    const full = 96;
    // "line" starts at char 7 of "Second line here" (16 chars)
    expect(rect.x).toBeCloseTo((60 + full * (7 / 16)) / 600 - 0.004, 3);
    expect(rect.width).toBeCloseTo((full * (4 / 16)) / 600 + 0.008, 3);
  });

  it("returns one rectangle per line for a phrase that wraps", () => {
    const wrapped = [
      { str: "primary", transform: [12, 0, 0, 12, 60, 700], width: 42, height: 12 },
      { str: "key rules", transform: [12, 0, 0, 12, 60, 680], width: 54, height: 12 },
    ];
    const rects = findPhraseRects(wrapped, view, "primary key");
    expect(rects).toHaveLength(2);
    expect(rects[0].y).toBeLessThan(rects[1].y);
  });

  it("treats regex characters in the phrase literally", () => {
    const odd = [{ str: "cost (USD) ?", transform: [12, 0, 0, 12, 10, 100], width: 70, height: 12 }];
    expect(findPhraseRects(odd, view, "(USD) ?")).toHaveLength(1);
  });

  it("keeps every rectangle inside the page", () => {
    const edge = [{ str: "Edge", transform: [12, 0, 0, 12, 0, 795], width: 24, height: 12 }];
    for (const rect of findPhraseRects(edge, view, "Edge")) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1.0001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(1.0001);
    }
  });
});
