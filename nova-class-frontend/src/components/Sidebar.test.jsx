import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const names = { topikHub: "TOPIK Hub", hubGrammar: "Grammar & Meaning", hubBooster: "TOPIK Booster", hubSmartDrill: "Smart Drill", hubOldQuestions: "Old Questions" };
vi.mock("../LanguageContext", () => ({ useLang: () => ({ t: key => names[key] || key }) }));
vi.mock("../ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));

import Sidebar from "./Sidebar";

beforeEach(() => { vi.stubGlobal("localStorage", { getItem: () => "Victoria", setItem() {}, removeItem() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const at = path => render(<MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>);

describe("Sidebar TOPIK Hub", () => {
  it("shows TOPIK Hub instead of Exam Mode, and opens its 4 pages when clicked", () => {
    at("/");
    expect(screen.queryByText("examMode")).toBeNull();
    expect(screen.queryByText("Smart Drill")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /TOPIK Hub/ }));
    const hrefs = ["Grammar & Meaning", "TOPIK Booster", "Smart Drill", "Old Questions"].map(n => screen.getByRole("link", { name: new RegExp(n) }).getAttribute("href"));
    expect(hrefs).toEqual(["/topik-hub/grammar", "/topik-hub/booster", "/topik-hub/smart-drill", "/exam"]);
    fireEvent.click(screen.getByRole("button", { name: /TOPIK Hub/ }));
    expect(screen.queryByText("Smart Drill")).toBeNull();
  });

  it("stays open on one of its pages", () => {
    at("/exam");
    expect(screen.getByRole("link", { name: /Old Questions/ })).toBeTruthy();
  });
});
