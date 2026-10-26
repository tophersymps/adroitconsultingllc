/**
 * useTierProgress — one shared /api/progress/quiz/tiers request per page
 * (api-contracts.md §B.4, card A4).
 *
 * The regression this locks down: the series page used to run three identical
 * effects (CertReadiness, ExamCard, CheckCardList) and therefore issued three
 * identical requests. Every consumer that mounts in a single render must share
 * ONE in-flight request, and the shared result must still be null (never
 * invented stats) for guests and errors.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { TierProgress } from "@/shared/contracts";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-events";
import {
  invalidateAllTierProgress,
  invalidateTierProgress,
  resetTierProgressCache,
  tierProgressUrl,
  useTierProgress,
} from "./useTierProgress";

const SERIES = "omni-studio-cert";

const TIERS: TierProgress = {
  lessons: { completed: 7, total: 46 },
  checks: [{ n: 1, bestScore: 87, attempts: 1, passed: true }],
  exam: { bestScore: 0, attempts: 0, passed: false },
  unlocked: false,
};

/** Minimal probe: renders whatever the hook exposes as text. */
function Probe({ testId, series = SERIES }: { testId: string; series?: string }) {
  const { tiers, isLoading } = useTierProgress(series);
  const text = isLoading
    ? "loading"
    : tiers
      ? `${tiers.lessons.completed}/${tiers.lessons.total}`
      : "none";
  return <span data-testid={testId}>{text}</span>;
}

describe("useTierProgress", () => {
  beforeEach(() => {
    resetTierProgressCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves three concurrent consumers from a single fetch", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <Probe testId="a" />
        <Probe testId="b" />
        <Probe testId="c" />
      </>,
    );

    // All three are mounted and waiting, and only one request went out.
    expect(screen.getByTestId("a")).toHaveTextContent("loading");
    expect(screen.getByTestId("b")).toHaveTextContent("loading");
    expect(screen.getByTestId("c")).toHaveTextContent("loading");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(tierProgressUrl(SERIES), { cache: "no-store" });

    await act(async () => {
      resolveFetch({ ok: true, json: async () => TIERS });
      await pending;
    });

    await waitFor(() => {
      expect(screen.getByTestId("a")).toHaveTextContent("7/46");
      expect(screen.getByTestId("b")).toHaveTextContent("7/46");
      expect(screen.getByTestId("c")).toHaveTextContent("7/46");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached result on a later mount (no second request)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => TIERS });
    vi.stubGlobal("fetch", fetchMock);

    const first = render(<Probe testId="first" />);
    await waitFor(() => expect(screen.getByTestId("first")).toHaveTextContent("7/46"));
    first.unmount();

    render(<Probe testId="later" />);
    await waitFor(() => expect(screen.getByTestId("later")).toHaveTextContent("7/46"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a rejected fetch resolves every consumer to null (no retry storm)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("quiz API down"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <Probe testId="a" />
        <Probe testId="b" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("a")).toHaveTextContent("none");
      expect(screen.getByTestId("b")).toHaveTextContent("none");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a non-OK response (guest / unauthorised) resolves to null", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe testId="guest" />);
    await waitFor(() => expect(screen.getByTestId("guest")).toHaveTextContent("none"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps different series apart", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({
        ...TIERS,
        lessons: { completed: url.includes("series-a") ? 3 : 9, total: 10 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <Probe testId="a" series="series-a" />
        <Probe testId="b" series="series-b" />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("a")).toHaveTextContent("3/10");
      expect(screen.getByTestId("b")).toHaveTextContent("9/10");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refresh() drops the cached value and fetches again", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return { ok: true, json: async () => ({ ...TIERS, lessons: { completed: call, total: 10 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    function RefreshProbe() {
      const { tiers, isLoading, refresh } = useTierProgress(SERIES);
      return (
        <>
          <span data-testid="p">
            {isLoading ? "loading" : tiers ? `${tiers.lessons.completed}/10` : "none"}
          </span>
          <button type="button" onClick={refresh}>
            refresh
          </button>
        </>
      );
    }

    render(<RefreshProbe />);
    await waitFor(() => expect(screen.getByTestId("p")).toHaveTextContent("1/10"));

    act(() => screen.getByRole("button", { name: "refresh" }).click());
    await waitFor(() => expect(screen.getByTestId("p")).toHaveTextContent("2/10"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the cached rollup on an identity change (no other user's stats)", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return { ok: true, json: async () => ({ ...TIERS, lessons: { completed: call, total: 10 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe testId="p" />);
    await waitFor(() => expect(screen.getByTestId("p")).toHaveTextContent("1/10"));

    // Sign-in / sign-out / account switch broadcasts the auth-changed event.
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    });

    await waitFor(() => expect(screen.getByTestId("p")).toHaveTextContent("2/10"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/*
 * Freshness regression (t_499542c6) — the module cache outlives a mount, so
 * without invalidation the series page served the PRE-submit rollup after a
 * quiz/check/exam submit (the submit pages stay mounted, then a client-side
 * Link returns to the series page without a document reload). The A4 cache is
 * only correct if every rollup-mutating flow drops the series entry.
 */
describe("useTierProgress cache freshness (t_499542c6)", () => {
  beforeEach(() => {
    resetTierProgressCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops the entry for the invalidated series only (a submit affects one series)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({
        ...TIERS,
        lessons: { completed: url.includes("series-a") ? 3 : 9, total: 10 },
        // Post-submit rollup for series-a: a fresh best score and unlock.
        ...(url.includes("series-a")
          ? { checks: [{ n: 1, bestScore: 93, attempts: 2, passed: true }], unlocked: true }
          : {}),
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = render(
      <>
        <Probe testId="a" series="series-a" />
        <Probe testId="b" series="series-b" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("a")).toHaveTextContent("3/10");
      expect(screen.getByTestId("b")).toHaveTextContent("9/10");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    first.unmount();

    // A check/exam submit on another page invalidates its own series.
    invalidateTierProgress("series-a");

    render(
      <>
        <Probe testId="a2" series="series-a" />
        <Probe testId="b2" series="series-b" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("a2")).toHaveTextContent("3/10");
      expect(screen.getByTestId("b2")).toHaveTextContent("9/10");
    });

    // series-a refetched; series-b was served from cache (still 2 requests total).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual([
      tierProgressUrl("series-a"),
      tierProgressUrl("series-b"),
      tierProgressUrl("series-a"),
    ]);
  });

  it("re-reads every mounted consumer of the series in ONE shared request", async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      return { ok: true, json: async () => ({ ...TIERS, lessons: { completed: call, total: 10 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <Probe testId="a" />
        <Probe testId="b" />
        <Probe testId="c" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("a")).toHaveTextContent("1/10");
      expect(screen.getByTestId("c")).toHaveTextContent("1/10");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Invalidate while all three are on screen (e.g. MarkComplete on the
    // series page): all three re-read, still sharing one request.
    await act(async () => {
      invalidateTierProgress(SERIES);
    });

    await waitFor(() => {
      expect(screen.getByTestId("a")).toHaveTextContent("2/10");
      expect(screen.getByTestId("b")).toHaveTextContent("2/10");
      expect(screen.getByTestId("c")).toHaveTextContent("2/10");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidateAllTierProgress drops every series (lesson-complete has no series slug)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({
        ...TIERS,
        lessons: { completed: url.includes("series-a") ? 3 : 9, total: 10 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = render(
      <>
        <Probe testId="a" series="series-a" />
        <Probe testId="b" series="series-b" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("a")).toHaveTextContent("3/10");
      expect(screen.getByTestId("b")).toHaveTextContent("9/10");
    });
    first.unmount();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    invalidateAllTierProgress();

    const second = render(
      <>
        <Probe testId="a2" series="series-a" />
        <Probe testId="b2" series="series-b" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("a2")).toHaveTextContent("3/10");
      expect(screen.getByTestId("b2")).toHaveTextContent("9/10");
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    second.unmount();
  });
});
