/**
 * audio.test.ts — generated audio data contract (plan Phase 3).
 *
 * Locks the generated `src/data/audio.ts` shape: >0 entries for the pilot,
 * every entry has the slug/voice/storagePath triple, storagePath follows the
 * private-bucket scheme blog/<slug>/<voice>.mp3, and only the locked single
 * narrator voice (af_heart) is present for the pilot. Any pilot article's
 * audio entry must resolve to the same slug as a real post.
 */
import { describe, it, expect } from "vitest";
import { articleAudio } from "@/data/audio";
import { posts } from "@/data/posts";
import { DEFAULT_VOICE } from "@/lib/audio/contracts";

describe("generated articleAudio (src/data/audio.ts)", () => {
  it("lists at least one narrated article (the pilot is non-empty)", () => {
    expect(articleAudio.length).toBeGreaterThan(0);
  });

  it("every entry carries the slug / voice / storagePath contract triple", () => {
    for (const a of articleAudio) {
      expect(a.slug).toBeTruthy();
      expect(a.voice).toBeTruthy();
      expect(a.storagePath).toBeTruthy();
    }
  });

  it("storagePath follows the private-bucket scheme blog/<slug>/<voice>.mp3", () => {
    for (const a of articleAudio) {
      expect(a.storagePath).toBe(`blog/${a.slug}/${a.voice}.mp3`);
    }
  });

  it("the pilot uses the single locked narrator voice (no multi-voice)", () => {
    for (const a of articleAudio) {
      expect(a.voice).toBe(DEFAULT_VOICE);
    }
  });

  it("every audio slug maps to a real published post in src/data/posts.ts", () => {
    const postSlugs = new Set(posts.map((p) => p.slug));
    for (const a of articleAudio) {
      expect(postSlugs.has(a.slug), `audio slug ${a.slug} not in posts.ts`).toBe(true);
    }
  });
});