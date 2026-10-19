import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import API from "../../services/api";
import { useMaterialHighlights } from "../../hooks/useMaterialHighlights";
import MaterialPreview from "./MaterialPreview";

const navigate = vi.fn();
const { selectedLanguage, currentParams } = vi.hoisted(() => ({
  selectedLanguage: { value: "en" },
  currentParams: { id: "4", materialId: "9" },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useParams: () => currentParams,
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("../../LanguageContext", () => ({
  useLang: () => ({ lang: selectedLanguage.value }),
}));

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("../../hooks/useMaterialBookmarks", () => ({
  useMaterialBookmarks: () => ({
    bookmarks: [2],
    loading: false,
    syncingPage: null,
    error: null,
    toggleBookmark: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("../../hooks/useMaterialHighlights", () => ({
  useMaterialHighlights: vi.fn(),
}));

const capturedOnPageChangeRefs = [];

vi.mock("../../components/PdfLessonViewer", () => ({
  default: ({ onDismissEmptySpace, highlightState, onPdfReady, onPageChange }) => {
    capturedOnPageChangeRefs.push(onPageChange);
    return (
      <div data-testid="controlled-pdf-viewer">
        <button type="button" onClick={() => onDismissEmptySpace?.()}>
          Click empty PDF space
        </button>
        <span data-testid="highlight-status">{highlightState?.status}</span>
        <button type="button" onClick={() => onPdfReady?.({ numPages: 3, getPage: vi.fn() })}>
          Trigger PDF ready
        </button>
        <button type="button" onClick={() => onPageChange?.(2, 41)}>
          Trigger page change
        </button>
      </div>
    );
  },
}));

function pdfMaterial() {
  return {
    id: 9,
    title: "Database Lesson",
    file_ext: "pdf",
    file_url: "/classroom/materials/9/file",
  };
}

describe("MaterialPreview PDF integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnPageChangeRefs.length = 0;
    currentParams.id = "4";
    currentParams.materialId = "9";
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key) => key === "nova_token" ? "test-token" : null),
      setItem: vi.fn(),
      clear: vi.fn(),
    });
    API.get.mockResolvedValue({ data: pdfMaterial() });
    useMaterialHighlights.mockReturnValue({
      status: "ready",
      progress: { completedPages: 5, totalPages: 5 },
      highlights: {},
      visible: true,
      setVisible: vi.fn(),
      preparePdf: vi.fn(),
      retry: vi.fn(),
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("closes an overlay when the controlled viewer reports an empty-space click", async () => {
    render(<MaterialPreview isOverlay />);
    expect(await screen.findByTestId("controlled-pdf-viewer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Click empty PDF space" }));

    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("keeps a standalone preview open after an empty-space click", async () => {
    render(<MaterialPreview />);
    expect(await screen.findByTestId("controlled-pdf-viewer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Click empty PDF space" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("fills the viewport in overlay mode", async () => {
    render(<MaterialPreview isOverlay />);

    await screen.findByTestId("controlled-pdf-viewer");
    const card = screen.getByTestId("material-overlay-card");

    expect(card.style.width).toBe("100vw");
    expect(card.style.height).toBe("100dvh");
    expect(card.style.maxWidth).toBe("none");
    expect(card.style.borderRadius).toBe("0px");
  });

  it("preserves the existing image preview path", async () => {
    API.get.mockResolvedValue({
      data: {
        id: 9,
        title: "Diagram",
        file_ext: "png",
        file_url: "/classroom/materials/9/file",
      },
    });

    render(<MaterialPreview />);

    await waitFor(() => expect(screen.getByRole("img", { name: "Diagram" })).toBeTruthy());
    expect(screen.queryByTestId("controlled-pdf-viewer")).toBeNull();
  });

  it("connects useMaterialHighlights for the current material and passes its state to the viewer", async () => {
    render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    expect(useMaterialHighlights).toHaveBeenCalledWith({ materialId: "9", enabled: true });
    expect(screen.getByTestId("highlight-status").textContent).toBe("ready");
  });

  it("wires onPdfReady to the hook's preparePdf callback", async () => {
    const preparePdf = vi.fn();
    useMaterialHighlights.mockReturnValue({
      status: "processing",
      progress: { completedPages: 1, totalPages: 3 },
      highlights: {},
      visible: true,
      setVisible: vi.fn(),
      preparePdf,
      retry: vi.fn(),
      error: null,
    });

    render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    fireEvent.click(screen.getByRole("button", { name: "Trigger PDF ready" }));

    expect(preparePdf).toHaveBeenCalledWith({ numPages: 3, getPage: expect.any(Function) });
  });

  it("sends the student's current page on every teacher request, including after they turn a page mid-lesson", async () => {
    API.post
      .mockResolvedValueOnce({ data: { reply: "Sure, here's page 1." } })
      .mockResolvedValueOnce({ data: { reply: "Now on page 2." } });
    render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");
    fireEvent.click(screen.getByLabelText("Open AI chat"));
    await screen.findByText("Sure, here's page 1.");
    const [, startBody] = API.post.mock.calls[0];
    expect(startBody.level).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Trigger page change" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue lesson" }));

    await waitFor(() => expect(API.post).toHaveBeenLastCalledWith(
      "/classroom/materials/9/ai",
      expect.objectContaining({ mode: "teacher", teachingIntent: "continue", currentPage: 2, totalPages: 41 })
    ));
  });

  it("starts Nova Teacher automatically as soon as the material loads, without waiting for the chat panel to be opened", async () => {
    API.post.mockResolvedValue({ data: { reply: "Today we will learn about databases." } });
    render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    await waitFor(() => expect(API.post).toHaveBeenCalledWith(
      "/classroom/materials/9/ai",
      expect.objectContaining({
        action: "chat",
        mode: "teacher",
        teachingIntent: "start",
        currentPage: 1,
      })
    ));
  });

  it("continues a Nova Teacher lesson from the quick action", async () => {
    API.post
      .mockResolvedValueOnce({ data: { reply: "A database stores organized data." } })
      .mockResolvedValueOnce({ data: { reply: "Now let's learn about tables." } });
    render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    fireEvent.click(screen.getByLabelText("Open AI chat"));
    await screen.findByText("A database stores organized data.");
    fireEvent.click(screen.getByRole("button", { name: "Continue lesson" }));

    await waitFor(() => expect(API.post).toHaveBeenLastCalledWith(
      "/classroom/materials/9/ai",
      expect.objectContaining({ mode: "teacher", teachingIntent: "continue" })
    ));
    await screen.findByText("Now let's learn about tables.");
  });

  it("resumes (rather than restarts) a lesson this material already has saved history for", async () => {
    API.get.mockImplementation((url) => {
      if (url.includes("chat-history")) {
        return Promise.resolve({ data: { messages: [{ role: "assistant", content: "We learned about primary keys." }] } });
      }
      return Promise.resolve({ data: pdfMaterial() });
    });
    API.post.mockResolvedValue({ data: { reply: "Welcome back — let's continue." } });
    render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    await waitFor(() => expect(API.post).toHaveBeenCalledWith(
      "/classroom/materials/9/ai",
      expect.objectContaining({ mode: "teacher", teachingIntent: "continue" })
    ));
    expect(await screen.findByText("We learned about primary keys.")).toBeTruthy();
  });

  it("sends the Settings-selected language to the AI chat instead of always English", async () => {
    selectedLanguage.value = "my";
    try {
      API.post.mockResolvedValue({ data: { reply: "မိုက်တိုကွန်ဒရီယာ..." } });
      render(<MaterialPreview />);
      await screen.findByTestId("controlled-pdf-viewer");

      await waitFor(() => expect(API.post).toHaveBeenCalledWith(
        "/classroom/materials/9/ai",
        expect.objectContaining({ lang: "my" })
      ));
    } finally {
      selectedLanguage.value = "en";
    }
  });

  describe("lesson language", () => {
    async function openLesson() {
      render(<MaterialPreview />);
      await screen.findByTestId("controlled-pdf-viewer");
      fireEvent.click(screen.getByLabelText("Open AI chat"));
      await waitFor(() => expect(API.post).toHaveBeenCalledWith(
        "/classroom/materials/9/ai",
        expect.objectContaining({ teachingIntent: "start" }),
      ));
      await waitFor(() => expect(screen.getByLabelText("Type your question").disabled).toBe(false));
    }

    const aiCalls = () => API.post.mock.calls.filter(([url]) => url === "/classroom/materials/9/ai").map(([, body]) => body);

    it("shows the Settings language as the teaching language and sends no override at first", async () => {
      selectedLanguage.value = "my";
      try {
        API.post.mockResolvedValue({ data: { reply: "ဟုတ်ကဲ့။", replyLang: "my" } });
        await openLesson();
        expect(screen.getByText("မြန်မာ")).toBeTruthy();
        expect(screen.queryByLabelText("Back to my Settings language")).toBeNull();
        expect(aiCalls()[0]).not.toHaveProperty("lessonLang");
      } finally {
        selectedLanguage.value = "en";
      }
    });

    it("keeps a language the student asked for: later requests carry it and the chip offers a way back", async () => {
      selectedLanguage.value = "my";
      try {
        API.post.mockImplementation(async (url, body) => ({
          data: { reply: "Sure.", replyLang: body.message?.includes("English") ? "en" : (body.lessonLang || "my") },
        }));
        await openLesson();

        fireEvent.change(screen.getByLabelText("Type your question"), { target: { value: "Can you explain in English?" } });
        fireEvent.click(screen.getByText("Ask"));
        await waitFor(() => expect(screen.getByLabelText("Back to my Settings language")).toBeTruthy());
        expect(screen.getByText("English")).toBeTruthy();

        fireEvent.click(screen.getByText("Explain simply"));
        await waitFor(() => expect(aiCalls().some(call => call.teachingIntent === "simplify")).toBe(true));
        const simplify = aiCalls().find(call => call.teachingIntent === "simplify");
        expect(simplify.lessonLang).toBe("en");
        expect(simplify.lang).toBe("my");
      } finally {
        selectedLanguage.value = "en";
      }
    });

    it("returns to the Settings language when the student taps the chip's ×", async () => {
      selectedLanguage.value = "my";
      try {
        API.post.mockImplementation(async (url, body) => ({
          data: { reply: "Sure.", replyLang: body.message?.includes("English") ? "en" : (body.lessonLang || "my") },
        }));
        await openLesson();
        fireEvent.change(screen.getByLabelText("Type your question"), { target: { value: "explain in English" } });
        fireEvent.click(screen.getByText("Ask"));
        fireEvent.click(await screen.findByLabelText("Back to my Settings language"));
        expect(screen.getByText("မြန်မာ")).toBeTruthy();

        fireEvent.click(screen.getByText("Check my understanding"));
        await waitFor(() => expect(aiCalls().some(call => call.teachingIntent === "check")).toBe(true));
        expect(aiCalls().find(call => call.teachingIntent === "check")).not.toHaveProperty("lessonLang");
      } finally {
        selectedLanguage.value = "en";
      }
    });
  });

  it("resets the AI chat panel when switching to a different material, instead of leaking the previous material's conversation into it", async () => {
    API.post.mockResolvedValueOnce({ data: { reply: "This lesson covers the POS system's Java/JDBC implementation." } });

    const { rerender } = render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    fireEvent.click(screen.getByLabelText("Open AI chat"));

    await screen.findByText("This lesson covers the POS system's Java/JDBC implementation.");

    // Switch to a different material — same overlay/route shape, just a new
    // materialId, the way clicking to another lesson in the same session does.
    currentParams.materialId = "12";
    API.get.mockResolvedValue({ data: { ...pdfMaterial(), id: 12, title: "Grammar: Superlatives" } });
    rerender(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    expect(screen.queryByText("This lesson covers the POS system's Java/JDBC implementation.")).toBeNull();
    // The lecture stage shows only the current script, so a reset panel
    // shows the new lesson's opening line (or its loading state), never the
    // previous material's text.
    expect(screen.getAllByLabelText("Professor Nova").length).toBeGreaterThan(0);
  });

  it("passes a referentially stable onPageChange callback across re-renders (regression: an inline callback here previously caused an infinite render loop)", async () => {
    render(<MaterialPreview />);
    await screen.findByTestId("controlled-pdf-viewer");

    const refsBeforeCount = capturedOnPageChangeRefs.length;
    expect(refsBeforeCount).toBeGreaterThan(0);
    const refBefore = capturedOnPageChangeRefs.at(-1);

    // Triggering a page change updates state in MaterialPreview, which
    // re-renders PdfLessonViewer with a fresh onPageChange prop. If that
    // prop isn't memoized, its identity changes every time it fires, which
    // (combined with PdfLessonViewer's own effect depending on it) is exactly
    // the shape of bug that produces "Maximum update depth exceeded."
    fireEvent.click(screen.getByRole("button", { name: "Trigger page change" }));

    const refAfter = capturedOnPageChangeRefs.at(-1);
    expect(refAfter).toBe(refBefore);
  });

  describe("Push-to-talk question", () => {
    // MediaRecorder + getUserMedia are faked; the transcription is the
    // mocked /multimodal/transcribe call.
    class FakeMediaRecorder {
      constructor(stream) {
        this.stream = stream;
        this.state = "inactive";
        this.mimeType = "audio/webm";
        FakeMediaRecorder.instances.push(this);
      }
      start() { this.state = "recording"; }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    FakeMediaRecorder.instances = [];

    let trackStop;
    let systemNow;

    beforeEach(() => {
      FakeMediaRecorder.instances.length = 0;
      trackStop = vi.fn();
      systemNow = 1_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => systemNow);
      vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
      Object.defineProperty(window.navigator, "mediaDevices", {
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
        configurable: true,
      });
    });

    async function openChat() {
      render(<MaterialPreview />);
      await screen.findByTestId("controlled-pdf-viewer");
      fireEvent.click(screen.getByLabelText("Open AI chat"));
      await waitFor(() => expect(API.post).toHaveBeenCalledWith(
        "/classroom/materials/9/ai",
        expect.objectContaining({ mode: "teacher", teachingIntent: "start" }),
      ));
      await waitFor(() => expect(screen.getByLabelText("Ask a question by voice").disabled).toBe(false));
    }

    async function recordAnd(transcript) {
      API.post.mockImplementation(async (url) => {
        if (url === "/multimodal/transcribe") return { data: { text: transcript } };
        return { data: { reply: "Good question — a for loop repeats a block." } };
      });
      fireEvent.click(screen.getByLabelText("Ask a question by voice"));
      await screen.findByText(/Listening…/);
      systemNow += 2000;
      fireEvent.click(screen.getByLabelText("Stop recording"));
    }

    it("hides the microphone button when the browser has no recording support", async () => {
      Object.defineProperty(window.navigator, "mediaDevices", { value: undefined, configurable: true });
      vi.stubGlobal("MediaRecorder", undefined);
      await openChat().catch(() => {});
      expect(screen.queryByLabelText("Ask a question by voice")).toBeNull();
      expect(screen.getByLabelText("Type your question")).toBeTruthy();
    });

    it("records inside the panel without a full-screen takeover", async () => {
      await openChat();
      fireEvent.click(screen.getByLabelText("Ask a question by voice"));
      await screen.findByText(/Listening…/);

      expect(screen.queryByText("End Voice Chat")).toBeNull();
      expect(screen.queryByLabelText("Close voice chat")).toBeNull();
      expect(screen.getByTestId("controlled-pdf-viewer")).toBeTruthy();
    });

    it("shows what it heard for the student to confirm and does not send anything yet", async () => {
      await openChat();
      await recordAnd("what is a for loop");
      const draft = await screen.findByLabelText("What I heard");
      expect(draft.value).toBe("what is a for loop");

      const askCalls = API.post.mock.calls.filter(([url, body]) => url === "/classroom/materials/9/ai" && body.message === "what is a for loop");
      expect(askCalls).toHaveLength(0);
    });

    it("sends the corrected text to Nova Teacher and releases the mic", async () => {
      await openChat();
      await recordAnd("what is a four loop");
      const draft = await screen.findByLabelText("What I heard");
      fireEvent.change(draft, { target: { value: "what is a for loop" } });
      fireEvent.click(screen.getByText("Ask Nova"));

      await waitFor(() => expect(API.post).toHaveBeenCalledWith(
        "/classroom/materials/9/ai",
        expect.objectContaining({ message: "what is a for loop", teachingIntent: "answer" }),
      ));
      expect(await screen.findByText(/a for loop repeats a block/)).toBeTruthy();
      expect(trackStop).toHaveBeenCalled();
      expect(screen.queryByLabelText("What I heard")).toBeNull();
    });

    it("tells the student when no speech was captured instead of sending nothing", async () => {
      await openChat();
      await recordAnd("");
      expect(await screen.findByText(/couldn't hear any speech/i)).toBeTruthy();
      expect(screen.queryByLabelText("What I heard")).toBeNull();
    });

    it("rejects a recording that is too short", async () => {
      await openChat();
      API.post.mockImplementation(async () => ({ data: { text: "x" } }));
      fireEvent.click(screen.getByLabelText("Ask a question by voice"));
      await screen.findByText(/Listening…/);
      fireEvent.click(screen.getByLabelText("Stop recording"));
      expect(await screen.findByText(/too short/i)).toBeTruthy();
      expect(API.post).not.toHaveBeenCalledWith("/multimodal/transcribe", expect.anything());
    });

    it("discards a draft on request", async () => {
      await openChat();
      await recordAnd("what is a for loop");
      await screen.findByLabelText("What I heard");
      fireEvent.click(screen.getByText("Discard"));
      expect(screen.queryByLabelText("What I heard")).toBeNull();
    });

    it("stops the mic when the chat sidebar is collapsed mid-recording", async () => {
      await openChat();
      fireEvent.click(screen.getByLabelText("Ask a question by voice"));
      await screen.findByText(/Listening…/);
      const recorder = FakeMediaRecorder.instances[0];
      const stopSpy = vi.spyOn(recorder, "stop");

      fireEvent.click(screen.getByLabelText("Close AI chat"));

      expect(stopSpy).toHaveBeenCalled();
      expect(trackStop).toHaveBeenCalled();
    });
  });
});
