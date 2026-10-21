import { describe, it, expect, vi } from "vitest";
import { handleExpiredSession } from "./api";

function memoryStorage(initial) {
  const data = new Map(Object.entries(initial));
  return { getItem: k => (data.has(k) ? data.get(k) : null), removeItem: k => { data.delete(k); }, has: k => data.has(k) };
}
const failure = (status, url) => ({ response: { status }, config: { url } });

describe("an expired login", () => {
  it("clears the saved login and goes to the login page on a 401", async () => {
    const storage = memoryStorage({ nova_token: "t", nova_name: "ye", nova_role: "student", nova_email: "a@b.c" });
    const goToLogin = vi.fn();
    await expect(handleExpiredSession(failure(401, "/kmate/quiz/generate"), { storage, goToLogin })).rejects.toMatchObject({ response: { status: 401 } });
    expect(goToLogin).toHaveBeenCalledTimes(1);
    expect(["nova_token", "nova_name", "nova_role", "nova_email"].some(k => storage.has(k))).toBe(false);
  });

  it("leaves a wrong-password answer of the login endpoints alone", async () => {
    const storage = memoryStorage({ nova_token: "t" });
    const goToLogin = vi.fn();
    await expect(handleExpiredSession(failure(401, "/auth/login"), { storage, goToLogin })).rejects.toBeTruthy();
    expect(goToLogin).not.toHaveBeenCalled();
    expect(storage.has("nova_token")).toBe(true);
  });

  it("does nothing for other errors, or when nobody is logged in", async () => {
    const goToLogin = vi.fn();
    await expect(handleExpiredSession(failure(500, "/kmate/quiz/generate"), { storage: memoryStorage({ nova_token: "t" }), goToLogin })).rejects.toBeTruthy();
    await expect(handleExpiredSession(failure(401, "/kmate/quiz/generate"), { storage: memoryStorage({}), goToLogin })).rejects.toBeTruthy();
    await expect(handleExpiredSession(new Error("Network Error"), { storage: memoryStorage({ nova_token: "t" }), goToLogin })).rejects.toBeTruthy();
    expect(goToLogin).not.toHaveBeenCalled();
  });
});
