# Quiz Tiers + Gating — Exact Copy Deck

> **Task:** t_0809d7ff · **Author:** kara (designer) · **Date:** 2026-08-10
> **Repo:** `adroit-blog` · **Tenant:** adroit-blog
> This deck is the single source of truth for copy in the quiz tiers. Steel uses these strings verbatim; zod verifies against them. Mockups implement every string below.

---

## 1. Lesson quiz embed (authed)

| Element | Copy (exact) |
|---|---|
| Section kicker | `Practice Questions` (red tick + mono, uppercase) |
| Section meta | `3 QUESTIONS · ~2 MIN` |
| Section title | `Check your understanding` |
| Section note | `Answer all three to lock in this lesson. Your best score is tracked and counts toward your certification readiness.` |
| Widget kicker | `Quiz · Lesson {N}` |
| Progress label | `Question {i} of 3` |
| Submit button | `Submit answer` (disabled until selection) |
| Grading button | `Grading…` + spinner |
| After submit | `Next question` (Q1–2), `See results` (Q3) |
| Correct tag | `Correct` |
| Wrong tag | `Your answer` |
| Correct-unselected tag | `Correct answer` |
| Explanation kicker | `Why` |
| Results label | `Best score · {n} attempts` (fallback `Best score tracked`) |
| Retake button | `Retake quiz` |
| Back button | `Back to lesson` |
| Empty (authed, no questions.json) | render nothing — no placeholder card |

## 2. Knowledge check page (authed)

| Element | Copy (exact) |
|---|---|
| Page kicker | `Knowledge Check {n} · Lessons {a}–{b}` (red tick + mono, uppercase) |
| Page title | `Knowledge Check {n}` |
| Page sub | `Fifteen questions pooled from Lessons {a}–{b} — {topics}. Pass with 80% or higher to move toward unlocking the cert prep exam.` |
| Pass-status row — pending | `Not yet passed · 80% required` (neutral gray pill) |
| Pass-status row — passed | `Passed · {best}% best` (emerald pill) |
| Widget kicker | `Knowledge Check {n} · 15 questions` |
| Progress label | `Question {i} of 15` |
| Results verdict — pass | `Passed · 80% required` (emerald pill + ring) |
| Results verdict — fail | `Keep going — 80% required` (red pill + ring) |
| Boundary note (80.0) | `Passed — 80 flat counts` |
| Fail score label | `Best score · {n} attempts · retake to pass` |
| Retake button | `Retake check` |
| Back button | `Back to series` |

## 3. Check card list (series page)

| Element | Copy (exact) |
|---|---|
| Section label | `Knowledge Checks · {x}/9 passed` (mono, emerald count) |
| Section title | `Milestone checks` |
| Section note | `One 15-question check every five lessons. Pass each with 80%+ to unlock the cert prep exam. Rows link to each check page — guests see the same list, and each page shows the sign-up CTA.` |
| Row chip | `K1` … `K9` (mono) |
| Row title | `Knowledge Check {n} — Lessons {a}–{b}` |
| Row subtitle | topics, e.g. `Fundamentals · FlexCards · DataRaptors` |
| Status — passed | `Passed · {best}%` (emerald pill) |
| Status — retake | `{best}% · retake` (red pill) |
| Status — not taken | `Not taken` (neutral pill) |

## 4. Cert prep exam (authed, unlocked)

| Element | Copy (exact) |
|---|---|
| Timer brand | `Cert Prep Exam` · `· 60 questions` (mono) |
| Timer label | `Time remaining` |
| Timer note | `Auto-submits at 00:00` (always visible inline) |
| Page kicker | `Cert Prep Exam · OmniStudio Developer Certification` (navy tick + mono) |
| Page title | `Certification Prep Exam` |
| Page meta | `60 questions` / `105 minutes · no feedback` / `pass ≥ 72%` |
| Progress label | `Question {i} of 60` |
| Answered count | `{n} answered` |
| Flag button | `Flag for review` → `Flagged` (on state) |
| Next button | `Next question`; last question → `Submit exam` |
| No-feedback note | `Exam mode — no correct/wrong feedback during the run. Answers are reviewed on the results screen.` |
| Results verdict — pass | `Passed · 72% required` (emerald) |
| Results verdict — fail | `Not passed · 72% required` (red) |
| Results meta | `Best score tracked · retakes unlimited` |
| Review head | `Answer review` / `60 items` |
| Review tag | `flagged` (red mono) |
| Retake button | `Retake exam` |
| Back button | `Back to series` |
| Timer warning (<10:00) | countdown flips red + soft pulse — no text change |
| Timer urgent (<02:00) | stronger red + faster pulse — no text change |

## 5. Guest CTA placeholder (all pages — gating)

| Element | Copy (exact) |
|---|---|
| **Headline (EXACT, all tiers)** | `Test what you learned and track your progress by creating an account and logging in!` |
| Kicker — lesson | `Quiz · locked for guests` |
| Kicker — check | `Knowledge Check · locked for guests` |
| Kicker — exam | `Cert Prep Exam · locked for guests` |
| Benefit line — lesson | `3 questions per lesson · knowledge checks · timed exam · certificate` |
| Benefit line — check | `15 questions per check · 9 checks · 80% to pass` |
| Benefit line — exam | `60 questions · 105 minutes · pass ≥ 72% · certificate` |
| Primary button | `Create an account` → `/login?next=<current-path>` |
| Secondary link | `Log in` → `/login?next=<current-path>` |
| Body — lesson | `Your answers, best scores, and lesson progress are saved to your account so you can pick up right where you left off — on any device.` |
| Body — check | `Pass each 15-question check with 80%+ to work toward unlocking the timed cert prep exam.` |
| Body — exam | `Take the timed 60-question exam when all 9 knowledge checks are passed, and earn your printable certificate of completion.` |
| Semantics | `<section aria-label="Practice questions locked">` (per-page label) — ZERO question text in HTML |

## 6. Exam locked state (authed, checks incomplete)

| Element | Copy (exact) |
|---|---|
| Panel kicker | `Cert Prep Exam · locked` (red-light mono + lock glyph) |
| **Headline (EXACT)** | `Unlock: complete all 9 knowledge checks with 80%+` |
| Panel sub | `The timed cert prep exam opens once every knowledge check is passed at 80% or higher. Pass each check, then come back to start your 105-minute run.` |
| Summary label | `Checks passed {x}/9` |
| Summary meta | `80% required per check` |
| Row status — passed | `Passed · {best}%` (emerald) |
| Row status — retake | `{best}% · 80% required` (neutral → red on retake pill) |
| Row status — pending | `80% required` (neutral) |
| Note (below panel) | `The gate is the list itself — no disabled "Start exam" button. Rows link to each check page so the user can go fix a failed check. Guests see the sign-up CTA instead of this panel (mockup-guest-cta.html).` |
| Series card — locked | `Locked — checks passed {x}/9 · 80% required` + disabled `Complete checks to unlock` |
| Series card — unlocked | `Unlocked — all 9 checks passed` + `Take the exam →` |

## 7. Certificate

| Element | Copy (exact) |
|---|---|
| Page kicker | `Certificate of Completion` |
| Page title | `Your certificate` |
| Page sub | `Issued by Adroit Consulting when all 46 lessons are completed and the cert prep exam is passed at 72% or higher.` |
| Print button | `Print certificate` |
| Cert kicker | `Adroit Consulting · Certified Training` |
| Cert title | `Certificate of Completion` |
| Recipient label | `This certifies that` |
| Recipient | user's name (display) |
| Body | `has successfully completed the **OmniStudio Developer Certification Prep** curriculum — all 46 lessons and the timed certification exam.` |
| Meta — course | `Course` / `OmniStudio Developer Certification Prep` |
| Meta — completed | `Completed` / date |
| Meta — score | `Exam score` / `{best}%` |
| Seal | red circle ring + `A` + `Adroit` (SVG, no image file) |
| Signature | `Adroit Consulting` / `Training & Enablement` |
| Issuer | `ADROIT CONSULTING` / `CERTIFIED TRAINING · 2026` |
| Not-eligible kicker | `Certificate not yet available` |
| Not-eligible title | `Complete all 46 lessons and pass the exam with 72%+` |
| Not-eligible sub | `Your certificate unlocks once both conditions are met. Here's where you stand:` |
| Eligibility rows | `All 46 lessons completed` / `Cert prep exam passed (≥ 72%)` / `Exam unlocked — all 9 knowledge checks ≥ 80%` with per-row mono counts |

---

## Verification notes for zod

1. Guest pages: search rendered HTML for any option/question text → MUST be absent; only the CTA strings above appear.
2. Locked exam: summary count MUST equal the number of `Passed` rows (internal consistency).
3. 80% boundary: a check with best score exactly 80.0 shows `Passed`, not `Keep going`.
4. Lesson quiz: `Submit answer` disabled until an option is selected; `Grading…` shows during grading; `Next question`/`See results` after.
5. Exam: timer shows `Auto-submits at 00:00` inline; per-question feedback is NEVER rendered during the run (no correct/wrong styling, no explanation panel).
6. Certificate print: nav/footer hidden via `.no-print`, `@page { margin: 0 }`, `print-color-adjust: exact` keeps navy frame + red seal.
