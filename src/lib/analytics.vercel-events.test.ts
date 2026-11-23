import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Funnel events must reach Vercel Web Analytics as well as GA4, and only after
 * consent. These tests pin the ordering trap in `trackEvent`: the GA4 half is
 * env-gated (no ID in this suite) and its early return must not swallow the
 * Vercel half, because a deployment with no GA4 ID is the normal case.
 */
const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }));
vi.mock("@vercel/analytics", () => ({ track: trackMock }));

import {
  CONSENT_STORAGE_KEY,
  trackEvent,
  trackLessonComplete,
  trackQuizTierComplete,
  trackSearch,
} from "@/lib/analytics";

beforeEach(() => {
  trackMock.mockClear();
  window.localStorage.clear();
  delete (window as unknown as Record<string, unknown>).gtag;
});

describe("trackEvent → Vercel Web Analytics", () => {
  it("sends nothing before a consent decision", () => {
    trackLessonComplete("lesson-1");
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("sends nothing when consent was declined", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "denied");
    trackLessonComplete("lesson-1");
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("forwards the typed funnel event once consent is granted", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    trackLessonComplete("lesson-1");
    expect(trackMock).toHaveBeenCalledWith("lesson_complete", {
      lesson_slug: "lesson-1",
    });
  });

  it("forwards scalar params from the quiz helper", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    trackQuizTierComplete({ quizName: "Sharing 101", score: 88, passed: true });
    expect(trackMock).toHaveBeenCalledWith("quiz_tier_complete", {
      quiz_name: "Sharing 101",
      score: 88,
      passed: true,
    });
  });

  it("drops params Vercel cannot accept instead of forwarding them", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    trackEvent("mixed_event", {
      ok: "value",
      nested: { a: 1 },
      list: [1, 2],
      nothing: null,
    });
    expect(trackMock).toHaveBeenCalledWith("mixed_event", {
      ok: "value",
      nothing: null,
    });
  });

  it("still forwards to Vercel when GA4 is disabled (the early-return trap)", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    const gtag = vi.fn();
    (window as unknown as Record<string, unknown>).gtag = gtag;
    trackLessonComplete("lesson-2");
    // No NEXT_PUBLIC_GA_MEASUREMENT_ID in this suite, so GA4 stays silent and
    // only Vercel receives the event. This is production's current shape.
    expect(trackMock).toHaveBeenCalledWith("lesson_complete", {
      lesson_slug: "lesson-2",
    });
    expect(gtag).not.toHaveBeenCalled();
  });
});
describe("trackSearch", () => {
  it("emits GA4's recommended search event with the term and result count", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    trackSearch({ searchTerm: "  salesforce flow  ", resultCount: 7 });
    expect(trackMock).toHaveBeenCalledWith("search", {
      search_term: "salesforce flow",
      result_count: 7,
    });
  });

  it("caps the term at GA4's 100-character limit", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    trackSearch({ searchTerm: "x".repeat(150), resultCount: 0 });
    const [, props] = trackMock.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(String(props.search_term)).toHaveLength(100);
  });

  it("strips control characters and skips an empty term", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    trackSearch({ searchTerm: "ai\u0000bo", resultCount: 2 });
    expect(trackMock).toHaveBeenCalledWith("search", {
      search_term: "ai bo",
      result_count: 2,
    });

    trackMock.mockClear();
    trackSearch({ searchTerm: "   ", resultCount: 0 });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("sends nothing before consent", () => {
    trackSearch({ searchTerm: "flow", resultCount: 3 });
    expect(trackMock).not.toHaveBeenCalled();
  });
});
