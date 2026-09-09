import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Stub Supabase env vars so importing lib/supabase/* in tests doesn't throw
// at module load (server.ts/client.ts guard on missing keys). Individual tests
// that actually talk to Supabase mock the client — these are inert placeholders.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
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
