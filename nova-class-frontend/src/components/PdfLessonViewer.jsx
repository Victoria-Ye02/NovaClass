import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import PdfHighlightOverlay from "./PdfHighlightOverlay";
import PdfThumbnailSidebar from "./PdfThumbnailSidebar";
import Icon from "./Icon";
import { useLang } from "../LanguageContext";
import API from "../services/api";
import "react-pdf/dist/Page/TextLayer.css";
import "./PdfLessonViewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];
const NO_HIGHLIGHTS = [];

function viewerPageWidth() {
  if (typeof window === "undefined") return 820;
  return window.innerWidth <= 640
    ? Math.max(240, window.innerWidth - 32)
    : Math.min(960, window.innerWidth - 160);
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || ["input", "textarea", "select"].includes(tagName);
}

const PdfLessonViewer = forwardRef(function PdfLessonViewer({
  fileUrl,
  title,
  bookmarks,
  syncingPage,
  bookmarkError,
  onToggleBookmark,
  onDismissEmptySpace,
  onPdfReady,
  onPageChange,
  highlightState,
}, ref) {
  const {
    status: highlightStatus = "idle",
    progress: highlightProgress = { completedPages: 0, totalPages: 0 },
    highlights: allHighlights = {},
    visible: highlightsVisible = true,
    setVisible: setHighlightsVisible,
    retry: retryHighlights,
  } = highlightState || {};

  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageWidth, setPageWidth] = useState(viewerPageWidth);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [savedPagesOpen, setSavedPagesOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(true);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [textSelection, setTextSelection] = useState(null); // null | { text, rect }
  const [translation, setTranslation] = useState(null); // null | { loading, text, error }
  const [activateHighlightId, setActivateHighlightId] = useState(null);
  const { lang } = useLang();
  const viewerRootRef = useRef(null);
  const pageSurfaceRef = useRef(null);
  const wheelCooldownRef = useRef(false);

  const savedPages = useMemo(
    () => [...new Set(bookmarks)].sort((a, b) => a - b),
    [bookmarks]
  );
  const currentPageSaved = savedPages.includes(currentPage);
  const bookmarkBusy = syncingPage !== null;
  const renderedPageWidth = pageWidth * zoomPercent / 100;
  const currentPageHighlights = allHighlights[currentPage] || NO_HIGHLIGHTS;

  useEffect(() => {
    const onResize = () => setPageWidth(viewerPageWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (numPages) onPageChange?.(currentPage, numPages);
  }, [currentPage, numPages, onPageChange]);

  // Thumbnail sidebar defaults to open per lesson. A manual close should
  // stick while browsing the current lesson (page nav, zoom, retries), but
  // opening a different lesson (a genuine fileUrl change) resets it back to
  // open rather than carrying over the previous lesson's collapsed state.
  const previousFileUrlRef = useRef(fileUrl);
  useEffect(() => {
    if (previousFileUrlRef.current !== fileUrl) {
      previousFileUrlRef.current = fileUrl;
      setThumbnailsOpen(true);
    }
  }, [fileUrl]);

  const onDocumentLoad = useCallback((pdf) => {
    setNumPages(pdf.numPages);
    setCurrentPage(1);
    setPageInput("1");
    setLoadError(false);
    setPdfDocument(pdf);
    onPdfReady?.(pdf);
  }, [onPdfReady]);

  const changeZoom = useCallback((direction) => {
    setZoomPercent((currentZoom) => {
      const currentIndex = ZOOM_LEVELS.indexOf(currentZoom);
      const nextIndex = Math.min(
        Math.max(currentIndex + direction, 0),
        ZOOM_LEVELS.length - 1
      );
      return ZOOM_LEVELS[nextIndex];
    });
  }, []);

  const resetZoom = useCallback(() => setZoomPercent(100), []);

  const goToPage = useCallback((requestedPage) => {
    if (!numPages) return;
    const parsed = Number.parseInt(requestedPage, 10);
    const nextPage = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), numPages)
      : currentPage;
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
  }, [currentPage, numPages]);

  // Lets a parent (MaterialPreview, on the AI teaching panel's behalf) turn
  // the page itself — e.g. "explain this page, then move to the next one" —
  // the same way a bookmark thumbnail click or the prev/next buttons already
  // do internally. goToPage already clamps to [1, numPages] and no-ops
  // before the document has loaded, so callers don't need their own bounds
  // checking.
  useImperativeHandle(ref, () => ({ goToPage }), [goToPage]);

  useEffect(() => {
    function onKeyDown(event) {
      if (
        savedPagesOpen ||
        event.defaultPrevented ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const zoomModifier = event.metaKey || event.ctrlKey;
      if (zoomModifier && !event.altKey) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          changeZoom(1);
          return;
        }
        if (event.key === "-") {
          event.preventDefault();
          changeZoom(-1);
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          resetZoom();
          return;
        }
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      goToPage(currentPage + (event.key === "ArrowRight" ? 1 : -1));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeZoom, currentPage, goToPage, resetZoom, savedPagesOpen]);

  // Trackpad two-finger swipes turn pages. Without this, a horizontal swipe
  // falls straight through to the browser's native swipe-to-go-back/forward
  // gesture instead — every attempted page turn silently pops a real history
  // entry, so by the time the reader actually means to go back, history has
  // already been walked back several steps and "back" appears to jump far
  // past the classroom page it should land on.
  // Listens on the whole viewer (toolbar + thumbnail rail + page surface),
  // not just the page surface: a swipe with the cursor over the sidebar or
  // toolbar is just as capable of triggering that native gesture, and used
  // to slip through unblocked.
  // { passive: false } is required for preventDefault() to actually suppress
  // that native gesture (React's own onWheel prop can't opt out of passive).
  useEffect(() => {
    const el = viewerRootRef.current;
    if (!el) return;

    function onWheel(event) {
      const { deltaX, deltaY } = event;
      if (Math.abs(deltaX) <= Math.abs(deltaY) || Math.abs(deltaX) < 12) return;
      event.preventDefault();
      if (wheelCooldownRef.current) return;
      wheelCooldownRef.current = true;
      setTimeout(() => { wheelCooldownRef.current = false; }, 350);
      goToPage(currentPage + (deltaX > 0 ? 1 : -1));
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [currentPage, goToPage]);

  function commitPageInput() {
    goToPage(pageInput);
  }

  function onBackgroundClick(event) {
    if (event.target === event.currentTarget) onDismissEmptySpace?.();
  }

  function onPageMouseUp(event) {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || selection.rangeCount === 0) {
      setTextSelection(null);
      // Not a drag-selection — check whether this was a plain click on a
      // highlighted word. The highlight regions themselves are
      // pointer-events: none (so they never steal a text-selection drag),
      // so a click here always lands on the text layer; hit-test it against
      // this page's highlight rects to still open that highlight's popover.
      const surface = pageSurfaceRef.current;
      if (surface) {
        const surfaceRect = surface.getBoundingClientRect();
        const fx = (event.clientX - surfaceRect.left) / surfaceRect.width;
        const fy = (event.clientY - surfaceRect.top) / surfaceRect.height;
        const hit = currentPageHighlights.find((highlight) =>
          (highlight.rects || []).some(
            (rect) => fx >= rect.x && fx <= rect.x + rect.width && fy >= rect.y && fy <= rect.y + rect.height
          )
        );
        if (hit) setActivateHighlightId(hit.id);
      }
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setTextSelection({ text, rect });
  }

  async function translateSelection() {
    if (!textSelection) return;
    const { text } = textSelection;
    setTranslation({ loading: true, text: "", error: null });
    try {
      const { data } = await API.post("/ai/translate", { text, targetLanguage: lang });
      setTranslation({ loading: false, text: data.translation, error: null });
    } catch (err) {
      setTranslation({ loading: false, text: "", error: err.response?.data?.error || "Translation failed." });
    }
  }

  return (
    <section ref={viewerRootRef} className="pdf-lesson-viewer" aria-label={`PDF viewer: ${title}`}>
      <div className="pdf-viewer-toolbar" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="pdf-toolbar-button"
          aria-label="Previous page"
          aria-keyshortcuts="ArrowLeft"
          disabled={!numPages || currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          ←
        </button>
        <label className="pdf-page-control">
          <span className="sr-only">Page number</span>
          <input
            aria-label="Page number"
            type="number"
            min="1"
            max={numPages || 1}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={commitPageInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitPageInput();
            }}
          />
          <span aria-hidden="true">/</span>
          <span>{numPages || "—"}</span>
        </label>
        <button
          type="button"
          className="pdf-toolbar-button"
          aria-label="Next page"
          aria-keyshortcuts="ArrowRight"
          disabled={!numPages || currentPage >= numPages}
          onClick={() => goToPage(currentPage + 1)}
        >
          →
        </button>
        <span className="pdf-toolbar-divider" aria-hidden="true" />
        <div className="pdf-zoom-controls" role="group" aria-label="PDF zoom controls">
          <button
            type="button"
            className="pdf-toolbar-button pdf-zoom-step"
            aria-label="Zoom out"
            aria-keyshortcuts="Control+- Meta+-"
            disabled={zoomPercent === ZOOM_LEVELS[0]}
            onClick={() => changeZoom(-1)}
          >
            −
          </button>
          <button
            type="button"
            className="pdf-zoom-reset"
            aria-label="Reset zoom to 100%"
            aria-keyshortcuts="Control+0 Meta+0"
            onClick={resetZoom}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="pdf-toolbar-button pdf-zoom-step"
            aria-label="Zoom in"
            aria-keyshortcuts="Control+= Meta+="
            disabled={zoomPercent === ZOOM_LEVELS.at(-1)}
            onClick={() => changeZoom(1)}
          >
            +
          </button>
        </div>
        {highlightStatus !== "idle" && (
          <>
            <span className="pdf-toolbar-divider" aria-hidden="true" />
            <div className="pdf-highlight-toolbar" role="group" aria-label="AI highlight controls">
              {highlightStatus === "failed" ? (
                <button
                  type="button"
                  className="pdf-highlight-retry"
                  onClick={() => retryHighlights?.()}
                >
                  AI 분석 재시도
                </button>
              ) : highlightStatus === "ready" ? (
                <button
                  type="button"
                  className={`pdf-highlight-toggle${highlightsVisible ? " is-active" : ""}`}
                  aria-label="Toggle AI highlights"
                  aria-pressed={highlightsVisible}
                  onClick={() => setHighlightsVisible?.(!highlightsVisible)}
                >
                  <Icon name="sparkling" size={14} alt="" /> AI 하이라이트
                </button>
              ) : (
                <span
                  className="pdf-highlight-progress"
                  role="status"
                  aria-label="AI highlight analysis progress"
                >
                  AI 분석 중 {highlightProgress.completedPages}/{highlightProgress.totalPages}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="pdf-viewer-body">
        <div className={`pdf-thumbnail-sidebar${thumbnailsOpen ? " is-open" : ""}`}>
          <div className="pdf-thumbnail-sidebar-header">
            <button
              type="button"
              className="pdf-thumbnail-toggle"
              aria-label="Toggle page thumbnails"
              aria-pressed={thumbnailsOpen}
              aria-expanded={thumbnailsOpen}
              onClick={() => setThumbnailsOpen((open) => !open)}
            >
              <Icon name="thumbnails" size={17} alt="" />
            </button>
            {thumbnailsOpen && <span className="pdf-thumbnail-sidebar-title">Thumbnails</span>}
          </div>
          <div aria-hidden={!thumbnailsOpen} inert={!thumbnailsOpen}>
            <PdfThumbnailSidebar
              pdfDocument={pdfDocument}
              numPages={numPages}
              currentPage={currentPage}
              onSelectPage={goToPage}
            />
          </div>
        </div>
        <div
          className="pdf-viewer-background"
          data-testid="pdf-viewer-background"
          onClick={onBackgroundClick}
        >
        {loadError ? (
          <div className="pdf-viewer-status" onClick={(event) => event.stopPropagation()}>
            <span className="pdf-status-icon" aria-hidden="true">!</span>
            <strong>PDF를 불러오지 못했습니다.</strong>
            <button
              type="button"
              className="pdf-retry-button"
              onClick={() => {
                setLoadError(false);
                setRetryKey((key) => key + 1);
              }}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div
            ref={pageSurfaceRef}
            className="pdf-page-surface"
            data-testid="pdf-page-surface"
            onClick={(event) => event.stopPropagation()}
            onMouseUp={onPageMouseUp}
          >
            <Document
              key={retryKey}
              file={fileUrl}
              onLoadSuccess={onDocumentLoad}
              onLoadError={() => setLoadError(true)}
              loading={<div className="pdf-loading-card">PDF를 불러오는 중…</div>}
            >
              <Page
                pageNumber={currentPage}
                width={renderedPageWidth}
                renderAnnotationLayer={false}
                renderTextLayer
                loading={<div className="pdf-page-skeleton" style={{ width: renderedPageWidth }} />}
              />
            </Document>
            <PdfHighlightOverlay
              highlights={currentPageHighlights}
              visible={highlightsVisible}
              activateId={activateHighlightId}
            />
          </div>
        )}
        </div>
        {textSelection && (
          <button
            type="button"
            className="pdf-translate-trigger"
            aria-label="Translate selected text"
            style={{
              position: "fixed",
              top: textSelection.rect.top - 34,
              left: textSelection.rect.left + textSelection.rect.width / 2,
              transform: "translateX(-50%)",
            }}
            onClick={() => { translateSelection(); setTextSelection(null); }}
          >
            <Icon name="translation" size={14} alt="" /> Translate selected text
          </button>
        )}
        {translation && (
          <div
            role="dialog"
            aria-label="PDF translation"
            className="pdf-translation-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pdf-translation-dialog-header">
              <strong>{lang === "my" ? "ဘာသာပြန်ချက်" : "Translation"}</strong>
              <button
                type="button"
                aria-label="Close translation"
                onClick={() => setTranslation(null)}
              >
                ×
              </button>
            </div>
            {translation.loading ? (
              <div className="pdf-translation-loading">{lang === "my" ? "ဘာသာပြန်နေသည်…" : "Translating…"}</div>
            ) : translation.error ? (
              <div className="pdf-translation-error">{translation.error}</div>
            ) : (
              <p className="pdf-translation-text">{translation.text}</p>
            )}
          </div>
        )}
      </div>

      <div className="pdf-floating-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="pdf-saved-pages-button"
          aria-label="Open saved pages"
          aria-expanded={savedPagesOpen}
          onClick={() => setSavedPagesOpen((open) => !open)}
        >
          <Icon name="bookmark" size={16} alt="" style={{ filter: "brightness(0) invert(1)" }} />
          <span>{savedPages.length}</span>
        </button>
        <button
          type="button"
          className={`pdf-heart-button${currentPageSaved ? " is-saved" : ""}`}
          aria-label={`${currentPageSaved ? "Remove saved" : "Save"} page ${currentPage}`}
          aria-pressed={currentPageSaved}
          disabled={bookmarkBusy || !numPages}
          onClick={() => onToggleBookmark(currentPage)}
        >
          <Icon
            name="hearts"
            size={22}
            alt=""
            style={currentPageSaved ? undefined : { filter: "grayscale(1) brightness(1.6)" }}
          />
          {syncingPage === currentPage && <span className="pdf-sync-dot" />}
        </button>
      </div>

      {bookmarkError && (
        <div className="pdf-bookmark-error" role="status" onClick={(event) => event.stopPropagation()}>
          {bookmarkError}
        </div>
      )}

      {savedPagesOpen && (
        <aside
          className="pdf-saved-pages-panel"
          role="dialog"
          aria-label="Saved pages"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pdf-saved-pages-header">
            <div>
              <strong>저장한 페이지</strong>
              <span>{savedPages.length}개</span>
            </div>
            <button
              type="button"
              aria-label="Close saved pages"
              onClick={() => setSavedPagesOpen(false)}
            >
              ×
            </button>
          </div>
          {savedPages.length === 0 ? (
            <div className="pdf-saved-empty">
              하트를 눌러 중요한 페이지를 저장해 보세요.
            </div>
          ) : (
            <div className="pdf-saved-page-list">
              {savedPages.map((page) => {
                const validPage = !numPages || page <= numPages;
                return (
                  <div className="pdf-saved-page-row" key={page}>
                    <button
                      type="button"
                      aria-label={`Go to saved page ${page}`}
                      disabled={!validPage}
                      className={page === currentPage ? "is-current" : ""}
                      onClick={() => {
                        goToPage(page);
                        setSavedPagesOpen(false);
                      }}
                    >
                      <span>페이지 {page}</span>
                      {page === currentPage && <small>현재</small>}
                      {!validPage && <small>없는 페이지</small>}
                    </button>
                    {!validPage && (
                      <button
                        type="button"
                        className="pdf-remove-invalid"
                        aria-label={`Remove saved page ${page}`}
                        disabled={bookmarkBusy}
                        onClick={() => onToggleBookmark(page)}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      )}
    </section>
  );
});

export default PdfLessonViewer;
