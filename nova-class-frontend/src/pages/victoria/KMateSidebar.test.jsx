import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const toggleTheme = vi.fn();
vi.mock("../../LanguageContext", () => ({ useLang: () => ({ t: key => key }) }));
vi.mock("../../ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme }) }));

import KMateSidebar from "./KMateSidebar";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: k => { data.delete(k); }, clear: () => data.clear() };
}
const show = children => render(<MemoryRouter><KMateSidebar>{children}</KMateSidebar></MemoryRouter>);

beforeEach(() => { vi.stubGlobal("localStorage", memoryStorage({ nova_name: "Victoria", kmate_topik_sidebar_collapsed: "0" })); toggleTheme.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("K_MATE sidebar", () => {
  it("opens and closes with the ☰ button, and remembers the choice", () => {
    show();
    const button = screen.getByRole("button", { name: "coachCollapse" });
    expect(button.textContent).toBe("☰");
    expect(screen.getByText("Nova Class")).toBeTruthy();                       // open: brand and name are shown
    expect(screen.getByText("Victoria")).toBeTruthy();

    fireEvent.click(button);
    expect(screen.queryByText("Nova Class")).toBeNull();                       // closed: just the narrow strip
    expect(screen.queryByText("Victoria")).toBeNull();
    expect(localStorage.getItem("kmate_topik_sidebar_collapsed")).toBe("1");
    const open = screen.getByRole("button", { name: "coachExpand" });
    expect(open.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(open);
    expect(screen.getByText("Nova Class")).toBeTruthy();
    expect(localStorage.getItem("kmate_topik_sidebar_collapsed")).toBe("0");
  });

  it("starts closed when it was left closed", () => {
    vi.stubGlobal("localStorage", memoryStorage({ kmate_topik_sidebar_collapsed: "1" }));
    show();
    expect(screen.queryByText("Nova Class")).toBeNull();
    expect(screen.getByRole("button", { name: "coachExpand" })).toBeTruthy();
  });

  it("keeps Dashboard, Classroom, Exam mode and Settings as icons at the bottom, open or closed", () => {
    show();
    const nav = screen.getByRole("navigation", { name: "Pages" });
    const links = within(nav).getAllByRole("link");
    expect(links.map(a => a.getAttribute("href"))).toEqual(["/", "/classroom", "/exam", "/settings"]);
    expect(links.map(a => a.getAttribute("aria-label"))).toEqual(["dashboard", "classroom", "examMode", "settings"]);
    fireEvent.click(screen.getByRole("button", { name: "coachCollapse" }));
    expect(within(screen.getByRole("navigation", { name: "Pages" })).getAllByRole("link")).toHaveLength(4);
  });

  it("gives the middle of the bar to whatever K_MATE puts there", () => {
    show(<button>My feature</button>);
    expect(within(screen.getByTestId("kmate-sidebar-slot")).getByText("My feature")).toBeTruthy();
  });

  it("switches the theme and logs out (clearing the saved session)", () => {
    localStorage.setItem("nova_token", "x");
    show();
    fireEvent.click(screen.getByRole("switch"));
    expect(toggleTheme).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    expect(localStorage.getItem("nova_token")).toBeNull();
    expect(localStorage.getItem("nova_name")).toBeNull();
  });
});
