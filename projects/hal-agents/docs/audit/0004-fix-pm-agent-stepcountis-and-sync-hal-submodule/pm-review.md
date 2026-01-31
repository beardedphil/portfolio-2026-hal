# PM Review (0004-fix-pm-agent-stepcountis-and-sync-hal-submodule)

## Summary

- Removed `stepCountIs` import from `ai` and replaced `stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)` with `maxSteps: MAX_TOOL_ITERATIONS` in `src/agents/projectManager.ts`.
- Tool loop limit remains 10 steps; implementation is compatible with the installed `ai` package (^4.3.0).
- HAL's `projects/hal-agents` submodule must be updated to the fix commit so HAL runs the real PM agent without import errors.

## Likelihood of success

**Score (0–100%)**: 90%

**Why:**
- Single, targeted change; no new dependencies.
- `maxSteps` is the supported API for this SDK version.
- Once submodule is updated, HAL will load the same fixed code.

## What to verify (UI-only)

- In HAL: select Project Manager, send `ping` → real PM response (no stub), Diagnostics show outbound request JSON.
- No dev server log error about `stepCountIs` or `ai` export.

## Potential failures (ranked)

1. **Submodule not updated** — HAL still shows stub or stepCountIs error. Fix: update `projects/hal-agents` to the fix commit and restart dev.
2. **maxSteps not in SDK** — If the installed minor/patch of `ai` does not support `maxSteps`, runtime could throw. Mitigation: ticket was written for this fix; if needed, align `ai` version or use manual loop.
3. **OpenAI key / model** — Same as before; missing key yields errorPhase: 'openai'.

## Audit completeness check

- **Artifacts present**: plan, worklog, changed-files, decisions, verification, pm-review
- **Traceability**: Ticket 0004 acceptance criteria addressed by code change and submodule sync step.

## Follow-ups (optional)

- After merging to portfolio-2026-hal-agents/main and pushing, update HAL's `projects/hal-agents` submodule to that commit and push HAL main (or follow HAL's submodule update process).
