# PM Review Template (Likelihood of Success + Failure Modes)

Create `docs/audit/<task-id>-<short-title>/pm-review.md` after an implementation agent completes.

## Summary (1–3 bullets)

- <what changed>

## Likelihood of success

**Score (0–100%)**: <number>%

**Why (bullets):**
- <reason 1>
- <reason 2>

## What to verify (UI-only)

- <critical path click/see>
- <edge case click/see>

## Testing scenarios used (when applicable)

**Note:** If this PM review includes verification of acceptance criteria, include a "Testing scenarios used" section with at least 1 happy-path scenario and at least 2 edge/negative scenarios. Each scenario must reference specific UI state/inputs used. See `.cursor/rules/testing-scenarios-requirement.mdc` for full requirements.

- **Happy path:** <scenario description>
  - **Steps:** <specific UI actions/inputs>
  - **Expected:** <concrete outcome>
  - **Result:** PASS/FAIL

- **Edge case 1:** <scenario description>
  - **Steps:** <specific UI actions/inputs>
  - **Expected:** <concrete outcome>
  - **Result:** PASS/FAIL

- **Edge case 2:** <scenario description>
  - **Steps:** <specific UI actions/inputs>
  - **Expected:** <concrete outcome>
  - **Result:** PASS/FAIL

## Potential failures (ranked)

1. **<failure>** — <what you’d see in the UI>, <likely cause>, <how to confirm using in-app diagnostics>
2. **<...>** — <...>
3. **<...>** — <...>

## Testing scenarios used (when applicable)

If this PM review verifies acceptance criteria, include a "Testing scenarios used" section with:
- At least 1 happy-path scenario (concrete, references UI state/inputs)
- At least 2 edge/negative scenarios relevant to the ticket (concrete, references UI state/inputs)
- Each scenario is 1–3 bullets and references the UI state/inputs used (no vague "tested it works")
- See `.cursor/rules/testing-scenarios-requirement.mdc` for full requirements and examples

## Audit completeness check

- **Artifacts present**: prompt / plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - <missing detail or unclear step>

## Follow-ups (optional)

- <next tiny task>
