import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@elevenlabs/client", () => ({ Conversation: {} }));
vi.mock("../../components/Sidebar", () => ({ default: () => <nav>sidebar</nav> }));
vi.mock("./CodeHomeworkCoach", () => ({ default: () => null }));
vi.mock("../../LanguageContext", () => ({ useLang: () => ({ lang: "en", t: key => key }) }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import API from "../../services/api";
import SmartDrill from "./SmartDrill";

afterEach(cleanup);

describe("Smart Drill page", () => {
  it("holds the settings, strategy guide, weak points and the quiz", async () => {
    API.get.mockImplementation(async url => url === "/kmate/quiz/options"
      ? { data: { types: [{ key: "sentence_order", label: "Sentence order", ko: "문장 순서", description: "" }], difficulties: [{ key: "easy", label: "Easy" }] } }
      : { data: { attempts: 1, averageScore: 50, weaknesses: [{ weakness: "피동 표현", asked: 2, wrong: 1, accuracy: 50 }] } });
    render(<MemoryRouter><SmartDrill /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Smart Drill" })).toBeTruthy();
    await screen.findByTestId("type-picker");
    expect(screen.getByTestId("level-picker")).toBeTruthy();
    expect(screen.getByTestId("strategy-guide")).toBeTruthy();
    await screen.findByTestId("weak-points");
    expect(screen.getByRole("button", { name: /Start Quiz/ })).toBeTruthy();
  });
});
