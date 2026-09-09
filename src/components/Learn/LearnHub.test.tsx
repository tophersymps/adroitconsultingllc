/**
 * LearnHub — group-level ordering (G2, t_f94e01d5).
 *
 * The /learn hub buckets the Hermes Consultant Track into one group and orders
 * it Level 1 → 2 → 3 (then sort_order). groupOrder is the pure comparator the
 * client uses; these tests pin the Level N ordering + null-level (standalone)
 * fallback so the provisioned track renders in the right order.
 */
import { describe, it, expect } from "vitest";
import { groupOrder } from "./LearnHub";
import type { LearnCardSeries } from "@/data/types";

function card(overrides: Partial<LearnCardSeries>): LearnCardSeries {
  return {
    slug: "x",
    name: "x",
    description: "",
    gradient: "",
    lessonCount: 0,
    totalLessons: 0,
    lessonSlugs: [],
    section: null,
    group: null,
    track: null,
    level: null,
    sortOrder: 0,
    difficulty: null,
    canAccess: false,
    ...overrides,
  };
}

describe("LearnHub groupOrder (t_f94e01d5)", () => {
  it("orders the Hermes track Level 1 → 2 → 3 (then sort_order)", () => {
    const l1 = card({ slug: "hermes-consultant", track: "hermes-consultant", level: 1, sortOrder: 10 });
    const l2 = card({ slug: "hermes-consultant-intermediate", track: "hermes-consultant", level: 2, sortOrder: 20 });
    const l3 = card({ slug: "hermes-consultant-advanced", track: "hermes-consultant", level: 3, sortOrder: 30 });
    const sorted = [l3, l1, l2].sort(groupOrder);
    expect(sorted.map((c) => c.slug)).toEqual([
      "hermes-consultant",
      "hermes-consultant-intermediate",
      "hermes-consultant-advanced",
    ]);
  });

  it("puts null-level (standalone) courses after any leveled course", () => {
    const leveled = card({ slug: "l1", level: 1 });
    const standalone = card({ slug: "standalone", level: null, sortOrder: 0 });
    expect(groupOrder(standalone, leveled)).toBeGreaterThan(0);
    const sorted = [standalone, leveled].sort(groupOrder);
    expect(sorted[0].slug).toBe("l1");
  });

  it("breaks level ties by sort_order", () => {
    const a = card({ slug: "a", level: 2, sortOrder: 20 });
    const b = card({ slug: "b", level: 2, sortOrder: 10 });
    const sorted = [a, b].sort(groupOrder);
    expect(sorted.map((c) => c.slug)).toEqual(["b", "a"]);
  });
});
