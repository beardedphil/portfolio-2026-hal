# PM Review: 0019 - Remove redundant "Connected" label next to Connect Project Folder

## Summary

- Redundant "Connected" label next to the Connect Project Folder control is removed when a project folder is connected.
- When not connected, the kanban header is unchanged (status span still shows "Loading..." / iframe "Connected").
- Connection state remains clear via Diagnostics "Connected project:" and the project name + Disconnect in the header.

## Likelihood of success

**Score (0–100%)**: 98%

**Why:**

- Single conditional render in one file; minimal and scoped.
- No logic or persistence changes.
- Connection state still visible in Diagnostics and header.

**Risk factors:**

- None significant.

## What to verify (UI-only)

- Not connected: Connect button area unchanged, no new labels or spacing regressions.
- Connected: Redundant "Connected" label not shown; project name + Disconnect visible; Diagnostics "Connected project:" shows name.
- Disconnect still works; no layout shift or misaligned buttons.

## Potential failures (ranked)

1. **Layout shift when connecting** — Unlikely; we only hide an element when connected.
2. **User confused about connection state** — Mitigated by Diagnostics and project name in header.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability**: Ticket 0019 acceptance criteria mapped in verification.md

## Follow-ups

- None required.
