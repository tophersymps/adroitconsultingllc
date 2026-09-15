# Requirements: Interactive Quiz Tiers + Gating (OmniStudio Cert Course)

> **Tenant:** adroit-blog
> **Workspace:** /Users/kelex/Documents/Fortress-of-Solitude/adroit-blog
> **Date:** 2026-08-10
> **Author:** Lois Lane (BA)
> **Governing spec:** docs/course-progression-pattern.md
> **Plan:** /Users/kelex/.hermes/plans/2026-08-10_182705-omni-interactive-quiz-tiers.md
> **Handoff to:** brainiac (web architect)

---

## Executive Summary

The OmniStudio Developer Certification course currently has 8 published lessons (of 46 planned), each carrying 3 prose practice questions rendered as static text in the MDX. The goal is to replace this flat structure with a three-tier quiz system: per-lesson quizzes embedded in lesson pages, knowledge checks every 5 lessons, and a timed certification prep exam. All quiz content is gated behind authentication - guests see a sign-up CTA, not the questions. A certificate of completion is awarded when the user finishes all 46 lessons and passes the exam.

The existing quiz stack (QuizWidget, useQuizProgress, POST /api/progress/quiz, quiz_attempt table, Supabase auth) is live and fully reusable. No database schema changes are needed.

---

## Decision Log (Chris, 2026-08-10)

These decisions are non-negotiable constraints for this build:

1. **Exam timer:** strict 105-minute countdown, auto-submit at zero. Unlimited retakes.
2. **Knowledge check unlock:** NOT gated by lesson completion - all checks visible to authed users. Keep the unlock idea for a future paid tier.
3. **Retakes:** unlimited. Score/progress tracking with best score per quiz and overall certification readiness rollup.
4. **Gating:** hide quizzes entirely if not logged in. On lesson pages, guests see a sign-up CTA placeholder - NOT the plain-text questions. The prose question section is replaced by the interactive widget for authed users and by the CTA placeholder for guests.
5. **Learn ordering:** lessons ordered by lesson number, not date. Sort control available (by lesson number) + "Hide completed" filter.
6. **Certificate of completion:** on full completion of the lesson plan (all 46 lessons + exam).
7. **Post-v1 (NOT this build):** user profile page with badges.
8. **Legacy quiz folded in:** the existing `/learn/[series]/quiz` 5-question page is REMOVED for omni-studio-cert. The series-page "Take the quiz" button becomes the exam entry point.
9. **Exam unlock rule (CANONICAL for all future courses):** the cert exam is locked until every knowledge check passes at >=80% (at least 80 on the best score of each check - 80 flat passes). Exam card shows lock state + progress.

---

## User Stories

### US-001: Per-lesson quiz (authed)

**As a** logged-in learner,
**I want** to answer 3 interactive practice questions at the end of each lesson,
**so that** I can test my understanding of the lesson material and track my progress.

**Acceptance Criteria:**
- Given I am logged in and viewing a lesson page, when the page loads, then I see an interactive quiz with 3 questions from that lesson's requirement.
- Given I am answering a question, when I select an option and click "Check Answer", then I see whether I was correct and an explanation panel.
- Given I have answered all 3 questions, when I view results, then I see a score ring showing correct/total, a percentage, and a "Retake quiz" button.
- Given I retake the quiz, when I submit answers, then my best score and attempt count are preserved from the previous run.
- Given I submit an answer, when the request completes, then my attempt is recorded in the quiz_attempt table (for authed users) and persisted in localStorage.

### US-002: Per-lesson quiz (guest)

**As a** guest visitor who is not logged in,
**I want** to see a sign-up prompt instead of quiz content,
**so that** I understand I need an account to practice and track progress.

**Acceptance Criteria:**
- Given I am not logged in and viewing a lesson page, when the page loads, then I see a sign-up CTA placeholder ("Test what you learned and track your progress by creating an account and logging in!").
- Given I am a guest, when I inspect the page source, then no question text is present in the HTML.
- Given I am a guest, when I view the lesson page, then the prose Practice Questions section from the MDX is not rendered.

### US-003: Knowledge checks

**As a** logged-in learner,
**I want** to take 15-question knowledge checks every 5 lessons,
**so that** I can assess my understanding of a group of related topics before the final exam.

**Acceptance Criteria:**
- Given I am logged in, when I navigate to `/learn/omni-studio-cert/check/<n>` (n=1..9), then I see a 15-question quiz pooled from the preceding 5 lessons.
- Given I complete a knowledge check, when my score is calculated, then "passed" means best score >= 80% (80 flat passes).
- Given I have passed a knowledge check, when I view the series page, then the check card shows passed state.
- Given I am a guest, when I visit a knowledge check page, then I see the sign-up CTA placeholder with no question text in HTML.
- Given I retake a knowledge check, when I complete it, then my best score is updated (max of all attempts) and attempt count increments.

### US-004: Knowledge check list on series page

**As a** logged-in learner,
**I want** to see all 9 knowledge checks listed on the series page,
**so that** I can track which checks I have completed and at what score.

**Acceptance Criteria:**
- Given I am logged in and viewing the series page, when I scroll to the checks section, then I see 9 knowledge check cards labeled "Knowledge Check 1 - Lessons 1-5" through "Knowledge Check 9 - Lessons 41-45".
- Given I have completed some checks, when I view the list, then each card shows my best score and pass/fail state.
- Given I am a guest, when I view the series page, then knowledge check cards are shown but link to pages that display the CTA placeholder.

### US-005: Certification prep exam

**As a** logged-in learner who has passed all knowledge checks,
**I want** to take a 60-question, timed certification prep exam,
**so that** I can prepare for the real Salesforce OmniStudio Developer certification.

**Acceptance Criteria:**
- Given all 9 knowledge checks have best scores >= 80%, when I navigate to `/learn/omni-studio-cert/exam`, then the exam is unlocked and I can begin.
- Given any knowledge check has a best score < 80% or is incomplete, when I navigate to the exam page, then I see a locked screen showing per-check progress ("Unlock: complete all 9 knowledge checks with 80%+") and cannot start the exam.
- Given I start the exam, when the timer begins, then a 105:00 countdown is visible and counts down.
- Given the timer reaches 00:00, when I have not submitted, then my exam is auto-submitted with whatever answers I have provided.
- Given I complete the exam, when results are shown, then I see my score, pass/fail status at the 72% threshold, and a summary of my answers.
- Given I am taking the exam, when I answer questions, then per-question feedback is NOT shown (exam mode).
- Given I complete the exam, when I retake it, then a new attempt is recorded and my best score is updated (max of all attempts).
- Given I am a guest, when I visit the exam page, then I see the sign-up CTA placeholder.

### US-006: Overall progress rollup

**As a** logged-in learner,
**I want** to see my overall progress across lessons, checks, and exam on the series page,
**so that** I can gauge how close I am to certification.

**Acceptance Criteria:**
- Given I am logged in and viewing the series page, when I see the progress section, then it shows "Lessons X/46 - Checks X/9 - Exam best Y%".
- Given I have progress in multiple tiers, when I view the series page, then a "Certification readiness" bar shows a weighted percentage (lessons 40% / checks 30% / exam best 30%).
- Given the exam is locked, when I view the series page, then the exam card shows lock state + unlock progress ("Checks passed X/9 - 80% required").
- Given the legacy "Take the quiz" button existed, when I view the series page, then it has been replaced with "Take the exam" linking to the exam page.

### US-007: Lesson ordering and filtering

**As a** learner,
**I want** lessons to be ordered by lesson number with the ability to hide completed ones,
**so that** I can follow the course in sequence and focus on what I haven't finished.

**Acceptance Criteria:**
- Given I view the series page, when lessons are listed, then they are ordered by lesson number ascending (not by publish date).
- Given I toggle the sort control, when the page updates, then lessons switch between ascending and descending lesson number order.
- Given I activate the "Hide completed" filter, when the lesson list updates, then only lessons I have not marked complete are shown.
- Given I deactivate the "Hide completed" filter, when the lesson list updates, then all lessons are shown again.
- Given the filter state changes, when the page hydrates, then the filter persists correctly without hydration mismatch.

### US-008: Certificate of completion

**As a** learner who has completed all lessons and passed the exam,
**I want** to receive a printable certificate,
**so that** I have proof of completing the certification preparation course.

**Acceptance Criteria:**
- Given I have completed all 46 lessons (lesson_completion rows) AND my exam best score is >= 72%, when I navigate to the certificate page, then I see a printable certificate with my name, the series name, the date, and my exam score.
- Given I have not met both conditions, when I navigate to the certificate page, then I see a message explaining what I need to complete.
- Given I am a guest, when I navigate to the certificate page, then I see the sign-up CTA placeholder.
- Given I print the certificate, when the print dialog opens, then the certificate renders cleanly for printing (no navigation chrome, proper margins).

### US-009: Legacy quiz removal

**As a** learner,
**I want** the old 5-question series quiz to be removed for the OmniStudio course,
**so that** the quiz tiers replace it cleanly without confusion.

**Acceptance Criteria:**
- Given the legacy `/learn/omni-studio-cert/quiz` route existed, when I navigate to it after the change, then the route returns 404.
- Given the series page previously showed "Take the quiz", when I view the page, then it shows "Take the exam" linking to `/learn/omni-studio-cert/exam`.
- Given the existing `QuizStats` component tracked the old series quiz scope, when I view the series page, then it reflects the new tier-based tracking.

---

## Data Entities

### Existing (no schema changes required)

| Table | Columns | Notes |
|---|---|---|
| `quiz_attempt` | user_id, quiz_name, question_index, correct_answer_index, user_answer_index, is_correct, attempted_at | Reused as-is. Arbitrary `quiz_name` strings supported. Tier = `omni-studio-cert:<tier>:<id>`. Per-user RLS. |
| `lesson_completion` | user_id, lesson_slug, completed_at | Reused as-is for lesson tracking and certificate eligibility. |
| `read_progress` | user_id, content_type, content_slug, read_at | Unchanged. |

### Derived (no new table)

| Metric | Derivation |
|---|---|
| Best score per quiz | MAX score over completed runs for a given `quiz_name` per user (from quiz_attempt rows). |
| Check pass status | Best score >= 80% for any `omni-studio-cert:check:<n>`. |
| Exam unlock state | ALL 9 checks have best score >= 80%. |
| Certificate eligibility | ALL 46 lesson_completion rows exist AND exam best score >= 72%. |
| Certification readiness | Weighted: lessons 40% / checks 30% / exam best 30%. |

### Content files (generated)

| File | Description |
|---|---|
| `content/learn/omni-studio-cert/questions/<slug>.json` | Per-lesson quiz: 3 questions from that requirement. |
| `content/learn/omni-studio-cert/checks/check-<n>.json` | Knowledge check: 15 questions from lessons 5n-4..5n. |
| `content/learn/omni-studio-cert/exam.json` | Cert prep exam: 60 questions, domain-weighted to blueprint. |
| `content/omni-studio-cert/questions.json` | **RETIRE** for omni-studio-cert (legacy series quiz). |

### Generator requirements

A generator script (extend `backfill-omni-learn.py` or add `generate-omni-quizzes.py`) must:
- Read `~/.hermes/scripts/omni-studio-curriculum.py` as the canonical question bank.
- Emit 46 per-lesson question files (3 questions each).
- Emit 9 knowledge check files (15 questions each, pooled from 5 lessons).
- Emit 1 exam file (60 questions, domain-weighted: Fundamentals 18% / FlexCards 15% / OmniScripts 20% / IP 15% / Data Mappers 17% / Troubleshooting 15% - approximately 11/9/12/9/10/9 for 60).
- All files use the same JSON shape as existing `questions.json`: `{quizName, title, description, questions[{question, options, correct_answer_index, explanation}]}`.

---

## Integration Needs

### Existing APIs (reuse)

| Route | Method | Usage |
|---|---|---|
| `/api/progress/quiz` | POST | Single quiz attempt submission (server-side grading). Reused for lesson quizzes and knowledge checks. |
| `/api/progress/quiz/run` | POST | Completed run stats sync. Reused for score tracking. |
| `/api/auth/session` | GET | Session check for gating. |

### New API needs (architect decision)

- **Batch exam submission:** The current `/api/progress/quiz` route handles one question at a time. For the 60-question exam, a batch submit route is needed to avoid 60 sequential POSTs. Architect to decide: extend the existing route with a batch body or add a `/api/progress/quiz/batch` endpoint. Rate limits may need exam-scoped relaxation.
- **Certificate validation:** Server-side route to derive certificate eligibility from lesson_completion + quiz_attempt rows. No new table needed initially.

### Auth gating pattern

- Server-side session check on lesson pages, check pages, exam page, and certificate page.
- If guest: render CTA placeholder component (no question content in HTML at all).
- If authed: render interactive quiz content.
- Lesson pages become dynamic-ish (session check in a currently-static page) - architect confirms SSG + client-side gate vs server session read. Prefer server-side gate so guest HTML never contains questions.

---

## Constraints

- No database schema changes - reuse existing `quiz_attempt` and `lesson_completion` tables.
- No image generation for certificates - a clean designed certificate component only.
- No user profile page or badges in this build (post-v1 backlog).
- Knowledge checks are NOT gated by lesson completion (paid-tier unlock is future work).
- Real Salesforce cert questions are NDA-protected - do not pull from dump sites or fabricate "actual" questions.
- Exam questions must be exam-style questions from the official exam guide + curriculum.
- The prose `## Practice Questions` section must be removed from lesson MDX files (content pipeline change).
- Jimmy's daily HTML study card keeps its questions unchanged - that is personal content, not gated blog content.

---

## Scope

### In scope
- Three quiz tiers: per-lesson (3q), knowledge checks (15q, 9 total), cert prep exam (60q, timed).
- Auth gating: hide-all-for-guests with CTA placeholder.
- Exam unlock logic: all 9 checks >= 80%.
- Exam timer: 105 min countdown with auto-submit at zero.
- Unlimited retakes with best score tracking.
- Overall progress rollup on series page.
- Lesson ordering by lesson number + "Hide completed" filter.
- Certificate of completion (all 46 lessons + exam >= 72%).
- Legacy quiz removal for omni-studio-cert.
- Content generator: emit JSON tiers from curriculum source.
- Legacy prose question removal from published lessons 1-8.

### Out of scope
- User profile page with badges (post-v1).
- Paid-tier gating for knowledge checks (future).
- Other learn series (sfarch, agentic) adopting the pattern - they follow the checklist later.
- Jimmy contract patch (orchestrator task, post-deploy).

---

## Priority

**High** - This is the first implementation of the canonical course progression pattern. All future courses depend on this build as the reference.

---

## Open Questions for Chris

1. **Exact certificate completion rule:** The plan says "all 46 lessons + exam >= 72%". Since the exam requires all checks >= 80% to unlock, passing the exam at >= 72% implicitly means all checks were passed. Confirm: is the certificate rule simply "all 46 lessons completed + exam best >= 72%"?
2. **Certification readiness bar formula:** The plan suggests lessons 40% / checks 30% / exam best 30%. Is this weighting approved, or should the architect propose an alternative?
3. **Exam timer trust model:** Should the timer be client-side only, or should server-side elapsed time be checked on submit to prevent clock tampering? This affects API design.
4. **Certificate design:** Kara will handle the visual design. Confirm: the certificate should include the user's name, course name, completion date, and exam score. Any additional fields?

---

## Risks and Tradeoffs

- **Lesson page becomes dynamic-ish:** Session check in a currently-static page introduces a minor performance cost. Architect to confirm SSG + client-side gate vs server session read.
- **Exam batch grading:** 60 sequential POSTs to the existing route is bad. A batch endpoint is needed, which requires rate limit adjustments.
- **Certificate validity:** Derived from existing rows on demand - no table. Revalidate at print time. Badges/profile in v2 will introduce user profile infrastructure.
- **Sorting contract change:** `learn.ts`'s "newest first" ADR-002 comment must be updated to the new lesson-number contract. `build-learn.js` may also sort - keep both in sync.
- **Prose removal from lessons 1-5:** The existing `**Q:**` prose blocks get replaced by the widget. Verify that `verify-article.py`-style checks don't flag the lesson MDX changes.
