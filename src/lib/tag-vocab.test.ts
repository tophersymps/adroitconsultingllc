import { describe, it, expect } from "vitest";
import {
  TAG_DEFINITIONS,
  getTagDefinition,
  TAG_DEFINITION_MAP,
} from "@/lib/tag-vocab";

describe("tag-vocab — canonical vocabulary", () => {
  it("is capped at ~40 canonical tags", () => {
    expect(TAG_DEFINITIONS.length).toBeLessThanOrEqual(40);
  });

  it("has unique tag names and slugs", () => {
    const names = TAG_DEFINITIONS.map((d) => d.tag);
    const slugs = TAG_DEFINITIONS.map((d) => d.slug);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every tag a non-trivial definition", () => {
    for (const d of TAG_DEFINITIONS) {
      expect(d.definition.length).toBeGreaterThan(20);
    }
  });

  it("computes slugs consistently", () => {
    expect(getTagDefinition("AI Agents")?.slug).toBe("ai-agents");
    expect(getTagDefinition("React & Web Dev")).toBeUndefined(); // not canonical
  });

  it("B-22: slash tags produce single-segment slugs (UI/UX→ui-ux, CI/CD→ci-cd)", () => {
    expect(getTagDefinition("UI/UX")?.slug).toBe("ui-ux");
    expect(getTagDefinition("CI/CD")?.slug).toBe("ci-cd");
    // every slug must be a single path segment (no "/"), so it can match /tags/[tag]
    for (const d of TAG_DEFINITIONS) {
      expect(d.slug).not.toMatch(/\//);
      expect(d.slug).toMatch(/^\w+(-\w+)*$/);
    }
  });

  it("exposes a tag→definition map", () => {
    expect(TAG_DEFINITION_MAP["Salesforce"]).toContain("platform");
  });
});
