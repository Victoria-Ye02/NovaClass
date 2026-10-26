import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import API from "../../services/api";
import Login from "./Login";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// The real Google Identity Services script never loads in jsdom. Stub the
// global so the component's effect runs its "already loaded" branch and
// captures the callback it registered, letting tests fire it directly.
function stubGoogleIdentity() {
  let registeredCallback;
  const initialize = vi.fn(({ callback }) => { registeredCallback = callback; });
  window.google = {
    accounts: {
      id: {
        initialize,
        renderButton: vi.fn(),
      },
    },
  };
  return {
    initialize,
    fireCredentialResponse: (response) => registeredCallback(response),
  };
}

describe("Login Google sign-in", () => {
  beforeEach(() => {
    navigate.mockReset();
    API.post.mockReset();
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    delete window.google;
    vi.unstubAllEnvs();
  });

  it("starts Google sign-in with the client ID from VITE_GOOGLE_CLIENT_ID, not a value written in the code", () => {
    const google = stubGoogleIdentity();
    render(<Login />);
    expect(google.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: "test-client.apps.googleusercontent.com" }));
  });

  it("says so, and does not start Google sign-in, when VITE_GOOGLE_CLIENT_ID is missing", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    const google = stubGoogleIdentity();
    render(<Login />);
    expect(google.initialize).not.toHaveBeenCalled();
    expect(screen.getByText(/VITE_GOOGLE_CLIENT_ID is missing/)).toBeTruthy();
  });

  it("sends intent: login on the Login tab, so an unregistered Google account is not auto-created", async () => {
    const google = stubGoogleIdentity();
    API.post.mockResolvedValueOnce({
      data: { token: "t", user: { id: 1, name: "Vic", role: "student", email: "vic@nova.com" } },
    });

    render(<Login />);
    await google.fireCredentialResponse({ credential: "fake-credential" });

    expect(API.post).toHaveBeenCalledWith("/auth/google", {
      credential: "fake-credential",
      intent: "login",
    });
  });

  it("sends intent: register on the Sign Up tab, allowing account creation", async () => {
    const google = stubGoogleIdentity();
    API.post.mockResolvedValueOnce({
      data: { token: "t", user: { id: 2, name: "New", role: "student", email: "new@nova.com" } },
    });

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    await google.fireCredentialResponse({ credential: "fake-credential" });

    expect(API.post).toHaveBeenCalledWith("/auth/google", {
      credential: "fake-credential",
      intent: "register",
    });
  });

  it("shows the backend's 'sign up first' message when a Login-tab Google sign-in finds no account", async () => {
    const google = stubGoogleIdentity();
    API.post.mockRejectedValueOnce({
      response: { data: { error: "No account found for this Google email. Please sign up first." } },
    });

    render(<Login />);
    await google.fireCredentialResponse({ credential: "fake-credential" });

    expect(await screen.findByText(/No account found for this Google email/)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("Login email/ID + register form", () => {
  beforeEach(() => {
    navigate.mockReset();
    API.post.mockReset();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("logs in with a non-email ID typed into the Email/ID field", async () => {
    API.post.mockResolvedValueOnce({
      data: { token: "t", user: { id: 1, name: "Vic", role: "student", email: "vic@nova.com" } },
    });

    render(<Login />);
    fireEvent.change(screen.getByPlaceholderText("Enter your email or ID"), {
      target: { value: "  Victoria6  " },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await vi.waitFor(() => expect(API.post).toHaveBeenCalled());
    expect(API.post).toHaveBeenCalledWith("/auth/login", { email: "victoria6", password: "secret" });
  });

  it("sends a trimmed, lowercased ID (username) when registering", async () => {
    API.post.mockResolvedValueOnce({ data: { id: 1, name: "Vic", email: "vic@nova.com", username: "victoria6" } });

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Vic" } });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "vic@nova.com" } });
    fireEvent.change(screen.getByPlaceholderText("Choose an ID for logging in"), {
      target: { value: "  Victoria6  " },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await vi.waitFor(() => expect(API.post).toHaveBeenCalled());
    expect(API.post).toHaveBeenCalledWith("/auth/register", {
      name: "Vic", email: "vic@nova.com", username: "victoria6", password: "secret",
    });
  });

  it("shows the backend's minimum-length error when the ID is rejected", async () => {
    API.post.mockRejectedValueOnce({ response: { data: { error: "ID must be at least 6 characters" } } });

    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Vic" } });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "vic@nova.com" } });
    fireEvent.change(screen.getByPlaceholderText("Choose an ID for logging in"), { target: { value: "abc12" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByText(/ID must be at least 6 characters/)).toBeTruthy();
  });
});

describe("Login errors, Google script and tab state", () => {
  const ok = { data: { token: "t", user: { id: 1, name: "Vic", role: "student", email: "vic@nova.com" } } };
  const typeLogin = (id = "vic@nova.com", pass = "secret123") => {
    fireEvent.change(screen.getByPlaceholderText("Enter your email or ID"), { target: { value: id } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: pass } });
  };
  const signIn = () => fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  let storage;

  beforeEach(() => {
    navigate.mockReset();
    API.post.mockReset();
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    storage = { getItem: vi.fn(), setItem: vi.fn(), clear: vi.fn() };
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    document.getElementById("google-identity-services")?.remove();
    delete window.google;
  });

  it("calls an unreachable server a connection problem, without naming a developer port", async () => {
    API.post.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK", request: {} }));
    render(<Login />);
    typeLogin(); signIn();
    const box = await screen.findByText(/Cannot reach the server/);
    expect(box.textContent).not.toMatch(/5001|backend/i);
  });

  it("does not blame the network when the browser cannot save the session (private mode, full storage)", async () => {
    API.post.mockResolvedValueOnce(ok);
    storage.setItem.mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    render(<Login />);
    typeLogin(); signIn();
    expect(await screen.findByText(/could not save your session/)).toBeTruthy();
    expect(screen.queryByText(/Cannot reach the server/)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not blame the network when the answer has no user in it", async () => {
    API.post.mockResolvedValueOnce({ data: { token: "t" } });
    render(<Login />);
    typeLogin(); signIn();
    expect(await screen.findByText(/could not read the server's answer/)).toBeTruthy();
    expect(screen.queryByText(/Cannot reach the server/)).toBeNull();
  });

  it("clears the messages and everything typed when the student moves to the other tab", async () => {
    API.post.mockRejectedValueOnce({ response: { data: { error: "Invalid ID or password" } } });
    render(<Login />);
    typeLogin("someone", "secret123"); signIn();
    await screen.findByText(/Invalid ID or password/);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.queryByText(/Invalid ID or password/)).toBeNull();
    expect(screen.getByPlaceholderText("your@email.com").value).toBe("");
    expect(screen.getAllByPlaceholderText("••••••••")[0].value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Student Login" }));
    expect(screen.getByPlaceholderText("Enter your email or ID").value).toBe("");
    expect(screen.getByPlaceholderText("••••••••").value).toBe("");
  });

  it("drops an old Google error when the tab changes", async () => {
    const google = stubGoogleIdentity();
    API.post.mockRejectedValueOnce({ response: { data: { error: "No account found for this Google email. Please sign up first." } } });
    render(<Login />);
    await google.fireCredentialResponse({ credential: "c" });
    await screen.findByText(/No account found/);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.queryByText(/No account found/)).toBeNull();
  });

  it("goes to the Login tab 1.5 s after registering, with the email kept and the password gone", async () => {
    vi.useFakeTimers();
    API.post.mockResolvedValueOnce({ data: {} });
    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Vic" } });
    fireEvent.change(screen.getByPlaceholderText("your@email.com"), { target: { value: "vic@nova.com" } });
    fireEvent.change(screen.getByPlaceholderText("Choose an ID for logging in"), { target: { value: "victoria6" } });
    fireEvent.change(screen.getAllByPlaceholderText("••••••••")[0], { target: { value: "secret123" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create Account" })); });
    expect(screen.getByText(/Registered/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(screen.getByPlaceholderText("Enter your email or ID").value).toBe("vic@nova.com");
    expect(screen.getByPlaceholderText("••••••••").value).toBe("");
  });

  it("does not pull the student back to Login when they have already moved on, or left the page", async () => {
    vi.useFakeTimers();
    API.post.mockResolvedValue({ data: {} });
    const { unmount } = render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    for (const [ph, v] of [["Your name", "Vic"], ["your@email.com", "vic@nova.com"], ["Choose an ID for logging in", "victoria6"]]) {
      fireEvent.change(screen.getByPlaceholderText(ph), { target: { value: v } });
    }
    fireEvent.change(screen.getAllByPlaceholderText("••••••••")[0], { target: { value: "secret123" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create Account" })); });
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));            // the student taps the tab again before the timer fires
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByPlaceholderText("your@email.com")).toBeTruthy();         // still on Sign Up
    const spy = vi.spyOn(globalThis, "clearTimeout");
    unmount();
    expect(spy).toHaveBeenCalled();                                             // leaving the page clears the timer
  });

  it("can retry after the Google script failed to load", async () => {
    render(<Login />);
    const first = document.getElementById("google-identity-services");
    expect(first).toBeTruthy();
    await act(async () => { first.dispatchEvent(new Event("error")); });
    expect(await screen.findByText(/Couldn't load Google Sign-In/)).toBeTruthy();
    expect(document.getElementById("google-identity-services")).toBeNull();         // the failed script is not left behind
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const second = document.getElementById("google-identity-services");
    expect(second).toBeTruthy();                                                    // a new script was added
    expect(second).not.toBe(first);
    expect(screen.queryByText(/Couldn't load Google Sign-In/)).toBeNull();
  });
});
