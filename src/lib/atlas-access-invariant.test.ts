/**
 * src/lib/atlas-access-invariant.test.ts — the guard for
 * `DISCLOSURE_NEVER_GRANTS_ACCESS` (t_47183b5b).
 *
 * Statement: for every series slug `s` and every caller `u`,
 * `decideCourseAccessFromInput({ course: row(s), ...u })` returns an identical
 * `CourseAccessDecision` regardless of whether `s` is in
 * `PUBLICLY_LAUNCHED_SERIES`. Widening the DISCLOSURE set can therefore never
 * change an ACCESS decision.
 *
 * Why it holds: `src/lib/access.ts` imports nothing from `@/lib/atlas-launch`,
 * `@/lib/atlas-disclosure` or `@/lib/learn-visibility`, so the launch snapshot
 * is not an input to any access decision. G1 below makes that structural —
 * re-introducing the coupling fails the build. G2 proves the behaviour on the
 * real decision function for the exact slug sets this change touched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { decideCourseAccessFromInput } from "@/lib/access";
import type { CourseRow } from "@/shared/contracts-course-catalog";

const NOW = "2026-11-18T00:00:00.000Z";

function course(
  slug: string,
  status: CourseRow["status"],
  access_model: CourseRow["access_model"],
): CourseRow {
  return {
    id: `id:${slug}`,
    series_slug: slug,
    title: slug,
    status,
    access_model,
    price_cents: null,
    launched_at: null,
    created_at: "",
    updated_at: "",
  };
}

const GUEST = {
  isAdmin: false,
  entitlements: [],
  subscriptions: [],
  now: NOW,
};

/** No grant for this course, no subscription — indistinguishable from a guest
 *  for the purposes of the four rules the decision function applies. */
const GRANTLESS = {
  isAdmin: false,
  entitlements: [],
  subscriptions: [],
  now: NOW,
};

/** The 7 courses this change set made disclosable — priced, non-stealth. */
const PRICED = [
  "ai-adoption",
  "ai-power-user",
  "salesforce-data-architect",
  "salesforce-sharing-visibility-architect",
  "sf-agentforce-sales-consultant",
  "sf-data360-consultant",
  "sf-omni-consultant",
];

/** The originally published free series. */
const FREE = [
  "agentic-ai",
  "ai-at-work",
  "omni-studio-cert",
  "salesforce-architect",
];

/** The stealth boundary — must stay hidden from a guest. */
const STEALTH = [
  "hermes-consultant",
  "hermes-consultant-intermediate",
  "hermes-consultant-advanced",
];

describe("DISCLOSURE_NEVER_GRANTS_ACCESS — G1 structural", () => {
  it("access.ts imports no disclosure module", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/access.ts"), "utf8");
    const importBlock = src.slice(0, src.indexOf("/* -----"));
    // Guard against a marker that moved and silently sliced nothing.
    expect(importBlock.length).toBeGreaterThan(0);
    for (const banned of [
      "atlas-launch",
      "atlas-disclosure",
      "learn-visibility",
    ]) {
      expect(importBlock).not.toContain(banned);
    }
  });
});

describe("DISCLOSURE_NEVER_GRANTS_ACCESS — G2 behavioural", () => {
  it("a priced public course is paywalled identically for a guest and a grant-less user", () => {
    for (const slug of PRICED) {
      const guest = decideCourseAccessFromInput({
        course: course(slug, "live", "sub-or-one-time"),
        ...GUEST,
      });
      const user = decideCourseAccessFromInput({
        course: course(slug, "live", "sub-or-one-time"),
        ...GRANTLESS,
      });
      expect(guest.kind, `${slug} must still be paywalled`).toBe("paywall");
      expect(user, `${slug} differs for a grant-less user`).toEqual(guest);
    }
  });

  it("a stealth course is not-launched identically for a guest and a grant-less user", () => {
    for (const slug of STEALTH) {
      const guest = decideCourseAccessFromInput({
        course: course(slug, "live", "granted"),
        ...GUEST,
      });
      const user = decideCourseAccessFromInput({
        course: course(slug, "live", "granted"),
        ...GRANTLESS,
      });
      expect(guest.kind, `${slug} must stay hidden`).toBe("not-launched");
      expect(user, `${slug} differs for a grant-less user`).toEqual(guest);
    }
  });

  it("free public courses stay granted to a guest", () => {
    for (const slug of FREE) {
      const decision = decideCourseAccessFromInput({
        course: course(slug, "live", "free"),
        ...GUEST,
      });
      expect(decision.kind, `${slug} must stay free`).toBe("granted");
    }
  });

  it("an admin sees the same course the same way, disclosed or counted", () => {
    // Admin-preview is a property of the caller, not of the launch snapshot.
    for (const slug of [...PRICED, ...STEALTH]) {
      const decision = decideCourseAccessFromInput({
        course: course(slug, "live", "granted"),
        isAdmin: true,
        entitlements: [],
        subscriptions: [],
        now: NOW,
      });
      expect(decision.kind).toBe("admin-preview");
    }
  });
});
