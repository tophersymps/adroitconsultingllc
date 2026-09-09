# Kanban Card AC/DoD Template (Wave 1+)

> Purpose: put Acceptance Criteria and Definition of Done ON the card so every
> worker (assignee, reviewers, QA) shares the same picture of "Done" before and
> during work — the durable, board-native replacement for a pre-work meeting.
> The backlog is the *why*; this block is the *what must be true to ship*.

## Rules
- This block lives in the card `body`, after the Scope, under a `## Done when` heading.
- Every card MUST have it. `kanban create` should reject a card without it (enforce in orchestrator skill).
- ACs are **verifiable statements** (testable), not tasks ("page loads in <2s" not "make it fast").
- The assigned worker **restates these in a comment at kickoff** (see kickoff-step section) so alignment is explicit before any work.

---

## Template

```markdown
## Done when

### Acceptance Criteria (must ALL pass to be "Done")
- [ ] AC-1: <verifiable behavior, one sentence, testable>
- [ ] AC-2: <verifiable behavior>
- [ ] AC-3: <verifiable behavior>

### Definition of Done (every card, always)
- [ ] DoD-1: Code builds clean — `npm run build` exit 0, zero errors
- [ ] DoD-2: Automated tests pass (state count: N/N)
- [ ] DoD-3: No a11y regressions (WCAG AA) — dark mode + 375px mobile verified
- [ ] DoD-4: No secrets/credentials committed; no terminal junk in bodies
- [ ] DoD-5: Follows adroit-writing-standards (if content) / no em-dashes / no AI-slop
- [ ] DoD-6: Orphan processes cleaned up (dev servers killed) before kanban_complete
- [ ] DoD-7: Handoff metadata structured: `{profile, <task-type fields>, verification_evidence}`
- [ ] DoD-8: External side effects verified (URL/HTTP status/cron in default store), not just claimed

### Explicit Non-Goals (what is NOT in scope this card)
- <out-of-scope item 1>
- <out-of-scope item 2>
```

---

## Filled example (Build card)

```markdown
## Done when

### Acceptance Criteria
- [ ] AC-1: /blog listing is server-rendered on first load (curl returns full HTML, no client-only flash)
- [ ] AC-2: posts.ts (48KB) removed from the client JS bundle (check bundle report)
- [ ] AC-3: Page shows 8 posts/page (up from 4) with sort toggle + category pills intact
- [ ] AC-4: Featured post behavior preserved (unchanged from current)

### Definition of Done
- [ ] DoD-1: `npm run build` exit 0, zero errors
- [ ] DoD-2: Tests pass (N/N)
- [ ] DoD-3: No a11y regressions — dark mode + 375px mobile verified
- [ ] DoD-4: No secrets committed
- [ ] DoD-5: Orphan dev servers killed
- [ ] DoD-6: Handoff metadata: `{profile, changed_files, tests_run, tests_passed, lcp_before, lcp_after}`

### Explicit Non-Goals
- NOT touching /learn route or search (separate cards)
- NOT re-theming the listing (design unchanged)
```

---

## Kickoff step (the durable "pre-work alignment")

When a worker claims a card, BEFORE starting work:

1. `kanban_show` the task (confirm state; read the full body incl. `## Done when`).
2. Post a **kickoff comment** restating the ACs in the worker's own words:
   ```python
   kanban_comment(body=(
       "KICKOFF — understood scope. Acceptance criteria I will satisfy:\n"
       "- AC-1: <restate>\n- AC-2: <restate>\n- AC-3: <restate>\n"
       "Non-goals (will NOT touch): <restate>\n"
       "Ambiguity: <any question, or 'none'>"
   ))
   ```
3. **If any AC is ambiguous or missing** → block immediately with
   `reason="needs-clarification: <specific gap>"` — do NOT guess and start
   building against wrong ACs. This is the point where a "meeting" would happen;
   the comment thread + block IS the durable substitute.
4. Only after the kickoff comment is posted does the worker begin the work phase.

Benefits vs a real-time meeting:
- **Ordered, non-blocking** — no waiting for N bots to be "in the room" at once.
- **Durable** — the AC restatement persists on the card for reviewers and QA to check against.
- **Catch-misunderstanding-early** — a wrong reading surfaces at kickoff (cheap) not at QA (expensive).
- **Auditable** — the kickoff comment is the record of what the worker committed to.

## Relation to Bot Mode 1:1 pings
The kickoff step is **independent of Bot Mode** — it uses the existing board
comment mechanism (works headlessly, no desktop app, no profile roster needed).
Bot Mode async DMs are a separate, optional complement (see discovery notes) and
are NOT required for, nor part of, this kickoff step.
