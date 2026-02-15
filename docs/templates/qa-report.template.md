# QA Report Template

**MANDATORY:** QA agents **MUST** use this template when publishing QA artifacts via `/api/artifacts/insert-qa`. Copy this template and fill in all sections. Remove placeholder text and replace with actual content.

## Ticket & Deliverable

**Ticket ID:** HAL-XXXX  
**Repo:** [repository name]

**Goal:** [One sentence goal from ticket]

**Human-verifiable deliverable (UI-only):** [What a human will see/click/verify]

**Acceptance criteria (UI-only):**
- [ ] [AC 1 from ticket]
- [ ] [AC 2 from ticket]
- [ ] [AC 3 from ticket]
[... list all ACs from ticket ...]

**Verification commit/branch:** [commit hash or branch name]

## Missing Artifacts (if any)

**Status:** [All artifacts present / Missing artifacts detected]

If missing artifacts:
- ❌ [Artifact name] — Missing
- ❌ [Artifact name] — Missing

**Action:** QA FAIL — Missing required artifacts. See "Verdict" section below.

## Audit Artifacts Present

**Status:** ✅ All required artifacts present

- ✅ Plan for ticket HAL-XXXX
- ✅ Worklog for ticket HAL-XXXX
- ✅ Changed Files for ticket HAL-XXXX
- ✅ Decisions for ticket HAL-XXXX
- ✅ Verification for ticket HAL-XXXX
- ✅ PM Review for ticket HAL-XXXX
- ✅ Git Diff for ticket HAL-XXXX
- ✅ Instructions Used for ticket HAL-XXXX

## Code Review

**Status:** [✅ PASS / ❌ FAIL]

### Implementation Summary

[Brief summary of what was implemented, key files changed, approach taken]

### Detailed Code Analysis

[For each significant code change, provide:]
- **File:** `path/to/file.ts:line-range`
- **Change:** [Description of what changed]
- **Analysis:** [✅ CORRECT / ❌ INCORRECT / ⚠️ CONCERN] — [Reasoning]

### Code Quality

- [✅ / ❌] **Linter errors:** [None / List errors]
- [✅ / ❌] **TypeScript errors:** [None / List errors]
- [✅ / ❌] **Build verification:** [PASS / FAIL] — `npm run build:hal` [result]
- [✅ / ❌] **Follows existing patterns:** [Yes / No]
- [✅ / ❌] **No breaking changes:** [Yes / No]

## Build Verification

**MANDATORY:** `npm run build:hal` must pass. TypeScript errors = FAIL.

**Command:** `npm run build:hal`  
**Status:** [✅ PASS / ❌ FAIL]  
**Output:**
```
[paste build output here]
```

**TypeScript errors:** [None / List errors if any]

## UI Verification

### Automated Checks

- [✅ / ❌] **Code review:** [PASS / FAIL]
- [✅ / ❌] **Build:** [PASS / FAIL]
- [✅ / ❌] **Lint:** [PASS / FAIL]

### Manual Verification Steps

[For PASS reports: List what was verified]
1. [Test step 1]
2. [Test step 2]
3. [Test step 3]

[For FAIL reports: List what failed and what was expected]
1. **Expected:** [What should happen]
   **Actual:** [What actually happened]
   **Location:** [Where in UI/code this was observed]

## Test Matrix / Scenarios Executed

| Scenario | Steps | Expected Result | Actual Result | Status |
|----------|-------|-----------------|---------------|--------|
| [Scenario 1] | [Steps] | [Expected] | [Actual] | [✅ PASS / ❌ FAIL] |
| [Scenario 2] | [Steps] | [Expected] | [Actual] | [✅ PASS / ❌ FAIL] |
| [Scenario 3] | [Steps] | [Expected] | [Actual] | [✅ PASS / ❌ FAIL] |

## Acceptance Criteria Verification

**MANDATORY:** Enumerate each AC from the ticket. For each AC, state Met/Not met with evidence.

### AC 1: "[Full text of AC 1 from ticket]"
- **Status:** [✅ Met / ❌ Not met]
- **Evidence:**
  - [File path:line-range — implementation location]
  - [Artifact reference: "See Plan artifact for ticket HAL-XXXX, section X"]
  - [Reproduction steps: "Navigate to X, click Y, verify Z appears"]
  - [Screenshot reference: "See screenshot in Verification artifact"]

### AC 2: "[Full text of AC 2 from ticket]"
- **Status:** [✅ Met / ❌ Not met]
- **Evidence:**
  - [Evidence type 1]
  - [Evidence type 2]

### AC 3: "[Full text of AC 3 from ticket]"
- **Status:** [✅ Met / ❌ Not met]
- **Evidence:**
  - [Evidence type 1]
  - [Evidence type 2]

[... continue for all ACs from ticket ...]

## Evidence

**What was observed during verification:**

### Code Evidence
- [File paths and line ranges where requirements are implemented]
- [Code snippets or references to specific functions/classes]

### Artifact Evidence
- [References to implementation artifacts (Plan, Worklog, etc.)]
- [Specific sections in artifacts that demonstrate requirements are met]

### UI Evidence
- [Screenshots or descriptions of UI behavior]
- [Manual test results]
- [User-visible changes observed]

### Build/Test Evidence
- [Build output]
- [Test results]
- [Linter output]

## Repro Steps (for FAIL reports)

**MANDATORY for FAIL verdicts:** Provide clear reproduction steps so implementation agents can reproduce and fix issues.

### Issue 1: [Brief description]
1. [Step 1]
2. [Step 2]
3. [Step 3]
4. **Expected:** [What should happen]
5. **Actual:** [What actually happened]
6. **Suspected area:** [File path or component where issue likely exists]

### Issue 2: [Brief description]
[Same format as Issue 1]

## Environment

**App version/branch:** [branch name or commit hash]  
**Browser:** [Browser name and version, e.g., "Chrome 120.0.6099.129"]  
**OS:** [Operating system, e.g., "macOS 14.2.1"]  
**Node version:** [Node.js version if relevant, e.g., "Node.js 20.10.0"]  
**Build environment:** [Any relevant build environment details]

## Notes / Risks

### Potential Issues
- [⚠️ / ✅] **Issue 1:** [Description] — [Risk level: LOW / MEDIUM / HIGH] — [Mitigation or recommendation]
- [⚠️ / ✅] **Issue 2:** [Description] — [Risk level: LOW / MEDIUM / HIGH] — [Mitigation or recommendation]

### Recommendations
- [Recommendation 1]
- [Recommendation 2]

### Blocking Issues
- [None / List any blocking issues that prevent merge]

## Verdict

**Status:** [✅ PASS / ❌ FAIL]

### Rationale

[Brief explanation of why PASS or FAIL]

### Summary

- **Implementation complete:** [Yes / No]
- **Acceptance criteria met:** [All / Partial: X of Y / None]
- **Build verification:** [✅ PASS / ❌ FAIL]
- **Code quality:** [✅ PASS / ❌ FAIL]
- **OK to merge:** [Yes / No]

### Next Steps

**If PASS:**
- Move ticket to "Human in the Loop"
- Merge to main (if applicable)
- Delete feature branch (if applicable)

**If FAIL:**
- Move ticket to "To Do"
- Create Implementation agent note (see qa-audit-report.mdc)
- List required actions for implementation agent

---

**QA Completed:** [YYYY-MM-DD]  
**QA Agent:** [Agent name/identifier]  
**Verified on:** [Commit hash or branch name]
