# Decisions for ticket 0104

## Case-sensitive section matching

**Decision**: Removed case-insensitive flag from `sectionContent` regex to ensure exact heading matches.

**Why**: The ticket format specifies exact section titles (e.g., "Goal (one sentence)"). Case-insensitive matching could cause false matches or miss exact matches. Case-sensitive matching ensures headings must match exactly as documented.

## Improved lookahead pattern

**Decision**: Changed lookahead from `(?=\\n## |$)` to `(?=\\n##\\s+[^\\s]|$)`.

**Why**: The original pattern required a space after `##` in the next heading, which could fail for headings with different spacing. The new pattern matches `##` followed by whitespace and then a non-whitespace character (heading text), making it more flexible while still correctly identifying the next section.

## Consistent regex patterns

**Decision**: Updated auto-fix regex to use the same improved pattern as the main evaluator.

**Why**: Ensures consistent behavior between the main evaluator and auto-fix logic. Both now use the same pattern for section matching, preventing discrepancies.

## Fix location

**Decision**: Applied fix to local `node_modules/portfolio-2026-hal-agents` package and documented that permanent fix requires updating the hal-agents repository.

**Why**: The evaluator code is in a separate GitHub package. The fix works locally but needs to be applied to the source repository for permanence. Documentation ensures the fix can be properly applied.

## Unrequested changes (required)

None - all changes are directly related to fixing false negatives in the evaluator as specified in the ticket.
