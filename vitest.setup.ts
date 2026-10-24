import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Stub the Neon Data API endpoint so a test that imports the browser/server db
// client, or a page whose build guard arms off the catalogue's data layer, has
// a configured environment by default. Individual tests that actually talk to
// the Data API mock the client — this is an inert placeholder. The retired
// NEXT_PUBLIC_SUPABASE_* stubs are gone with R2-2 (t_4b1c9124).
if (!process.env.NEXT_PUBLIC_NEON_DATA_API_URL) {
  process.env.NEXT_PUBLIC_NEON_DATA_API_URL =
    "https://stub.apirest.example/neondb/rest/v1";
}

// jsdom does not implement matchMedia; the ThemeProvider depends on it.
// Provide a minimal no-op matchMedia (never matches dark) so theme logic
// renders deterministically in tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Node 22+ exposes an experimental `localStorage` global that is `undefined`
// unless `--localstorage-file` is passed, which shadows jsdom's real Storage
// in vitest's jsdom environment (getWindowKeys skips keys already `in
// global`). Component tests rely on localStorage, so back it with a simple
// in-memory implementation when the real one isn't reachable.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    },
  });
}

// Keep the DOM clean between tests. localStorage is defensive: in some
// vitest/jsdom combos the Storage global is not initialized, and non-DOM
// route tests don't need it — don't crash the whole suite on its absence.
afterEach(() => {
  cleanup();
  localStorage?.clear();
});
