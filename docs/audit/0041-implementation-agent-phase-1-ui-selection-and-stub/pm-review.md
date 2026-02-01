# PM Review (0041-implementation-agent-phase-1-ui-selection-and-stub)

## Summary (1–3 bullets)

- Implementation Agent appears in the agent dropdown with a clean label; selecting it updates the visible active agent indicator.
- When Implementation Agent is selected, an on-screen banner explains it is a stub and not wired to the Cursor API, with a hint that it will be enabled in a later ticket.
- Sending a message to Implementation Agent returns a deterministic stub response aligned with the banner.

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Scope is small and UI-only; no API integration or external dependencies.
- Reuses the existing dropdown and per-agent transcript mechanism.
- Stub response and banner text are deterministic for simple verification.

## What to verify (UI-only)

- Dropdown includes "Implementation Agent"; selection changes active agent indicator and transcript.
- Banner appears when Implementation Agent is selected; no console/devtools needed.
- Message when sending to Implementation Agent matches the stub description in the banner.

## Potential failures (ranked)

1. **Banner not visible** — could be a conditional rendering bug; verify `selectedChatTarget === 'implementation-agent'`.
2. **Active indicator doesn't update** — ensure `CHAT_OPTIONS.find()` resolves correctly.
3. **Stub response differs from banner** — minor inconsistency; both should mention Cursor API and "later ticket".

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
