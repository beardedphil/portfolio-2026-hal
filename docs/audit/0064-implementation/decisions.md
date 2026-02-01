# Decisions: QA completion message format requirement (0064)

## Format choice

- **Chosen format:** `QA RESULT: <PASS|FAIL> — <ticket-id>`
- **Rationale:**
  - Uses literal words "PASS" and "FAIL" (not abbreviations or symbols) for clarity
  - Includes em dash separator for visual distinction
  - Ticket ID uses 4-digit format (e.g., `0056`) matching existing conventions
  - Prefix "QA RESULT:" makes it easy to spot in chat transcripts
  - Human-verifiable without external tooling (can read directly from chat)

## Placement

- **Decision:** Require format in final summary message after all workflow steps complete
- **Rationale:** Ensures the outcome is visible at the end of the QA conversation, not buried in intermediate steps

## Integration points

- **Decision:** Updated all three workflow paths (feature branch, main branch, FAIL verdict) to reference the format
- **Rationale:** Ensures consistency regardless of which workflow path the QA agent follows

## No unrequested changes

All changes are directly required by the ticket acceptance criteria.
