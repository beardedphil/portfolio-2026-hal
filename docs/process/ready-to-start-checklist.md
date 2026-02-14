# Ready-to-start checklist (Definition of Ready)

A ticket is **ready to start** when it can be moved from **Unassigned** into **To Do**. The PM agent uses this checklist before moving any ticket. A human can also use it to self-check.

## Definition of Ready — Self-check (run before starting work)

**MANDATORY:** Every agent **MUST** run this explicit self-check *before* claiming a ticket is Ready or moving it into execution columns (To Do, Doing). This prevents formatting issues (missing headings, missing UI-only deliverable, non-checkbox AC, placeholders) from being caught late.

### Step-by-step self-check (all must pass)

1. **Confirm "Goal" section exists** — Verify the ticket has a section titled **"Goal"** (or **"Goal (one sentence)"**) with a non-empty, meaningful sentence. Reject if missing or contains placeholders like `<what we want to achieve>`.

2. **Confirm "Human-verifiable deliverable" section exists** — Verify the ticket has a section titled **"Human-verifiable deliverable"** (or **"Human-verifiable deliverable (UI-only)"**) with a concrete description of what a non-technical human will see or do. Reject if missing or contains placeholders like `<Describe exactly...>`.

3. **Confirm "Acceptance criteria" section exists with checkbox format** — Verify the ticket has a section titled **"Acceptance criteria"** (or **"Acceptance criteria (UI-only)"**). **CRITICAL:** Every item in this section **MUST** use the checkbox format `- [ ]` (not plain bullets `-` or numbered lists). Each item **MUST** be UI-verifiable (a human can confirm it by looking at the UI or running a manual test). Reject if:
   - Section is missing
   - Items use plain bullets (`-`) instead of checkboxes (`- [ ]`)
   - Items are not UI-verifiable (e.g., "code compiles" is not UI-verifiable; "user sees success message" is UI-verifiable)

4. **Confirm "Constraints" section exists** — Verify the ticket has a section titled **"Constraints"** with at least one bullet or line (not empty and not only placeholders). Reject if missing or empty.

5. **Confirm "Non-goals" section exists** — Verify the ticket has a section titled **"Non-goals"** with at least one bullet or line (not empty and not only placeholders). Reject if missing or empty.

6. **Confirm no unresolved placeholders** — Search the entire ticket body for unresolved template placeholders. Reject if any of the following are found:
   - Angle-bracket placeholders: `<AC 1>`, `<task-id>`, `<short title>`, `<what we want to achieve>`, `<...>`, etc.
   - Text placeholders: `TBD`, `(auto-assigned)`, `(fill in later)`, etc.
   - Any placeholder that indicates "fill this in later"

### Good example: Properly formatted Acceptance criteria

```markdown
## Acceptance criteria

- [ ] A new button labeled "Export Data" appears in the Settings page header
- [ ] Clicking the button opens a file download dialog
- [ ] The downloaded file is named "data-export.csv" and contains all user data
- [ ] A success toast message appears after download completes: "Data exported successfully"
```

**Why this is correct:**
- Uses `- [ ]` checkbox format (not plain bullets)
- Each item is UI-verifiable (human can see button, click it, see dialog, see file name, see toast)
- No placeholders or vague language

### Bad examples (reject these)

❌ **Plain bullets (wrong format):**
```markdown
## Acceptance criteria

- Button appears in Settings
- Download works
- File is correct
```

❌ **Not UI-verifiable:**
```markdown
## Acceptance criteria

- [ ] Code compiles without errors
- [ ] Function returns correct data structure
- [ ] Tests pass
```

❌ **Contains placeholders:**
```markdown
## Acceptance criteria

- [ ] <AC 1: user sees button>
- [ ] <AC 2: download works>
```

### When to run this check

- **Before starting work** on any ticket (implementation, QA, or other agents)
- **Before moving a ticket** from Unassigned to To Do or Doing
- **Before claiming a ticket is "Ready"** in any communication

If any step fails, the ticket is **NOT Ready**. Do not proceed with work until the ticket is fixed.

## Checklist (all must pass)

1. **Goal present** — The ticket has a "Goal (one sentence)" section with a non-empty, meaningful sentence (not a placeholder like `<what we want to achieve>`).

2. **Human-verifiable deliverable present** — The ticket has a "Human-verifiable deliverable (UI-only)" section with a concrete description of what a non-technical human will see or do (not a placeholder like `<Describe exactly...>`).

3. **Acceptance criteria checkboxes present** — The ticket has an "Acceptance criteria (UI-only)" section with at least one checkbox line (e.g. `- [ ] <AC 1>`). The content of each item may be a placeholder initially, but the structure must exist.

4. **Constraints + Non-goals present** — The ticket has both "Constraints" and "Non-goals" sections with at least one bullet or line each (not empty and not only placeholders).

5. **No obvious placeholders** — The ticket body does not contain unresolved template placeholders such as `<AC 1>`, `<task-id>`, `<short title>`, `<what we want to achieve>`, or similar angle-bracket placeholders that indicate "fill this in later."

## Reference

- Ticket template: `docs/templates/ticket.template.md` (includes a "Ticket template (copy/paste)" section with required headings and a filled-in example)
- PM agent: uses this checklist via the `evaluate_ticket_ready` tool before calling `kanban_move_ticket_to_todo`.
