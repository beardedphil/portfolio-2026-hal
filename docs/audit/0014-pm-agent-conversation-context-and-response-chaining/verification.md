# Verification: 0014 - PM agent: conversation context + response chaining

## UI-Only Verification Checklist

### Pre-requisites

- [ ] HAL app running (e.g. `npm run dev` from repo root)
- [ ] Kanban app running on port 5174 (if using dev script)
- [ ] Project folder connected (with valid .env)
- [ ] PM chat selected

### Minimal path: conversation history

1. [ ] Send first message to PM (e.g. "What should I work on next?").
2. [ ] **Verify**: PM responds (e.g. asks a clarifying question).
3. [ ] Send second message answering the question (e.g. "The portfolio-2026-hal project").
4. [ ] **Verify**: PM response uses your answer (e.g. refers to that project or next step); it does **not** re-ask as if it never saw the answer.
5. [ ] Open Diagnostics → expand "Outbound Request JSON".
6. [ ] **Verify**: The outbound request (or its prompt/input) clearly shows prior turns or a "Conversation so far" section (e.g. in the prompt text or in a labeled section).

### Optional: Responses API continuity

7. [ ] After at least one PM response, check Diagnostics.
8. [ ] **Verify**: "PM last response ID" shows a non-empty value (e.g. response id string), not "none (continuity not used yet)".
9. [ ] Send another message.
10. [ ] **Verify**: "previous_response_id in last request" shows "yes" (after the second request).
11. [ ] **Verify**: Outbound Request JSON for that request includes `previous_response_id` (or equivalent) when continuity is used.

### Reset on project switch

12. [ ] Click Disconnect.
13. [ ] **Verify**: "PM last response ID" is cleared (or reconnect and send again to see it reset).
14. [ ] Connect to the same or another project.
15. [ ] **Verify**: First PM request after connect does not send `previous_response_id` (Diagnostics shows "previous_response_id in last request: no" for that first request).

## Build Verification

- [x] `projects/hal-agents`: `npm run build` completes without errors.
- [ ] HAL repo: `npm run build` (if applicable) completes without errors.
- [x] No TypeScript or lint errors in modified files.

## Result

**Status**: [ ] PASS / [ ] FAIL

**Notes**:

- Verification is UI-only; no terminal or devtools required for acceptance.
- Two-turn flow (PM asks → user answers → PM uses answer) is the main human check for conversation context.
