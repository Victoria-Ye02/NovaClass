// PDF text is stored as one string with a marker per page (see
// extractPdfTextWithPageMarkers in classroom.controller) so text_content stays
// a single column while still being splittable back into pages.
const PAGE_MARKER_RE = /\f<<PAGE (\d+)>>\f/g;

function pdfPageMarker(pageNumber) {
  return `\f<<PAGE ${pageNumber}>>\f`;
}

// Materials uploaded before the marker format existed have plain, unmarked
// text_content — this correctly returns [] for those, so callers fall back to
// whole-document-only behaviour.
function splitPagesFromMarkedText(markedText) {
  if (!markedText) return [];
  const matches = [...markedText.matchAll(PAGE_MARKER_RE)];
  return matches.map((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : markedText.length;
    return { page: Number(match[1]), text: markedText.slice(start, end).trim() };
  });
}

// Rebuilds marked text with one page's section replaced — used to cache an OCR
// result back into text_content so future requests for that page skip the
// vision round-trip entirely.
function replacePageText(markedText, pageNumber, newText) {
  const pages = splitPagesFromMarkedText(markedText);
  if (pages.length === 0) return markedText;
  const existingIndex = pages.findIndex(p => p.page === pageNumber);
  if (existingIndex >= 0) {
    pages[existingIndex] = { page: pageNumber, text: newText };
  } else {
    // A page with zero extractable text items (pure-image pages) never got a
    // marker at extraction time at all. Insert one here, otherwise the OCR
    // result silently fails to cache and every request pays the vision call.
    pages.push({ page: pageNumber, text: newText });
    pages.sort((a, b) => a.page - b.page);
  }
  return pages.map(p => `${pdfPageMarker(p.page)}${p.text}`).join("\n\n");
}

module.exports = { PAGE_MARKER_RE, pdfPageMarker, splitPagesFromMarkedText, replacePageText };
