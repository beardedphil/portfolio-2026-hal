# Plan for ticket 0104

## Approach

Fix false negatives in the Ready-to-start evaluator by improving the section matching regex patterns and ensuring deterministic evaluation.

## File touchpoints

1. **`node_modules/portfolio-2026-hal-agents/src/agents/projectManager.ts`**
   - Fix `sectionContent` function: remove case-insensitive flag, improve lookahead pattern
   - Update auto-fix regex to match improved pattern
   - Ensure deterministic evaluation (same input = same output)

2. **Documentation**
   - Create fix documentation explaining the changes
   - Note that permanent fix requires updating the hal-agents repository

## Changes needed

1. **Section content extraction** (`sectionContent` function):
   - Remove case-insensitive flag for exact matching
   - Update lookahead from `(?=\\n## |$)` to `(?=\\n##\\s+[^\\s]|$)` to handle headings with flexible spacing

2. **Auto-fix regex consistency**:
   - Update auto-fix regex to use the same improved pattern
   - Remove case-insensitive flag for consistency

3. **Testing**:
   - Verify tickets with exact documented format evaluate as ready
   - Ensure deterministic behavior (no intermittent flipping)
