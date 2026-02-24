# Ticket Template

Use this structure when creating tickets. Replace placeholders with concrete content.

## Ticket
- **ID**: (assigned by tool)
- **Title**: (short title)
- **Goal (one sentence)**: <what we want to achieve>
- **Human-verifiable deliverable (UI-only)**: <what a human will see/click>
- **Acceptance criteria (UI-only)**: - [ ] <AC 1> etc.
- **Constraints**: Keep task small; verification UI-only (no console).
- **Non-goals**: <out of scope>

## Scope Lock / Out-of-Scope

**MANDATORY:** This section must explicitly document which product flows are affected by this ticket and which flows are explicitly excluded.

### Product Flows Changed

List all product flows that are being modified or implemented in this ticket:

- [ ] **Context Bundle generation** — <describe what changes>
- [ ] **RED (Requirement Expansion Document) generation** — <describe what changes>
- [ ] **Integration Manifest** — <describe what changes>
- [ ] **Artifact distillation** — <describe what changes>
- [ ] **Instructions retrieval** — <describe what changes>
- [ ] **Other flows** — <specify any other product flows affected>

### Product Flows Not Implemented (Missing Infrastructure)

If any product flows are explicitly not implemented due to missing infrastructure, dependencies, or blockers, list them here with escalation notes:

- [ ] **<Flow name>** — Not implemented because: <reason>. **Escalation:** <note to PM/QA about what infrastructure is needed>

**Example:**
- [ ] **Context Bundle generation** — Not implemented because: Supabase context_bundles table migration not yet applied. **Escalation:** PM/QA: This ticket requires migration `20260222000000_create_context_bundles.sql` to be applied before Context Bundle generation can be implemented.

### Escalation Note to PM/QA

**MANDATORY:** If any flows are listed as "Not Implemented", include a clear escalation note:

**Escalation:** <Brief note to PM/QA about missing infrastructure, dependencies, or blockers that prevent full implementation. Include specific migration files, API endpoints, or other infrastructure requirements.>

Required: Goal, deliverable, AC with checkboxes, Constraints, Non-goals, Scope Lock / Out-of-Scope. No angle-bracket placeholders in final ticket.
