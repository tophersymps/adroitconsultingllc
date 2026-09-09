# Adroit Blog — Account & Learn Round 3: Feature Requirements

**Date:** 2026-08-11
**Author:** Lois Lane (BA)
**Project:** Adroit Blog (tenant: adroit-blog)
**Version:** v1.0

## Executive Summary

Round 3 of the Adroit Blog covers six workstreams focused on account identity, the Learn experience, and site-wide design consistency. The round introduces a `user_profiles` table for per-account data (display name, username, theme preference), reorganizes the Learn hub with hierarchical course taxonomy and guest gating, adds a "Continue learning" section for in-progress courses, and includes a whole-site spacing/formatting audit. Dark mode support (auto + manual toggle) is the largest lift, touching every component and MDX content.

## Workstream 1: Site-wide Spacing/Formatting Audit

**Summary:** Audit every route for spacing/formatting inconsistencies, deliver findings + corrected design tokens, then implement the token pass site-wide.

### User Stories

**US-WS1-001** — As a **design reviewer**, I want **a documented audit of spacing/formatting inconsistencies across all routes**, so that **I have a prioritized list of what to fix before implementing changes.**
- Acceptance Criteria:
  - Given the audit covers every route (blog listing, post, learn hub, series, lesson, profile, settings, login, tags, categories), When I read the findings doc, Then I see each inconsistency cataloged with severity.
  - Given a known seed issue (BlogReadProgress container `pt-5` vs learn-card progress `mt-3 px-1`), When I check the findings, Then that mismatch is documented.

**US-WS1-002** — As a **designer**, I want **corrected spacing design tokens**, so that **the developer has a consistent vertical rhythm, card padding, and section spacing to implement.**
- Acceptance Criteria:
  - Given the audit is complete, When I review the token pass, Then I see consistent values for vertical rhythm, card padding, and section spacing.
  - Given the token pass, When I compare routes, Then spacing is uniform across all pages.

**US-WS1-003** — As a **developer**, I want **to implement the spacing token pass site-wide**, so that **all routes have consistent visual rhythm.**
- Acceptance Criteria:
  - Given the corrected tokens exist, When I apply them to all routes, Then no spacing inconsistencies remain.
  - Given the changes are deployed, When I compare previously inconsistent elements, Then they match the new token values.

## Workstream 2: Account Defaults (Avatar Menu + Settings)

**Summary:** New `user_profiles` table for display name, username, and theme preference. Avatar menu shows display name. Settings page gets real name/username forms. Dark mode with auto + manual toggle, persisted per-account.

### User Stories

**US-WS2-001** — As a **registered user**, I want **my avatar menu to show my display name instead of my email**, so that **my account feels personal and social-ready.**
- Acceptance Criteria:
  - Given I have set a display name, When I open the avatar menu, Then my display name appears in the header.
  - Given I have not set a display name, When I open the avatar menu, Then my email appears as a fallback.
  - Given I have set a display name, When I view my avatar initials, Then they derive from my display name.
  - Given I have not set a display name, When I view my avatar initials, Then they derive from my email.

**US-WS2-002** — As a **registered user**, I want **to set my display name and username in Settings**, so that **my identity is visible across the site.**
- Acceptance Criteria:
  - Given I am logged in, When I visit Settings, Then I see a form with name fields and a username field.
  - Given I submit the form, When the API succeeds, Then my display name and username are saved to `user_profiles`.
  - Given I save my profile, When I open the avatar menu, Then my updated display name appears.

**US-WS2-003** — As a **registered user**, I want **dark mode to follow my OS preference by default**, so that **the site matches my system settings without extra steps.**
- Acceptance Criteria:
  - Given I am on the site for the first time, When my OS prefers dark mode, Then the site renders in dark theme.
  - Given my OS prefers light mode, When I visit the site, Then the site renders in light theme.

**US-WS2-004** — As a **registered user**, I want **to manually override dark mode from Settings and the avatar menu**, so that **I can choose my preferred theme regardless of my OS setting.**
- Acceptance Criteria:
  - Given I am in Settings, When I toggle the theme to dark, Then the site switches to dark mode and the preference is saved to `user_profiles.theme_pref`.
  - Given I am in the avatar menu, When I click the theme toggle, Then the theme switches and persists.
  - Given I have set a manual override, When my OS preference changes, Then my manual choice is respected.
  - Given I reset to "system", When my OS preference changes, Then the site follows the new OS preference.

**US-WS2-005** — As a **developer**, I want **a `user_profiles` table with RLS policies**, so that **per-account data is stored securely and users can only access their own records.**
- Acceptance Criteria:
  - Given the migration runs, When I query `user_profiles`, Then it has columns: `user_id` (PK/FK to auth.users), `display_name`, `username`, `theme_pref`.
  - Given RLS is enabled, When a user queries the table, Then they can only see their own row.
  - Given the table exists, When a new user signs up, Then no row is created until they save profile data (lazy creation via API).

## Workstream 3: Learn Tab Reorganization + Guest Gating

**Summary:** Hierarchical course taxonomy with filter chips and subgroup section headers. Guest users see course cards but cannot click them (sign-in CTA instead). Syllabus pages stay readable. Progress bars move onto card bodies.

### User Stories

**US-WS3-001** — As a **learner**, I want **filter chips at the top of the Learn hub (All, General, Certifications)**, so that **I can quickly narrow courses by track.**
- Acceptance Criteria:
  - Given I visit the Learn hub, When I see the filter chips, Then "All" is selected by default.
  - Given I click "Certifications", When the view updates, Then only certification courses are shown.
  - Given I click "General", When the view updates, Then only general learning paths are shown.

**US-WS3-002** — As a **learner**, I want **courses grouped under subgroup section headers (e.g., "Salesforce Certifications", "OmniStudio Certifications")**, so that **related courses are visually organized.**
- Acceptance Criteria:
  - Given I view the Learn hub, When courses have subgroups, Then they appear under labeled section headers.
  - Given a series has no subgroup, When I view the hub, Then it appears under the top-level group header.

**US-WS3-003** — As a **guest user**, I want **to see course names and descriptions but not click into them**, so that **I understand what is available before signing in.**
- Acceptance Criteria:
  - Given I am not logged in, When I visit the Learn hub, Then course cards show name and description.
  - Given I am not logged in, When I try to click a course card, Then it is not clickable and shows a "Sign in to access courses" CTA.
  - Given I am not logged in, When I visit a syllabus page directly, Then I can read the full lesson content.

**US-WS3-004** — As a **logged-in user**, I want **my per-series progress bar on the course card body**, so that **I can see how far I am without opening the series.**
- Acceptance Criteria:
  - Given I am logged in, When I view the Learn hub, Then each course card shows my progress for that series.
  - Given I have completed lessons, When I view the card, Then the progress bar reflects my completion count.

**US-WS3-005** — As a **content editor**, I want **to add an optional `subgroup` field to series.json**, so that **courses can be organized under sub-categories without a DB migration.**
- Acceptance Criteria:
  - Given I add `subgroup` to a series.json file, When I run `npm run prebuild`, Then the generated `learn.ts` includes the subgroup.
  - Given a series has no subgroup, When I build, Then it renders without error under its top-level group.

## Workstream 4: Continue Learning

**Summary:** New section at the top of the Learn hub showing in-progress courses (>=1 lesson completed, < total). Sorted by most recent activity. Resume link. Data from existing `lesson_completion` and `read_progress` tables.

### User Stories

**US-WS4-001** — As a **logged-in user**, I want **a "Continue learning" section at the top of the Learn hub**, so that **I can quickly pick up where I left off.**
- Acceptance Criteria:
  - Given I have in-progress courses, When I visit the Learn hub, Then a "Continue learning" section appears above the filter chips.
  - Given I have no in-progress courses, When I visit the Learn hub, Then the section is hidden (empty state).

**US-WS4-002** — As a **logged-in user**, I want **courses sorted by most recent activity**, so that **the course I was working on last appears first.**
- Acceptance Criteria:
  - Given I have multiple in-progress courses, When I view the section, Then they are ordered by most recent lesson completion or read progress.

**US-WS4-003** — As a **logged-in user**, I want **a resume link on each in-progress course**, so that **I can continue from my last lesson.**
- Acceptance Criteria:
  - Given a course is in progress, When I click resume, Then I navigate to the next uncompleted lesson.
  - Given I have completed all lessons in a series, When I view the section, Then that series does not appear (it is fully complete).

## Workstream 5: Profile Identity + Certificates

**Summary:** Profile page shows name fields + username/display-name field. New "My certificates" section surfaces earned certificates.

### User Stories

**US-WS5-001** — As a **registered user**, I want **to see and edit my name and username on the Profile page**, so that **my identity is visible and editable in one place.**
- Acceptance Criteria:
  - Given I am logged in, When I visit Profile, Then I see my display name, username, and email.
  - Given I update my name fields, When I save, Then the changes persist and reflect in the avatar menu.

**US-WS5-002** — As a **registered user**, I want **a "My certificates" section on my Profile**, so that **I can see all certificates I have earned.**
- Acceptance Criteria:
  - Given I have earned certificates, When I visit Profile, Then the certificates section lists them.
  - Given I have no certificates, When I visit Profile, Then the certificates section shows an empty state.
  - Given I complete an exam and become eligible, When I visit Profile, Then the new certificate appears.

## Workstream 6: Settings Cleanup

**Summary:** Keep "Email updates" as a COMING SOON teaser. No functional change.

### User Stories

**US-WS6-001** — As a **registered user**, I want **the "Email updates" teaser to remain in Settings**, so that **I am reminded this feature is planned.**
- Acceptance Criteria:
  - Given I visit Settings, When I see "Email updates", Then it shows a COMING SOON badge and a non-functional toggle.
  - Given I interact with the toggle, When it is non-functional, Then no action occurs and the badge remains visible.

## Data Entities

| Entity | Type | Fields | Source |
|--------|------|--------|--------|
| `user_profiles` | New Supabase table | `user_id` (uuid, PK/FK), `display_name` (text), `username` (text), `theme_pref` (text, default 'system') | WS-2 migration |
| `LearningSeries.subgroup` | New optional field | `subgroup?: string` | WS-3 content metadata |
| `read_progress` | Existing table | `user_id`, `content_type`, `content_slug`, `read_at` | WS-4 data source |
| `lesson_completion` | Existing table | `user_id`, `lesson_slug`, `completed_at` | WS-4 data source |

## Integrations

| Integration | Description | Workstream |
|-------------|-------------|------------|
| Supabase Auth | HttpOnly cookie session check for all new API endpoints | WS-2, WS-5 |
| Supabase DB | New `user_profiles` table + RLS policies | WS-2 |
| Existing progress APIs | `/api/progress/*` endpoints for continue learning data | WS-4 |
| Content build script | `scripts/build-learn.js` regenerates `src/data/learn.ts` with subgroup field | WS-3 |

## Content Needs

| Item | Description | Owner |
|------|-------------|-------|
| `subgroup` values | Populate subgroup for existing series in `series.json` files | Content team / Chris |
| Avatar menu copy | "Sign in to access courses" CTA text for guest users | Copy review |
| Empty state copy | Continue learning empty state message | Copy review |

## Scope Boundaries

**In scope:**
- Whole-site spacing audit and token pass (WS-1)
- user_profiles table + profile API + display name/avatar (WS-2)
- Dark mode: auto + manual toggle, persisted per-account (WS-2)
- Learn hub: taxonomy filters, subgroup headers, guest gating, progress on cards (WS-3)
- Continue learning section (WS-4)
- Profile identity fields + My certificates section (WS-5)
- Settings: keep Email updates teaser (WS-6)

**Out of scope:**
- Email updates subscription functionality
- Password reset / change-password API
- Community/social features
- New course content

## Open Questions

1. **Username uniqueness:** Should usernames be unique across users? If so, what is the error message when a username is taken?
2. **Certificate display format:** What should earned certificates look like in the "My certificates" section? (badge, downloadable PDF, shareable link?)
3. **Continue learning data source:** Should "most recent activity" use `lesson_completion.completed_at`, `read_progress.read_at`, or a combination?
4. **Dark mode transition:** Should theme changes animate (crossfade) or switch instantly?
5. **Guest card CTA behavior:** When a guest clicks a non-clickable card, should it navigate to `/login?next=/learn/<series>` or open a sign-in modal?

## Handoff Note

This requirements document is ready for architectural design. Hand off to **Brainiac** (web/architect) for implementation planning, API contracts, and component design. The shared conventions document (`requirements/shared-conventions.md`) should be read alongside this file.
