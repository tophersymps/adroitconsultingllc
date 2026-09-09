# Adroit Learn — Course Catalog + Entitlements + Admin: Requirements

**Date:** 2026-08-25
**Author:** Lois Lane (BA)
**Project:** Adroit Blog / Adroit Learn (tenant: adroit-blog)
**Repo:** ~/Documents/Fortress-of-Solitude/adroit-blog
**Source of truth:** Plan v3 (FINAL, approved 2026-08-25 — all decisions locked by Chris). Backlog: kelex1812/adroit-blog issues #1-5 (platform).
**Handoff to:** brainiac (web)

## 1. Executive Summary

Adroit Learn grows from a public learning path into a course catalog with purchase/subscription entitlements and an admin backend. Course status (pending/live/archived) and access model (free/subscription/one-time/sub-or-one-time/granted) live in the database, never in content files, so the Daily Planet can author course content in parallel without touching platform code. The first course, Hermes Consultant, ships `granted`: Chris (admin) sees and accesses it; he can grant it to other users later from the admin panel with no code change. Payment processing is explicitly out of scope now - the entitlement model is built so Stripe/webhooks slot in later with zero access-logic changes. Blog articles stay fully public; nothing in this project changes blog gating.

## 2. Roles

| Role | What they are |
|---|---|
| Admin | Chris today; others assignable from the admin panel. Sees all course statuses, manages courses and users, grants/revokes entitlements, launches courses. |
| Member | Any signed-in user who is not admin. Sees the live catalog; content gated by entitlement. |
| Guest | Not signed in. Existing site behavior: catalog cards visible but non-clickable with a sign-in CTA (see Open Question 1). |

## 3. User Stories

### Epic A - Data model + access seam (issues #2, #3)

**US-001: Course status and access model live in the database**
As an admin, I want course status and access model stored in the `courses` table (keyed by series_slug), so that launching, re-gating, or retiring a course is a data change, not a deploy.
- Given a course row exists with status `pending` and access_model `granted`, When an admin flips status to `live` in the admin panel, Then the course card, summary, and syllabus appear in the public catalog on the next request with no code change or content-file edit.
- Given a course row has access_model `granted`, When an admin changes it to `sub-or-one-time`, Then entitlement checks use the new model for all subsequent access decisions.
- Given a series exists in `content/learn/` with no `courses` row, When a user requests that series, Then the platform treats it as not launched (admin-only visibility, excluded from public catalog) rather than erroring.
- Given a `courses` row, When admin sets status to `archived`, Then the course is hidden from the catalog and sitemap and visible to admins only.

**US-002: Server-side access seam**
As the platform, I want a single server-side access module (`src/lib/access.ts` with `getCatalogForUser`, `canAccessCourse`, `isAdmin`), so that every surface enforces entitlements one way instead of each page re-implementing the check.
- Given the access module, When any page or API route needs the catalog for a user, Then it calls `getCatalogForUser(user)` and gets only the courses that user may see (live for everyone, pending/archived for admins).
- Given a user and a course, When `canAccessCourse` is called, Then it returns true only when the user is admin OR the entitlement check passes for the course's access model (`free`: any signed-in user; `subscription`: active `subscriptions` row; `one-time`: `user_entitlements` row with source `one-time`; `sub-or-one-time`: either; `granted`: `user_entitlements` row with source `granted`).
- Given the access module, When a non-admin request reaches a content surface for a course they cannot access, Then the decision is made server-side (force-dynamic pages, API routes) - never by hiding UI on the client.

**US-003: Role model with seeded admin**
As an admin, I want roles stored in `user_roles` (admin|member) with Chris seeded as admin, so that the admin panel has a trustworthy role to gate on.
- Given the migration runs, When Chris signs in, Then `isAdmin(kelex)` returns true with no manual setup.
- Given a user with no `user_roles` row, When the platform checks their role, Then they are treated as `member`.

### Epic B - Catalog + gating sweep (issue #4)

**US-004: Live course - public catalog, gated content**
As a member, I want to see every live course's card, summary, and syllabus in the catalog, so that I can evaluate a course before I have access to it.
- Given a live course, When any signed-in user visits `/learn`, Then they see the course card with summary.
- Given a live course, When any user visits `/learn/[series]`, Then the syllabus (lesson list) is visible.
- Given a live course, When the course appears in `sitemap.ts` and `generateStaticParams`, Then only live courses are included; pending and archived courses are excluded from both.

**US-005: Entitled user - full content access**
As a member with an entitlement for a live course, I want to read its lessons and use check/exam/certificate, so that I can complete the course.
- Given a user entitled to a live course, When they open a lesson page, check, exam, or certificate route, Then the content renders and progress/quiz APIs accept their requests.
- Given an entitled user, When their entitlement is revoked mid-course, Then their next request to gated content is denied (no cached access).

**US-006: Non-entitled user - paywall, not content**
As a member without an entitlement for a live course, I want to see a paywall instead of the content, so that I understand how to get access.
- Given a live course with access model `sub-or-one-time` and no entitlement for the user, When they open a lesson page, Then they see a paywall/lock state (not the lesson content) explaining the access options for that course's model.
- Given the same user, When they hit the progress or quiz APIs for that course, Then the APIs reject the request server-side.

**US-007: Pending and archived courses - admin-only**
As an admin, I want to preview pending and archived course content, so that I can verify before launch and manage retirements.
- Given a pending course, When an admin opens its series or lesson routes, Then the content is available to them via a dynamic server-side read (not statically generated, not in the sitemap, no JSON-LD).
- Given a pending course, When a non-admin user requests its series or lesson routes, Then they get 404/403 - not a redirect to the catalog, not a paywall.
- Given a pending course, When Daily Planet lands new lesson content, Then `build-learn.js` skips it (lesson frontmatter `status: draft`) and static generation is unaffected.

**US-008: Blog stays public**
As a reader, I want blog articles to remain fully public, so that this project does not change anything about the existing blog.
- Given this work is complete, When a guest or member reads any blog post, Then behavior is identical to today (draft to published flow untouched).

### Epic C - Admin backend (issue #5)

**US-009: Course management**
As an admin, I want to list all courses with their status and set status, access model, and price, so that I can launch, re-gate, or retire courses from one place.
- Given the admin panel, When I open course management, Then I see every course (pending, live, archived) with its status, access model, and price.
- Given a pending course, When I click launch, Then status becomes `live`, `launched_at` is set, and the course appears in the public catalog.
- Given a live course, When I set access model and price, Then entitlement checks and paywall copy reflect the new values.

**US-010: User management with search**
As an admin, I want to list users and search or filter them by name or email, so that I can find a specific user in a growing user base.
- Given the admin panel, When I open user management, Then I see users with name, email, role, and their course entitlements.
- Given the user list, When I type a name or email fragment, Then the list filters to matches.

**US-011: Role assignment**
As an admin, I want to assign admin or member role to a user, so that I can delegate admin access.
- Given a user, When I change their role to admin, Then they can access the admin panel and all course statuses on their next request.
- Given a user, When I demote them to member, Then admin surfaces return 404/403 for them.

**US-012: Grant and revoke entitlements, with note**
As an admin, I want to grant or revoke a course to a user with an optional grant note, so that I can control exactly who has access and why.
- Given a user and a course, When I grant the course with a grant note, Then a `user_entitlements` row is written (source `granted`, grant_note) and the user is entitled immediately - no code change.
- Given an existing grant, When I revoke it, Then the user's access to that course's gated content is denied on their next request.

**US-013: Bulk grant**
As an admin, I want to grant one course to many selected users at once, so that onboarding a cohort is not one row at a time.
- Given a course and several selected users, When I bulk-grant, Then one `user_entitlements` row is written per selected user (source `granted`) and all selected users are entitled.

**US-014: User-course matrix**
As an admin, I want to see which courses each user has, so that I can answer "what does this user have access to?" at a glance.
- Given the admin panel, When I view the user-course matrix, Then I see entitlements per user per course with source and grant date.

**US-015: Admin audit log**
As an admin, I want every admin action recorded in `admin_audit_log` (who, what, when), so that I can trace who launched, granted, revoked, or changed a role.
- Given any admin action (launch, status change, access-model change, role change, grant, revoke, bulk grant), When it completes, Then an audit row is written with actor, action, target, and timestamp.
- Given the audit log, When I open it in the admin panel, Then I can read the entries (read-only).

**US-016: Admin routes are role-gated server-side (security non-negotiable)**
As the platform, I want every `/admin` route and admin API role-gated server-side, so that hiding the nav is never the only protection.
- Given a non-admin user, When they type `/admin` or any admin subroute in the URL, Then they get 404 or 403 (not a rendered page, not a client-side redirect).
- Given a non-admin user, When they call any admin API endpoint directly, Then the server rejects the request.
- Given an admin action attempted by a non-admin, When it is rejected, Then the attempt is visible (audit log or server log) so it is not silent.

## 4. Scope Boundaries

**In scope:**
- New Supabase tables + migrations + RLS: `user_roles`, `courses`, `user_entitlements`, `subscriptions`, `admin_audit_log` (exact schema and RLS policies are brainiac's to detail)
- `src/lib/access.ts` server-side access seam
- Catalog + gating sweep: `/learn` hub, `/learn/[series]`, lesson/check/exam/certificate routes, `sitemap.ts`, `generateStaticParams`, progress/quiz APIs
- `/admin` section: course management, user management (search/filter), role assignment, grant/revoke with grant note, bulk grant, user-course matrix, audit log
- `granted` access path end-to-end (the path Chris uses before charging anyone)
- Admin UX (kara), architecture (brainiac), implementation (steel), QA + a11y + security (zod/lara/val-el)

**Out of scope (explicitly deferred to V2 or later):**
- Payment integration (Stripe/webhook) - the entitlement model is built so it slots in with zero access-logic changes; no payment code ships now
- Full subscription-plan management - read-only display of the `subscriptions` table until payments hookup
- Per-course completion analytics
- Any change to blog gating or the draft-to-published blog flow
- Course content authoring - Daily Planet's workstream (issues #6-8), running in parallel; content lands in `content/learn/` and the platform reads it at runtime

## 5. Constraints

- Status and entitlements live in the database, never in content files - this is the seam that lets Daily Planet author content uninterrupted (non-negotiable, Plan v3)
- Pending courses are not statically generated, not in the sitemap, no JSON-LD; admins reach pending content via a dynamic server-side MDX read
- Lesson pages stay `force-dynamic`; entitlement checks run server-side before content renders
- Enforcement is server-side (force-dynamic pages + API routes), mirroring the existing quiz-gating pattern - never client-side RLS or hidden UI
- Existing guest behavior on the learn hub (non-clickable cards, sign-in CTA) is preserved
- Blog articles remain fully public
- Content and platform touch disjoint repo areas (`content/learn/` vs `src/` + `supabase/`) - no cross-stream git collision by construction

## 6. Dependencies

- Supabase is already home to auth, progress, and quiz tables - new tables extend the existing project (migrations 008+)
- `scripts/build-learn.js` already skips draft lessons - pending-course exclusion builds on that
- Daily Planet content (issues #6-8) is parallel, not a dependency: the platform must work with zero course content present, and content must land as `status: draft` until Chris launches
- GitHub issues #2-#5 are the implementation backlog this document feeds (issue #1 is the epic)

## 7. Open Questions for Chris

1. **Guests and the catalog.** Plan v3 says live courses are visible to "all users." Existing site convention is that guests see learn-hub cards but non-clickable, with a sign-in CTA. Confirm: guests see live course cards (non-clickable, sign-in CTA) and get 404/403 on pending/archived series, same as non-entitled members on gated content. If yes, this closes; if guests should see more or less, say so before kara designs.
2. **Seeding the first course row.** Who creates the `courses` row for `hermes-consultant` (status `pending`, access_model `granted`) - a seed in the migration, or Chris creates it in the admin panel after launch? Recommend: admin creates it in the panel (exercises the real path); a migration seed only if you want the row to exist before the panel does.

## 8. Handoff Note for Brainiac

All decisions are locked (Plan v3, 2026-08-25) - you are not re-opening scope. Design for: the five tables above with RLS (RLS must mirror the server-side checks; the server check is the enforcement point, RLS is defense in depth), the access seam as the single decision function every surface calls, and the admin panel as the surface kara designs. The two open questions above have recommended defaults - if Chris does not answer before design starts, build to the recommendations (guests = existing sign-in-CTA behavior; first course row created via the admin panel). The `subscriptions` table ships with the schema and read-only admin display; nothing writes to it in this build except schema. The entitlement read path is the one that must be exact - every access decision in the app funnels through `canAccessCourse`.
