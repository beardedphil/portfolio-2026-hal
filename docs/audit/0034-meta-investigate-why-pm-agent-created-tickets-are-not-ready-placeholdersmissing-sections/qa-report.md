# QA Report: 0034 - Meta: Investigate why PM agent-created tickets are not "ready" (placeholders/missing sections)

## 1. Ticket & deliverable

- **Goal:** Identify and fix the root cause that leads to newly created tickets containing unresolved placeholders and/or missing required sections, so new tickets are immediately "Ready-to-start" per the Definition of Ready.
- **Human-verifiable deliverable:** In HAL, a PM can ask the agent to "create a ticket …", and the resulting ticket (1) appears in the embedded Kanban UI, and (2) passes the in-app "Unassigned check / ready-to-start" validation with no placeholder warnings.
- **Acceptance criteria (from ticket):**
  - Creating a new ticket via chat results in a ticket that contains a non-placeholder Goal, Deliverable, Constraints, and Non-goals sections.
  - The created ticket contains Acceptance Criteria checkboxes (`- [ ] ...`).
  - The created ticket contains **no** unresolved template placeholders (e.g. task-id, short-title, or other angle-bracket tokens).
  - The PM "Unassigned check" (or equivalent in-app readiness validation) does **not** report the newly created ticket as "Not ready" for missing sections/placeholders.
  - If ticket creation fails to populate required fields, the UI shows an in-app diagnostic explaining what was missing and why (no console required).

## 2. Audit artifacts

All required artifacts are present in `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/`:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`

## 3. Code review — PASS

Implementation matches the ticket and `changed-files.md`:

| Requirement | Implementation |
|-------------|----------------|
| Template in context for create_ticket | `buildContextPack` adds "Ticket template (required structure for create_ticket)" section; reads `docs/templates/ticket.template.md` from repo root and injects full content plus instruction to replace every angle-bracket placeholder (projectManager.ts 349–358). |
| Non-placeholder Goal, Deliverable, Constraints, Non-goals | Template and Ready-to-start checklist are in context; create_ticket tool description and `body_md` parameter require "all required sections filled with concrete content" and "No angle-bracket placeholders"; model is instructed to replace placeholders so ticket passes checklist. |
| Acceptance criteria checkboxes | Template shows `- [ ]` structure; tool requires "Acceptance criteria (UI-only) with - [ ] lines"; `evaluateTicketReady` checks `-\s*\[\s*\]` in AC section (projectManager.ts 74). |
| No unresolved placeholders | Tool description and body_md require "no &lt;placeholders&gt; left"; `evaluateTicketReady` uses `PLACEHOLDER_RE` on full body and reports in `missingItems` (projectManager.ts 44–45, 76–78, 85). |
| Unassigned check alignment | Same `evaluateTicketReady` used by create_ticket post-insert and by `checkUnassignedTickets`; no code change to Unassigned check—creation flow now supplies template so model output matches checklist. |
| In-app diagnostic when not ready | After successful insert, create_ticket output includes `ready` and `missingItems` (projectManager.ts 386–401). Tool output is shown in Diagnostics > Tool Calls. Fallback reply when model returns no text appends "The ticket is not yet ready for To Do: …" with missingItems (projectManager.ts 519–524). No console required. |

Constraints verified:

- Uses `docs/templates/ticket.template.md` as single source of truth; context pack now includes it so the model sees exact structure.
- Aligns with `docs/process/ready-to-start-checklist.md` and `evaluateTicketReady`; no changes to template or checklist files.
- Verification is UI-only; in-app diagnostics (Tool Calls output + chat fallback reply) show what is missing.
- No unrelated ticket template changes; template and checklist unchanged.

## 4. Build

- Repo root: `npm run build` — **Pass** (tsc -b + vite build).
- hal-agents: `npm run build` in `projects/hal-agents` — **Pass** (tsc -p tsconfig.build.json).

## 5. UI verification — Manual

End-to-end verification requires: project folder connected (Supabase), HAL + Kanban running, hal-agents built. Manual steps are in `verification.md`:

1. **Create ticket via chat:** Ask the PM agent to create a ticket (e.g. "Create a ticket: Add a footer to the Kanban board with the repo name").
2. **Ticket in Kanban:** Confirm the new ticket appears under Unassigned (sync may run automatically or after refresh).
3. **Ticket body ready:** Open the ticket; verify Goal, Deliverable, Acceptance criteria (with `- [ ]`), Constraints, and Non-goals are filled with concrete content and no angle-bracket placeholders.
4. **Unassigned check:** After sync, the Unassigned check should not list the new ticket as "Not ready"; it may move to To Do or report all ready.
5. **Diagnostic when not ready:** If the model leaves placeholders, Diagnostics > Tool Calls > create_ticket Output should show `ready: false` and `missingItems`; the chat reply (or fallback) should mention what is missing.

Screenshots (per verification.md): `verification-created-ticket-details.png`, `verification-readiness-check-passing.png` — to be added to the audit folder when manual run is performed.

## 6. Verdict

- **Implementation:** Complete and matches the ticket and plan. Template injection in context pack, stronger create_ticket description and body_md requirements, post-create readiness evaluation with `ready` and `missingItems` in tool output, and fallback reply with in-app diagnostic are all implemented as specified.
- **Merge:** OK to merge after **manual UI verification** per `verification.md` is run (create a ticket via chat, confirm body sections and no placeholders, confirm Unassigned check passes or diagnostic appears in Tool Calls and chat when not ready).
