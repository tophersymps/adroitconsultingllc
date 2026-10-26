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
