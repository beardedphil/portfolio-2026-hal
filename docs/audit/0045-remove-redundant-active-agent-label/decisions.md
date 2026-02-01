# Decisions: 0045 - Remove redundant "Active: {active_agent}" label

## Remove vs Hide

**Decision**: Remove the element entirely rather than hiding it conditionally.

**Rationale**: Ticket explicitly states "remove the label rather than hiding it conditionally" and "no new setting or feature flag." The dropdown is the single source of truth for the active agent.

## CSS Cleanup

**Decision**: Remove the `.active-agent-label` CSS block along with the element.

**Rationale**: Orphaned CSS has no effect and adds noise. Keeps stylesheet clean.
