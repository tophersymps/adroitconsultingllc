/**
 * robots.txt wiring (t_dc2f7d85).
 *
 * adroit.io's Hobby plan cannot buy overage on Fluid Active CPU (crossing 100%
 * pauses the deployment), and measured crawler traffic on 2026-11-15 was
 * 4.8-5.0 function requests/min against a 554-URL sitemap that grows with every
 * publish. The named AI/scraper groups below are the durable half of the fix;
 * these tests lock them in AND lock the parts that must NOT change: `*` keeps
 * allow `/` with the existing disallow list, and Googlebot/Bingbot stay clean so
 * normal SEO crawling is unaffected.
 */
import { describe, it, expect } from "vitest";
import robots from "./robots";

type Rule = { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] };

function rules(): Rule[] {
  const r = robots().rules;
  return (Array.isArray(r) ? r : [r]) as Rule[];
}

function agents(rule: Rule): string[] {
  return Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
}

function paths(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

describe("robots.txt (t_dc2f7d85)", () => {
  it("disallows the named AI / bulk-scraper agents outright", () => {
    const aiRule = rules().find((rule) => !agents(rule).includes("*"));

    expect(aiRule, "expected a specific user-agent group").toBeDefined();
    expect(agents(aiRule!)).toEqual(
      expect.arrayContaining([
        "GPTBot",
        "ChatGPT-User",
        "ClaudeBot",
        "anthropic-ai",
        "CCBot",
        "Bytespider",
        "Amazonbot",
        "PerplexityBot",
        "Google-Extended",
        "Applebot-Extended",
        "Meta-ExternalAgent",
      ]),
    );
    expect(paths(aiRule!.disallow)).toEqual(["/"]);
  });

  it("keeps the catch-all group allowing the site with the existing disallow list", () => {
    const star = rules().find((rule) => agents(rule).includes("*"));

    expect(star, "expected a `*` group").toBeDefined();
    expect(paths(star!.allow)).toEqual(["/"]);
    expect(paths(star!.disallow)).toEqual([
      "/api/",
      "/preview/",
      "/admin/",
      "/lab/",
    ]);
  });

  it("leaves Googlebot and Bingbot fully allowed (SEO crawling is not the problem)", () => {
    const named = rules().flatMap(agents);

    expect(named).not.toContain("Googlebot");
    expect(named).not.toContain("Bingbot");
    expect(named).not.toContain("Applebot");
  });

  it("still advertises the sitemap", () => {
    expect(robots().sitemap).toBe("https://adroit.io/sitemap.xml");
  });
});
