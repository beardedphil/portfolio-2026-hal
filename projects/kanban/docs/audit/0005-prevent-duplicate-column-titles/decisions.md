# Decisions (0005-prevent-duplicate-column-titles)

## Normalization for comparison
- **Decision:** `normalizeTitle(title) = title.trim().toLowerCase()`.
- **Reason:** Ticket implementation notes; case-insensitive and trimmed comparison so "Todo", "todo", "  todo  " are treated as duplicates.

## Keep form open on block
- **Decision:** When creation is blocked (duplicate), do not close the add-column form; keep the input value so the user can edit.
- **Reason:** Ticket: "If blocked, do not close the form; keep the input so the user can edit."

## Inline error message text
- **Decision:** Show "Column title must be unique." as the inline message.
- **Reason:** Ticket acceptance criteria: "inline message like **Column title must be unique.**"

## Action Log format for blocked attempt
- **Decision:** `Column add blocked (duplicate): "normalized"` (e.g. "todo").
- **Reason:** Ticket: "The Action Log records a clear entry for blocked attempts (e.g., `Column add blocked (duplicate): \"todo\"`)."

## Error state cleared on input change
- **Decision:** Clear `addColumnError` when the user types in the column name input, when opening the form, and when cancelling.
- **Reason:** Avoid stale error after user corrects the title; clean state on open/cancel.
