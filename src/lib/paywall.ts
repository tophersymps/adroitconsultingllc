import type {
  AccessModel,
  CourseRow,
  PaywallAccessOption,
  PaywallView,
} from "@/shared/contracts-course-catalog";
import type { LearningSeries } from "@/data/types";

/**
 * src/lib/paywall.ts — build the PaywallView for a locked course from the
 * course's real access options (no mocks). Only invoked for a live course the
 * user cannot access (decision kind === "paywall").
 */

/** Humanised access options for an access model. `free` never reaches a
 *  paywall (granted to everyone), but is handled for completeness. */
export function accessOptionsForModel(
  model: AccessModel,
  priceCents: number | null,
): PaywallAccessOption[] {
  const money = (cents: number) =>
    `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

  switch (model) {
    case "free":
      return [{ model, label: "Free for everyone", actionable: false }];
    case "granted":
      return [
        {
          model,
          label: "Granted by an admin — contact support for access",
          actionable: false,
        },
      ];
    case "one-time":
      return [
        {
          model,
          label: priceCents != null ? `${money(priceCents)} one-time` : "One-time purchase",
          actionable: true,
        },
      ];
    case "subscription":
      return [
        {
          model,
          label: "Subscribe for access",
          actionable: true,
        },
      ];
    case "sub-or-one-time":
      return [
        {
          model,
          label: "Subscribe for access",
          actionable: true,
        },
        {
          model,
          label:
            priceCents != null ? `${money(priceCents)} one-time` : "One-time purchase",
          actionable: true,
        },
      ];
  }
}

/**
 * Assemble the PaywallView for a locked course. `series` carries the display
 * name + gradient (content); `peekLessonSlug` is the first published lesson
 * slug (may be null for a series with no published lessons yet).
 */
export function buildPaywallView(input: {
  course: CourseRow;
  series: LearningSeries;
  peekLessonSlug: string | null;
}): PaywallView {
  return {
    courseName: input.series.name,
    gradient: input.series.gradient,
    peekLessonSlug: input.peekLessonSlug,
    options: accessOptionsForModel(
      input.course.access_model,
      input.course.price_cents,
    ),
  };
}
