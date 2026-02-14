# PM Review Template (Likelihood of Success + Failure Modes)

Create `docs/audit/<task-id>-<short-title>/pm-review.md` after an implementation agent completes.

## Summary (1–3 bullets)

- <what changed>

## Key Decisions (2–6 bullets)

- <decision 1: why approach A over B, tradeoffs, risks>
- <decision 2: design choice affecting maintainability>
- <decision 3: performance/scalability consideration>
- <decision 4: integration decision>
- <decision 5–6: additional important decisions>

## Likelihood of success

**Score (0–100%)**: <number>%

**Why (bullets):**
- <reason 1>
- <reason 2>

## What to verify (UI-only)

- <critical path click/see>
- <edge case click/see>

## Potential failures (ranked)

1. **<failure>** — <what you’d see in the UI>, <likely cause>, <how to confirm using in-app diagnostics>
2. **<...>** — <...>
3. **<...>** — <...>

## Audit completeness check

- **Artifacts present**: prompt / plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - <missing detail or unclear step>

## Follow-ups (optional)

- <next tiny task>
