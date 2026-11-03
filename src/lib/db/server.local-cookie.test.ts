import { afterEach, describe, expect, it, vi } from "vitest";
import { localDevSessionCookie } from "./server";

describe("localDevSessionCookie", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("re-labels the http session cookie to the __Secure- name in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(localDevSessionCookie("a=1; neon-auth.session_token=tok; b=2")).toBe(
      "a=1; __Secure-neon-auth.session_token=tok; b=2",
    );
    expect(localDevSessionCookie("neon-auth.session_token=tok")).toBe(
      "__Secure-neon-auth.session_token=tok",
    );
  });

  it("leaves an already-secure cookie name alone", () => {
    vi.stubEnv("NODE_ENV", "development");
    const c = "__Secure-neon-auth.session_token=tok";
    expect(localDevSessionCookie(c)).toBe(c);
  });

  it("is a no-op outside development (production, test)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const c = "neon-auth.session_token=tok";
    expect(localDevSessionCookie(c)).toBe(c);
  });
});
