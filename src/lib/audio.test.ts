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

  it("timingsStoragePath (when present) follows blog/<slug>/<voice>.timing.json", () => {
    for (const a of articleAudio) {
      if (!a.timingsStoragePath) continue;
      expect(a.timingsStoragePath).toBe(`blog/${a.slug}/${a.voice}.timing.json`);
      expect(a.timingsStoragePath).toMatch(/\.timing\.json$/);
    }
  });

  /**
   * Regression guard (t_ebba3564): the audio-backfill cron rewrites the shared
   * src/data/audio.ts from origin/main and twice silently dropped the Tier C
   * pilot timings wiring (critical A11y finding, review t_7816c21f). With no
   * timingsStoragePath the /api/audio/<slug>/timings route 404s at its step 3
   * guard, so Follow-along + paragraph scroll-sync never render on the very
   * articles the feature was built for. Lock the 5 pilots by name.
   */
  it("the 5 Tier C pilot articles keep their timingsStoragePath wiring", () => {
    const PILOTS = [
      "agent-eval-infrastructure-2026",
      "backup-restore-validation-2026",
      "realtime-subscription-lifecycle-supabase-2026",
      "salesforce-release-discipline-2026",
      "prompt-caching-ai-infrastructure-2026",
    ];
    const bySlug = new Map(articleAudio.map((a) => [a.slug, a]));
    for (const slug of PILOTS) {
      const entry = bySlug.get(slug);
      expect(entry, `${slug} missing from src/data/audio.ts`).toBeDefined();
      expect(
        entry!.timingsStoragePath,
        `${slug} lost its timingsStoragePath (Tier C scroll-sync regression)`,
      ).toBe(`blog/${slug}/${entry!.voice}.timing.json`);
    }
  });
});