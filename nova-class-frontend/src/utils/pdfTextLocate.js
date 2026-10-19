// Finds where a phrase sits on a PDF page, as rectangles in fractions (0..1) of
// the page — the same units the AI-highlight overlay uses, so the result drops
// straight onto the page surface at any zoom.
//
// `items` is pdf.js getTextContent().items; `toViewportRect` converts a PDF
// user-space box [x0, y0, x1, y1] into page pixels (viewport.convertToViewport-
// Rectangle bound to a scale-1 viewport) and `size` is that viewport's
// { width, height }. Both are injected so this stays a pure, testable function.

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findPhraseRects(items, { toViewportRect, size }, phrase) {
  const words = String(phrase || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || !size?.width || !size?.height) return [];

  // Items are joined with a space; remember where each one starts so a match
  // can be mapped back to the pieces of text it covers.
  const spans = [];
  let joined = "";
  for (const item of items || []) {
    if (typeof item?.str !== "string" || item.str.length === 0) continue;
    if (joined) joined += " ";
    spans.push({ item, start: joined.length, end: joined.length + item.str.length });
    joined += item.str;
  }

  const pattern = new RegExp(words.map(escapeRegExp).join("\\s+"), "i");
  const match = pattern.exec(joined);
  if (!match) return [];
  const matchStart = match.index;
  const matchEnd = matchStart + match[0].length;

  const boxes = [];
  for (const { item, start, end } of spans) {
    const from = Math.max(start, matchStart);
    const to = Math.min(end, matchEnd);
    if (to <= from) continue;
    const length = item.str.length;
    const [a, b, , d, e, f] = item.transform || [];
    const itemWidth = item.width || Math.abs(a || 0) * length * 0.5;
    const itemHeight = item.height || Math.abs(d || 0) || Math.abs(b || 0) || 10;
    const x0 = e + itemWidth * ((from - start) / length);
    const x1 = e + itemWidth * ((to - start) / length);
    // PDF y grows upward from the baseline; text hangs ~20% below it.
    const [vx0, vy0, vx1, vy1] = toViewportRect(x0, f - itemHeight * 0.2, x1, f + itemHeight * 0.85);
    boxes.push({
      left: Math.min(vx0, vx1),
      right: Math.max(vx0, vx1),
      top: Math.min(vy0, vy1),
      bottom: Math.max(vy0, vy1),
    });
  }

  // Pieces of one line become one rectangle, so a phrase reads as a single
  // highlighter stroke instead of a row of boxes.
  const lines = [];
  for (const box of boxes.sort((p, q) => p.top - q.top || p.left - q.left)) {
    const line = lines.find(l => Math.abs(l.top - box.top) < (l.bottom - l.top) * 0.6);
    if (line) {
      line.left = Math.min(line.left, box.left);
      line.right = Math.max(line.right, box.right);
      line.top = Math.min(line.top, box.top);
      line.bottom = Math.max(line.bottom, box.bottom);
    } else {
      lines.push({ ...box });
    }
  }

  const pad = 0.004;
  const clamp = value => Math.min(Math.max(value, 0), 1);
  return lines.map(l => {
    const x = clamp(l.left / size.width - pad);
    const y = clamp(l.top / size.height - pad);
    return {
      x,
      y,
      width: clamp(l.right / size.width + pad) - x,
      height: clamp(l.bottom / size.height + pad) - y,
    };
  }).filter(rect => rect.width > 0 && rect.height > 0);
}
