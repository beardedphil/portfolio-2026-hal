# Fix for Ready-to-start Evaluator False Negatives (Ticket 0104)

## Problem
The Ready-to-start evaluator was producing false negatives - tickets with properly formatted required sections and checkboxes were incorrectly marked as not ready.

## Root Causes Identified

1. **Case-insensitive section matching**: The `sectionContent` function used case-insensitive regex matching (`'i'` flag), which could cause issues with exact heading matches.

2. **Overly strict lookahead pattern**: The regex lookahead `(?=\\n## |$)` required a space after `##` in the next heading, which could fail for headings with different spacing patterns.

3. **Inconsistent regex patterns**: The auto-fix logic used a different regex pattern that wasn't aligned with the main evaluator.

## Fixes Applied

### 1. Section Content Extraction (`sectionContent` function)

**File**: `node_modules/portfolio-2026-hal-agents/src/agents/projectManager.ts` (lines 84-97)

**Changes**:
- Removed case-insensitive flag (`'i'`) for exact case-sensitive matching
- Updated lookahead pattern from `(?=\\n## |$)` to `(?=\\n##\\s+[^\\s]|$)` to handle headings with or without space after `##`
- Added comments explaining the fix

**Before**:
```typescript
const re = new RegExp(
  `##\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
  'i'
)
```

**After**:
```typescript
const re = new RegExp(
  `##\\s+${escapedTitle}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+[^\\s]|$)`,
)
```

### 2. Auto-fix Regex Pattern

**File**: `node_modules/portfolio-2026-hal-agents/src/agents/projectManager.ts` (line ~771)

**Changes**:
- Updated auto-fix regex to match the improved pattern
- Removed case-insensitive flag for consistency

**Before**:
```typescript
const acRegex = new RegExp(
  `(##\\s+Acceptance criteria \\(UI-only\\)\\s*\\n)([\\s\\S]*?)(?=\\n## |$)`,
  'i'
)
```

**After**:
```typescript
const acRegex = new RegExp(
  `(##\\s+Acceptance criteria \\(UI-only\\)\\s*\\n)([\\s\\S]*?)(?=\\n##\\s+[^\\s]|$)`,
)
```

## Impact

These changes ensure:
1. **Exact heading matching**: Headings must match exactly (case-sensitive) as documented
2. **Flexible spacing handling**: Headings with or without space after `##` are handled correctly
3. **Deterministic evaluation**: Same input always produces the same result (no intermittent flipping)
4. **Consistent behavior**: Auto-fix logic uses the same pattern as the main evaluator

## Testing

To verify the fix:
1. Use a ticket with all required sections using exact documented format:
   - `## Goal (one sentence)`
   - `## Human-verifiable deliverable (UI-only)`
   - `## Acceptance criteria (UI-only)` with `- [ ]` checkboxes
   - `## Constraints`
   - `## Non-goals`
2. The evaluator should return `ready: true` for such tickets
3. The evaluator should consistently return the same result for the same input

## Note

The fix has been applied to the local `node_modules/portfolio-2026-hal-agents` package. For a permanent fix, these changes need to be:
1. Applied to the `portfolio-2026-hal-agents` repository
2. The package rebuilt and published
3. The HAL repository updated to use the new version

## Related Files

- `node_modules/portfolio-2026-hal-agents/src/agents/projectManager.ts` - Main evaluator implementation
- `docs/process/ready-to-start-checklist.md` - Definition of Ready checklist
- `docs/templates/ticket.template.md` - Ticket template with required sections
