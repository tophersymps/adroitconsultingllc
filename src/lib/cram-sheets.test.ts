import { describe, expect, it } from "vitest";
import { cramSheetSeries, getCramSheet, type CramSheet } from "./cram-sheets";

/**
 * The cram sheet is a PUBLIC page that makes factual claims about an exam, so
 * these assertions are the guard rail: the declared domain weights and question
 * draws must agree with the totals, and no string may carry a character the
 * house copy rules ban.
 */
const SHEETS = cramSheetSeries().map((s) => [s, getCramSheet(s)!] as [string, CramSheet]);

describe("cram sheet registry", () => {
  it("registers at least one sheet and resolves by series slug", () => {
    expect(cramSheetSeries().length).toBeGreaterThan(0);
    for (const [slug, sheet] of SHEETS) {
      expect(sheet.series).toBe(slug);
      expect(getCramSheet(slug)).toBe(sheet);
    }
  });

  it("returns null for a series with no sheet", () => {
    expect(getCramSheet("no-such-series")).toBeNull();
    expect(getCramSheet("")).toBeNull();
  });

  it.each(SHEETS)("%s: domain weights total 100", (_slug, sheet) => {
    const total = sheet.domains.reduce((sum, d) => sum + d.weightPct, 0);
    expect(total).toBe(100);
  });

  it.each(SHEETS)("%s: question draws total the question count", (_slug, sheet) => {
    const total = sheet.domains.reduce((sum, d) => sum + d.examDraw, 0);
    expect(total).toBe(sheet.examFacts.scoredQuestions);
  });

  it.each(SHEETS)("%s: every domain carries at least one objective", (_slug, sheet) => {
    for (const d of sheet.domains) {
      expect(sheet.objectives.filter((o) => o.domain === d.domain).length).toBeGreaterThan(0);
    }
  });

  it.each(SHEETS)("%s: objectives belong to a declared domain and are unique", (_slug, sheet) => {
    const declared = new Set(sheet.domains.map((d) => d.domain));
    const ids = sheet.objectives.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of sheet.objectives) {
      expect(declared.has(o.domain)).toBe(true);
      expect(o.objective.trim().length).toBeGreaterThan(0);
      expect(o.rules.length).toBeGreaterThan(0);
      expect(o.trap.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(SHEETS)("%s: copy is ASCII with no banned punctuation", (_slug, sheet) => {
    const strings = [
      sheet.title,
      ...sheet.domains.map((d) => d.domain),
      ...sheet.objectives.flatMap((o) => [o.id, o.domain, o.objective, o.trap, ...o.rules]),
    ];
    for (const s of strings) {
      expect(/^[\x20-\x7E]*$/.test(s), `non-ASCII in: ${s}`).toBe(true);
      expect(/[\u2013\u2014\u2018\u2019\u201C\u201D]/.test(s), `banned punctuation in: ${s}`).toBe(
        false,
      );
    }
  });
});
