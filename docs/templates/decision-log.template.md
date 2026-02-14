# Decision Log Template

Create `docs/audit/<task-id>-<short-title>/decisions.md` to document key implementation decisions, including alternatives considered and trade-offs, so reviewers can understand "why" not just "what".

**Copy/paste this template for each decision entry.** Include at least one decision entry per ticket.

---

## Decision Entry Template

### Context

Briefly describe the situation or problem that required a decision. What question were you trying to answer?

### Decision

State the decision that was made. Be specific and concrete.

### Alternatives Considered

List the alternative approaches that were evaluated:
- Alternative 1: Brief description
- Alternative 2: Brief description
- (Add more as needed)

### Trade-offs

Explain the trade-offs between the chosen approach and the alternatives:
- What benefits does the chosen approach provide?
- What limitations or costs does it have?
- Why were the alternatives not chosen?

### Consequences / Follow-ups

Describe expected consequences of this decision:
- What impact will this have on the codebase or user experience?
- Are there any follow-up tasks or considerations?
- Any risks or areas that need monitoring?

### Links

Reference related items:
- **Tickets**: Link to related tickets (e.g., `HAL-0123`)
- **PRs**: Link to pull requests if applicable
- **Files**: Reference key files affected (e.g., `src/components/Button.tsx:42-61`)
- **Other**: Any other relevant links or references

---

## Example Decision Entry

### Context

We need to persist user preferences for the dark mode toggle. The preference must survive page refreshes and be accessible across the application.

### Decision

Store the theme preference in `localStorage` with key `"theme-preference"` and read it on app initialization in `src/App.tsx:45-52`.

### Alternatives Considered

- **localStorage**: Simple, persistent, works across tabs, no server dependency
- **sessionStorage**: Would reset on tab close, not suitable for user preference
- **Supabase user preferences table**: Overkill for a simple boolean, requires auth, adds latency
- **URL query parameter**: Not persistent, clutters URLs, poor UX

### Trade-offs

**Chosen approach (localStorage):**
- ✅ Simple implementation, no server round-trip
- ✅ Persists across sessions automatically
- ✅ Works offline
- ❌ Limited to ~5-10MB storage per domain
- ❌ Not shared across devices (would need server sync for that)

**Why not alternatives:**
- sessionStorage: User preference should persist across sessions
- Supabase: Adds unnecessary complexity and latency for a simple boolean
- URL parameter: Poor UX, not persistent

### Consequences / Follow-ups

- Theme preference will persist locally but won't sync across devices (acceptable for MVP)
- If we add user accounts later, we may need to migrate localStorage preference to Supabase user preferences table
- No migration needed for existing users (localStorage is empty initially)

### Links

- **Tickets**: HAL-0042 (dark mode implementation)
- **Files**: `src/App.tsx:45-52` — theme initialization, `src/hooks/useTheme.ts:12-18` — localStorage read/write
- **PRs**: #123 (dark mode feature)

---

## Multiple Decisions

If your ticket involves multiple significant decisions, create a separate decision entry for each one using the template above. Number them or give them descriptive headings:

```markdown
# Decisions for ticket <task-id>

## Decision 1: Theme Storage Approach

[Use template above]

## Decision 2: Component Architecture

[Use template above]
```
