import { describe, expect, it } from "vitest";
import { AVATAR_HUE_CLASSES, avatarHueClass, initialsFromEmail } from "./avatar";

describe("initialsFromEmail", () => {
  it('"jane.doe@adroit.io" → "JD"', () => {
    expect(initialsFromEmail("jane.doe@adroit.io")).toBe("JD");
  });

  it('"jane@adroit.io" → "JA"', () => {
    expect(initialsFromEmail("jane@adroit.io")).toBe("JA");
  });

  it('"j@adroit.io" → "J"', () => {
    expect(initialsFromEmail("j@adroit.io")).toBe("J");
  });

  it('"" → "A"', () => {
    expect(initialsFromEmail("")).toBe("A");
  });

  it('"9to5@x.io" → "9T"', () => {
    expect(initialsFromEmail("9to5@x.io")).toBe("9T");
  });

  it("handles separator variants: dash, underscore, plus, spaces", () => {
    expect(initialsFromEmail("john-doe@x.io")).toBe("JD");
    expect(initialsFromEmail("john_doe@x.io")).toBe("JD");
    expect(initialsFromEmail("john+tag@x.io")).toBe("JT");
    expect(initialsFromEmail("john doe@x.io")).toBe("JD");
  });

  it("handles an email with no @ → local-part initials", () => {
    expect(initialsFromEmail("alice")).toBe("AL");
  });

  it("is case-insensitive in output", () => {
    expect(initialsFromEmail("Jane.Doe@Adroit.IO")).toBe("JD");
  });
});

describe("avatarHueClass", () => {
  it("returns one of the four avatar hue classes", () => {
    for (const email of ["a@x.io", "b@x.io", "c@x.io", "d@x.io", "e@x.io"]) {
      expect(AVATAR_HUE_CLASSES).toContain(avatarHueClass(email));
    }
  });

  it("is deterministic — same input yields the same class", () => {
    const email = "jane.doe@adroit.io";
    expect(avatarHueClass(email)).toBe(avatarHueClass(email));
  });

  it("covers all four hues across a sample set", () => {
    const emails = [
      "alpha@x.io",
      "bravo@x.io",
      "charlie@x.io",
      "delta@x.io",
      "echo@x.io",
      "foxtrot@x.io",
      "golf@x.io",
      "hotel@x.io",
      "india@x.io",
      "juliet@x.io",
      "kilo@x.io",
      "lima@x.io",
    ];
    const used = new Set(emails.map(avatarHueClass));
    expect(used.size).toBe(AVATAR_HUE_CLASSES.length);
  });

  it("empty email is deterministic too", () => {
    expect(avatarHueClass("")).toBe(avatarHueClass(""));
    expect(AVATAR_HUE_CLASSES).toContain(avatarHueClass(""));
  });
});
