# PM Review: 0010 - HAL chat: hide until project attached + persist conversations

## Summary

- Chat UI now hidden until project folder connected, showing clear placeholder message
- Conversations persist to localStorage, scoped by project folder name
- Persistence errors surfaced in Diagnostics panel

## Likelihood of success

**Score (0–100%)**: 90%

**Why:**
- Implementation follows established patterns in the codebase
- localStorage API is stable and widely supported
- Conditional rendering is straightforward React
- Date serialization edge case handled explicitly
- Error states tracked and displayed

**Risk factors:**
- localStorage quota limits could cause issues with very long conversations (unlikely for normal use)
- Private browsing mode may not persist (expected behavior)

## What to verify (UI-only)

- Load HAL → see placeholder in chat region, agent selector disabled
- Connect project → chat appears, agent selector enabled
- Send 2+ messages, refresh, reconnect same project → messages restored
- Connect different project → empty conversation
- Check Diagnostics → persistence error shows "none"

## Potential failures (ranked)

1. **Messages not restored after refresh** — messages visible before refresh but empty after, likely cause: localStorage not saving or key mismatch, check Diagnostics for persistence error

2. **Chat doesn't appear after connect** — placeholder still visible after successful project connection, likely cause: connectedProject state not set correctly, check Diagnostics for connected project value

3. **Wrong conversation loaded** — messages from different project appear, likely cause: storage key collision or stale state, check that folder names are unique between test projects

4. **Timestamps show Invalid Date** — message times display wrong after restore, likely cause: Date deserialization failed, check for ISO string format in localStorage

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - None identified

## Follow-ups (optional)

- Consider adding "Clear conversation" button for current project
- Consider showing message count in diagnostics
- Add localStorage quota monitoring if conversations grow large
