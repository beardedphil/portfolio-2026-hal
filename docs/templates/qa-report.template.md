# QA Report Template

**MANDATORY:** QA agents **must** use this template when publishing QA artifacts via `/api/artifacts/insert-qa`. Copy this template and fill in all sections with actual verification results.

**Title format:** `QA report for ticket <ticket-id>`

---

## Verdict

**Status:** `PASS` or `FAIL`

**Summary:** One-line summary of the QA outcome (e.g., "All acceptance criteria met, implementation ready for merge" or "AC3 failed: feature X does not work as expected").

---

## Ticket & Deliverable

**Ticket ID:** `<ticket-id>`  
**Repo:** `<repo-name>`

**Goal:** `<one-sentence goal from ticket>`

**Human-verifiable deliverable:** `<deliverable description from ticket>`

**Acceptance criteria from ticket:**
- [ ] AC1: `<acceptance criterion 1>`
- [ ] AC2: `<acceptance criterion 2>`
- [ ] AC3: `<acceptance criterion 3>`
- [ ] ... (list all ACs from ticket)

---

## Acceptance Criteria Verification

**MANDATORY:** For each acceptance criterion from the ticket, provide explicit verification with evidence.

| AC | Criterion | Status | Evidence | Notes |
|----|-----------|--------|----------|-------|
| AC1 | `<criterion description>` | ✅ PASS / ❌ FAIL | `<what was observed/verified>` | `<any additional context>` |
| AC2 | `<criterion description>` | ✅ PASS / ❌ FAIL | `<what was observed/verified>` | `<any additional context>` |
| AC3 | `<criterion description>` | ✅ PASS / ❌ FAIL | `<what was observed/verified>` | `<any additional context>` |

**For PASS reports:** Each AC must have explicit evidence showing it was verified (e.g., "Code review confirms X is implemented in file Y:Z", "UI test: clicked button, observed expected behavior").

**For FAIL reports:** Clearly indicate which AC(s) failed and why.

---

## Test Matrix / Scenarios Executed

**MANDATORY:** List all test scenarios that were executed during QA verification.

| Scenario | Description | Status | Notes |
|----------|-------------|--------|-------|
| Scenario 1 | `<test scenario description>` | ✅ PASS / ❌ FAIL | `<observations>` |
| Scenario 2 | `<test scenario description>` | ✅ PASS / ❌ FAIL | `<observations>` |
| Scenario 3 | `<test scenario description>` | ✅ PASS / ❌ FAIL | `<observations>` |

**Test types included:**
- [ ] Code review (files changed, implementation correctness)
- [ ] Build verification (`npm run build:hal` or `tsc -b` - **MANDATORY**)
- [ ] UI verification (automated and/or manual steps)
- [ ] Integration testing (if applicable)
- [ ] Edge case testing (if applicable)

---

## Evidence

**MANDATORY:** Document what was observed during verification. This section should provide concrete evidence supporting the verdict.

### Code Review Evidence

**Files reviewed:**
- `<file-path>`: `<what was verified>` (lines X-Y)
- `<file-path>`: `<what was verified>` (lines X-Y)

**Implementation summary:**
- `<key implementation detail 1>`
- `<key implementation detail 2>`

**Code quality:**
- ✅ / ❌ Linter errors: `<count or "none">`
- ✅ / ❌ TypeScript errors: `<count or "none">`
- ✅ / ❌ Build errors: `<count or "none">`

### Build Verification

**Build command:** `npm run build:hal` (or `tsc -b`)

**Result:** ✅ PASS / ❌ FAIL

**Output:**
```
<paste relevant build output, or "Build completed successfully with no errors">
```

**TypeScript errors:** `<count or "none">`  
**If errors exist:** List all TypeScript errors here. QA **MUST FAIL** if TypeScript errors exist.

### UI Verification

**Automated tests:** ✅ Run / ❌ Not run (reason: `<why not run>`)

**Manual steps executed:**
1. `<step 1>` - Result: `<observed behavior>`
2. `<step 2>` - Result: `<observed behavior>`
3. `<step 3>` - Result: `<observed behavior>`

**Screenshots/observations:**
- `<description of what was observed in UI>`

**If automated UI tests were not run:** List the manual steps the user should run in Human in the Loop phase.

---

## Repro Steps (for FAIL reports only)

**MANDATORY if verdict is FAIL:** Provide clear, step-by-step instructions to reproduce the failure.

1. `<step 1>`
2. `<step 2>`
3. `<step 3>`
4. `<step 4>`

**Expected behavior:** `<what should happen>`

**Actual behavior:** `<what actually happens>`

**Suspected area:** `<file/component/function suspected to be the cause>`

**Error messages/logs:**
```
<paste error messages, console logs, or stack traces>
```

---

## Environment

**MANDATORY:** Document the environment where QA verification was performed.

**App version/branch:** `<branch-name>` (commit: `<commit-hash>`)

**Browser/Platform:** `<browser name and version>` / `<OS>` (e.g., "Chrome 120 / macOS 14.2" or "Firefox 121 / Linux")

**Node version:** `<node version>` (if applicable)

**Build environment:** `<local / CI / cloud>` (if applicable)

**Additional context:**
- `<any other relevant environment details>`

---

## Notes / Risks

**Optional but recommended:** Document any concerns, risks, or recommendations.

### Potential Issues

- **Issue 1:** `<description>` — Risk level: `<LOW / MEDIUM / HIGH>` — `<mitigation or recommendation>`
- **Issue 2:** `<description>` — Risk level: `<LOW / MEDIUM / HIGH>` — `<mitigation or recommendation>`

### Recommendations

- `<recommendation 1>`
- `<recommendation 2>`

### Blocking Issues

**If verdict is FAIL:** List all blocking issues that prevent merge.

1. **Blocking issue 1:** `<description>`
2. **Blocking issue 2:** `<description>`

### Non-blocking Issues

**If verdict is PASS:** List any non-blocking issues or improvements that can be addressed later.

1. **Non-blocking issue 1:** `<description>`
2. **Non-blocking issue 2:** `<description>`

---

## Implementation Artifacts Audit

**MANDATORY:** Confirm all required implementation artifacts are present in Supabase.

| Artifact Type | Title | Status |
|---------------|-------|--------|
| Plan | `Plan for ticket <ticket-id>` | ✅ Present / ❌ Missing |
| Worklog | `Worklog for ticket <ticket-id>` | ✅ Present / ❌ Missing |
| Changed Files | `Changed Files for ticket <ticket-id>` | ✅ Present / ❌ Missing |
| Decisions | `Decisions for ticket <ticket-id>` | ✅ Present / ❌ Missing |
| Verification | `Verification for ticket <ticket-id>` | ✅ Present / ❌ Missing |
| PM Review | `PM Review for ticket <ticket-id>` | ✅ Present / ❌ Missing |
| Git diff | `Git diff for ticket <ticket-id>` | ✅ Present / ❌ Missing |
| Instructions Used | `Instructions Used for ticket <ticket-id>` | ✅ Present / ❌ Missing |

**If any artifacts are missing:** QA **MUST FAIL** immediately. Do not proceed with code review or verification. See "Missing Required Implementation Artifacts" section below.

---

## Missing Required Implementation Artifacts (if applicable)

**MANDATORY if artifacts are missing:** This section must be present if any required implementation artifacts are missing.

**QA FAILED:** Required implementation artifacts are missing. QA cannot proceed without complete implementation artifacts.

**Missing artifacts:**
- `<artifact type>` (`<artifact title>`)
- `<artifact type>` (`<artifact title>`)

**Present artifacts:**
- `<artifact type>`
- `<artifact type>`

**Action required:** Implementation agent must store all required artifacts before QA can proceed.

---

## Verdict (Final)

**Status:** ✅ **PASS (OK to merge)** / ❌ **FAIL**

**Implementation complete:** `<Yes / No>`

**Acceptance criteria met:** `<All / Partial / None>` — `<list which ACs passed/failed>`

**OK to merge:** `<Yes / No>`

**Blocking manual verification:** `<Yes / No>` — `<if yes, describe what needs manual verification>`

**Verified on:** Commit `<commit-hash>` (`<commit-message>`)

---

**QA Completed:** `<date>`  
**QA Agent:** `<agent name/type>`

---

**Note:** This template ensures QA reports are consistent, auditable, and include explicit Acceptance Criteria verification + test outcomes. All sections must be filled with actual verification results, not placeholder text.
