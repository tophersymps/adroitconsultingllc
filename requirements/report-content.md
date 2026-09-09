# Adroit Blog — Account & Learn Round 3: Feature Requirements

**Date:** August 11, 2026
**Author:** Lois Lane, Business Analyst
**Project:** Adroit Blog
**Version:** v1.0

## Executive Summary

Round 3 of the Adroit Blog covers six workstreams focused on account identity, the Learn experience, and site-wide design consistency. The round introduces a `user_profiles` table for per-account data (display name, username, theme preference), reorganizes the Learn hub with hierarchical course taxonomy and guest gating, adds a "Continue learning" section for in-progress courses, and includes a whole-site spacing/formatting audit. Dark mode support (auto + manual toggle) is the largest lift, touching every component and MDX content.

## User Stories

### WS-1: Site-wide Spacing/Formatting Audit

| ID | As a | I want | So that | Acceptance Criteria |
|----|------|--------|---------|-------------------|
| US-WS1-001 | design reviewer | a documented audit of spacing/formatting inconsistencies across all routes | I have a prioritized list of what to fix | Given every route is audited, When I read findings, Then each inconsistency is cataloged with severity |
| US-WS1-002 | designer | corrected spacing design tokens | the developer has consistent vertical rhythm to implement | Given the audit is complete, When I review tokens, Then values for rhythm, padding, and spacing are consistent |
| US-WS1-003 | developer | to implement the spacing token pass site-wide | all routes have consistent visual rhythm | Given corrected tokens exist, When applied, Then no inconsistencies remain |

### WS-2: Account Defaults (Avatar Menu + Settings)

| ID | As a | I want | So that | Acceptance Criteria |
|----|------|--------|---------|-------------------|
| US-WS2-001 | registered user | my avatar menu to show my display name instead of email | my account feels personal | Given I have a display name, When I open avatar menu, Then it shows my name (email as fallback) |
| US-WS2-002 | registered user | to set my display name and username in Settings | my identity is visible across the site | Given I submit the form, When the API succeeds, Then name/username are saved to user_profiles |
| US-WS2-003 | registered user | dark mode to follow my OS preference by default | the site matches my system settings | Given my OS prefers dark, When I visit, Then the site renders in dark theme |
| US-WS2-004 | registered user | to manually override dark mode from Settings and the avatar menu | I can choose my preferred theme regardless of OS | Given I toggle theme, When saved, Then the preference persists in user_profiles.theme_pref |
| US-WS2-005 | developer | a user_profiles table with RLS policies | per-account data is stored securely | Given the migration runs, When I query, Then the table has user_id, display_name, username, theme_pref with RLS |

### WS-3: Learn Tab Reorganization + Guest Gating

| ID | As a | I want | So that | Acceptance Criteria |
|----|------|--------|---------|-------------------|
| US-WS3-001 | learner | filter chips at the top of the Learn hub (All, General, Certifications) | I can quickly narrow courses by track | Given I click a filter, When the view updates, Then only matching courses show |
| US-WS3-002 | learner | courses grouped under subgroup section headers | related courses are visually organized | Given courses have subgroups, When I view the hub, Then they appear under labeled headers |
| US-WS3-003 | guest user | to see course names and descriptions but not click into them | I understand what is available before signing in | Given I am logged out, When I try to click a card, Then it shows a sign-in CTA |
| US-WS3-004 | logged-in user | my per-series progress bar on the course card body | I can see progress without opening the series | Given I am logged in, When I view the hub, Then each card shows my progress |
| US-WS3-005 | content editor | to add an optional subgroup field to series.json | courses can be organized under sub-categories without a DB migration | Given I add subgroup, When I build, Then learn.ts includes it |

### WS-4: Continue Learning

| ID | As a | I want | So that | Acceptance Criteria |
|----|------|--------|---------|-------------------|
| US-WS4-001 | logged-in user | a "Continue learning" section at the top of the Learn hub | I can quickly pick up where I left off | Given I have in-progress courses, When I visit, Then the section appears above filters |
| US-WS4-002 | logged-in user | courses sorted by most recent activity | the course I was working on last appears first | Given multiple in-progress courses, When I view, Then they are ordered by recency |
| US-WS4-003 | logged-in user | a resume link on each in-progress course | I can continue from my last lesson | Given I click resume, When navigated, Then I land on the next uncompleted lesson |

### WS-5: Profile Identity + Certificates

| ID | As a | I want | So that | Acceptance Criteria |
|----|------|--------|---------|-------------------|
| US-WS5-001 | registered user | to see and edit my name and username on the Profile page | my identity is visible and editable | Given I update fields, When I save, Then changes persist and reflect in avatar menu |
| US-WS5-002 | registered user | a "My certificates" section on my Profile | I can see all certificates I have earned | Given I have certificates, When I visit Profile, Then they are listed |

### WS-6: Settings Cleanup

| ID | As a | I want | So that | Acceptance Criteria |
|----|------|--------|---------|-------------------|
| US-WS6-001 | registered user | the "Email updates" teaser to remain in Settings | I am reminded this feature is planned | Given I visit Settings, When I see Email updates, Then it shows COMING SOON with a non-functional toggle |

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

1. **Username uniqueness:** Should usernames be unique across users? What is the error message when taken?
2. **Certificate display format:** What should earned certificates look like in "My certificates"? (badge, PDF, shareable link?)
3. **Continue learning data source:** Should "most recent activity" use lesson_completion.completed_at, read_progress.read_at, or both?
4. **Dark mode transition:** Should theme changes animate (crossfade) or switch instantly?
5. **Guest card CTA behavior:** When a guest clicks a non-clickable card, should it navigate to /login?next=/learn/<series> or open a sign-in modal?

## Handoff Note

This requirements document is ready for architectural design. Hand off to **Brainiac** (web/architect) for implementation planning, API contracts, and component design. The shared conventions document (`requirements/shared-conventions.md`) should be read alongside this file.
