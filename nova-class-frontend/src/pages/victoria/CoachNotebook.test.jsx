import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CoachNotebook from "./CoachNotebook";

vi.mock("../../LanguageContext", () => ({ useLang: () => ({ t: key => key }) }));

afterEach(cleanup);

function setup(extra = {}) {
  const props = {
    cells: [{ id: "a", code: "print(1)", result: null }, { id: "b", code: "", result: null }],
    language: "python", onCode: vi.fn(), onRun: vi.fn(), onRunAll: vi.fn(), onAdd: vi.fn(), onDelete: vi.fn(),
    onRestart: vi.fn(), onHint: vi.fn(), onVisualize: vi.fn(), canCoach: true, ...extra,
  };
  render(<CoachNotebook {...props} />);
  return props;
}
const open = index => fireEvent.click(screen.getByRole("button", { name: `coachCellMenu [${index}]` }));

describe("CoachNotebook cell menu", () => {
  it("opens a menu with hint, visualize and delete, and each calls its handler", () => {
    const p = setup();
    open(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "coachGiveHint" }));
    expect(p.onHint).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    open(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "coachVisualize" }));
    expect(p.onVisualize).toHaveBeenCalledTimes(1);
    open(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "coachDeleteCell" }));
    expect(p.onDelete).toHaveBeenCalledWith("a");
  });

  it("closes on Escape; visualize is disabled for an empty cell; hint needs a homework", () => {
    setup({ canCoach: false });
    open(2);
    expect(screen.getByRole("menuitem", { name: "coachGiveHint" }).disabled).toBe(true);
    expect(screen.getByRole("menuitem", { name: "coachVisualize" }).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("has no delete item when only one cell is left", () => {
    setup({ cells: [{ id: "a", code: "x", result: null }] });
    open(1);
    expect(screen.queryByRole("menuitem", { name: "coachDeleteCell" })).toBeNull();
  });
});

describe("CoachNotebook line numbers", () => {
  it("numbers the lines of each cell beside the code", () => {
    setup({ cells: [{ id: "a", code: "a = 1\nb = 2\nprint(a + b)", result: null }] });
    const gutter = document.querySelector("[data-line-numbers]");
    expect(gutter.textContent.trim()).toBe("1\n2\n3");
  });
});
