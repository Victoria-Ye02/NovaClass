import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import API from "../../services/api";
import TeacherVoiceCard from "./TeacherVoiceCard";

vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("../../LanguageContext", () => ({ useLang: () => ({ lang: "en", t: key => key }) }));

const recording = new File(["audio"], "voice.m4a", { type: "audio/mp4" });
const renderCard = () => render(<TeacherVoiceCard cardStyle={{}} titleStyle={{}} />);
const chooseFile = () => fireEvent.change(screen.getByLabelText("voiceChoose"), { target: { files: [recording] } });

beforeEach(() => {
  API.get.mockReset(); API.post.mockReset(); API.delete.mockReset();
  API.get.mockResolvedValue({ data: { hasVoice: false, label: "", createdAt: null } });
});
afterEach(cleanup);

describe("Teacher voice card", () => {
  it("makes the voice only after a recording is chosen and the teacher confirms it is their voice", async () => {
    API.post.mockResolvedValue({ data: { hasVoice: true, label: "Kim (NovaClass)" } });
    renderCard();
    const make = screen.getByRole("button", { name: "voiceMake" });
    expect(make.disabled).toBe(true);                                       // nothing chosen yet
    chooseFile();
    expect(make.disabled).toBe(true);                                       // chosen, but no consent
    fireEvent.click(screen.getByLabelText("voiceConsent"));
    expect(make.disabled).toBe(false);
    fireEvent.click(make);
    await screen.findByText("voiceActive", { selector: "p" });
    const [url, form] = API.post.mock.calls[0];
    expect(url).toBe("/classroom/voice/me");
    expect(form.get("consent")).toBe("true");
    expect(form.get("sample").name).toBe("voice.m4a");
  });

  it("shows that a voice is set, and removes it after the teacher confirms", async () => {
    API.get.mockResolvedValue({ data: { hasVoice: true, label: "Kim (NovaClass)" } });
    API.delete.mockResolvedValue({ data: { hasVoice: false } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "voiceRemove" }));
    await waitFor(() => expect(API.delete).toHaveBeenCalledWith("/classroom/voice/me"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "voiceRemove" })).toBeNull());
  });

  it("does not remove anything when the teacher cancels", async () => {
    API.get.mockResolvedValue({ data: { hasVoice: true, label: "Kim (NovaClass)" } });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "voiceRemove" }));
    expect(API.delete).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the voice could not be made", async () => {
    API.post.mockRejectedValue({ response: { data: { error: "Try a clearer recording of one speaker." } } });
    renderCard();
    chooseFile();
    fireEvent.click(screen.getByLabelText("voiceConsent"));
    fireEvent.click(screen.getByRole("button", { name: "voiceMake" }));
    expect((await screen.findByRole("status")).textContent).toBe("Try a clearer recording of one speaker.");
  });
});
