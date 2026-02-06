# Decisions: 0095-implementation

## Auto-fix strategy

**Decision**: Auto-fix only formatting issues that can be reliably corrected (e.g., converting bullets to checkboxes in Acceptance criteria). Do not attempt to generate missing content.

**Rationale**: Formatting issues (like missing checkboxes) can be fixed automatically without changing the ticket's meaning. Missing content (like empty Goal section) requires human judgment and cannot be auto-generated.

**Trade-off**: Some tickets will still require manual fixes if they have missing content, but formatting issues will be resolved automatically.

## Prepare top ticket workflow

**Decision**: When PM agent receives "prepare ticket" request, it should automatically move the ticket to To Do once it becomes ready (after fixes if needed).

**Rationale**: The acceptance criteria require that "Prepare top ticket" results in the ticket being moved to To Do when ready. This ensures a smooth workflow without requiring additional manual steps.

## Error message clarity

**Decision**: All error messages must explicitly state what failed and what the user can do next.

**Rationale**: Users need clear guidance when auto-fix fails or tickets cannot be made ready. Vague errors lead to confusion and manual debugging.

## Unrequested changes (required)

None.
