# Decisions: Prevent PM agent from creating/updating tickets with unresolved placeholders (0066)

## Validation timing

- **Decision**: Validate for placeholders BEFORE database operations, not after
- **Rationale**: Prevents creating/updating tickets with invalid content. Better to fail fast and show clear error than to create invalid tickets and then evaluate readiness.

## Re-validation after normalization

- **Decision**: Re-validate after normalizeTitleLineInBody even though normalization shouldn't introduce placeholders
- **Rationale**: Defense in depth. Normalization only modifies the Title line, but we want to ensure no placeholders exist in the final body_md before database operations.

## Error message format

- **Decision**: Include detected placeholders list in error message and tool output
- **Rationale**: Helps user understand exactly what needs to be replaced. Makes debugging easier.

## Diagnostics UI placement

- **Decision**: Add dedicated "Ticket readiness evaluation" section in Diagnostics, separate from tool calls
- **Rationale**: Makes readiness status more prominent and easier to find. Tool calls section shows full JSON, but readiness section shows formatted, human-readable status.

## Fallback reply handling

- **Decision**: Check for placeholder validation failures before checking for successful operations in fallback reply logic
- **Rationale**: Validation failures should be shown prominently, even if model doesn't generate a reply. User needs to know why the operation was rejected.
