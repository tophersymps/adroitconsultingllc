### build-audio.js never narrates a draft article (build-audio-draft-guard)

**What** - `scripts/build-audio.js` now excludes every `status: draft` article from its selection.
The automatic paths (`--recent N`, and `--backfill` with no `--slug`) filter drafts out and log
which ones they skipped; an explicit `--slug` naming a draft is refused with exit 2 and a message
instead of emitting an entry. Clearing `status: draft` makes an article eligible again with no
other change.

**Why** - `build-posts.js` drops `status: draft` files from `src/data/posts.ts`, so a draft has no
public route, and `src/lib/audio.test.ts` asserts that every slug in the audio registry maps to a
real published post. `build-audio.js` had no such check, so a draft could be narrated and
registered and leave that assertion red. That is not hypothetical: on 2026-11-24 the article audio
backfill selected `content/blog/field-notes-reading-components-demo.mdx` (a deliberate draft added
the same day), registered it in `src/data/audio.ts`, and main then carried failing tests on every
push. Deleting the entry did not hold, because the backfill rebuilds its worklist every tick and
re-added it 9 minutes later. The Fortress side of this fix (a draft filter in the backfill's own
selector, plus the same rule in the audio sync watchdog, which was paging that the draft had no
audio) is already in place; this PR closes the gap in the tool itself, which is what made the
fault reachable from an ordinary `--recent N` run.

**Verified** - `node --check scripts/build-audio.js` passes.
`node scripts/build-audio.js --metadata-only --recent 200 --voice af_heart` prints
`Skip 1 draft article(s) (status: draft is never narrated): field-notes-reading-components-demo`
and writes `src/data/audio.ts` with 193 entries, byte-identical to the committed file (empty
`git diff`), which is the draft-free registry.
`node scripts/build-audio.js --metadata-only --slug field-notes-reading-components-demo` exits 2
with the refusal message and writes nothing.
Full suite on this branch: 207 test files, 2021 tests, all passing.

**Known Issues** - the draft's MP3 and timing file, uploaded by the backfill before the Fortress
guard landed, are still in R2 as unreachable objects; no public surface resolves them, and
deleting them is pending an owner decision. No repo test pins the selection boundary inside
`build-audio.js`: the script is a CLI that performs its work at import, so it cannot be imported
from a test. `audio.test.ts` remains the check that catches a draft leak end to end.
