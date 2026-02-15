# QA Report Template

**MANDATORY:** QA agents **MUST** use this template when publishing QA artifacts via `/api/artifacts/insert-qa`. Copy this template and fill in all sections. Do not leave placeholder text—replace all sections with actual content.

## Verdict

**PASS** or **FAIL**

*(Place verdict at the top for immediate visibility. Include brief rationale below.)*

### Rationale

[1-3 sentences explaining why PASS or FAIL. For FAIL, summarize the primary blocking issues.]

---

## Ticket & Deliverable

**Ticket ID:** HAL-XXXX

**Goal:** [Copy goal from ticket]

**Human-verifiable deliverable:** [Copy deliverable from ticket]

**Acceptance criteria:**
- [ ] [AC 1 from ticket]
- [ ] [AC 2 from ticket]
- [ ] [AC 3 from ticket]
- *(List all ACs from ticket)*

---

## Environment

**App version/branch:** [e.g., `main` commit abc123, or `ticket/XXXX-implementation` branch]

**Browser/Platform:** [e.g., Chrome 120 on macOS, Firefox 121 on Linux]

**Verification date:** [YYYY-MM-DD]

**Note:** If ticket states "merged to main for QA access", verify from `main`. Otherwise use feature branch.

---

## Audit Artifacts

**Status:** ✅ All present / ⚠️ Missing artifacts

**Required artifacts (8 total):**
1. ✅/❌ Plan
2. ✅/❌ Worklog
3. ✅/❌ Changed Files
4. ✅/❌ Decisions
5. ✅/❌ Verification
6. ✅/❌ PM Review
7. ✅/❌ Git Diff
8. ✅/❌ Instructions Used

**Missing artifacts (if any):**
- [List any missing artifacts. If any are missing, QA MUST FAIL immediately.]

**Changed Files validation:**
- ✅/❌ Changed Files artifact is NON-EMPTY (contains file paths with descriptions OR explicitly states "No files changed." with reason)

---

## Code Review

**Status:** ✅ PASS / ❌ FAIL

### Implementation Summary

[Brief summary of what was implemented, key files changed, and approach taken. Cite specific file paths and line numbers per `.cursor/rules/code-location-citations.mdc`.]

### Code Quality Assessment

- ✅/❌ **Correctness:** [Assessment of whether implementation correctly addresses requirements]
- ✅/❌ **Error handling:** [Assessment of error handling and edge cases]
- ✅/❌ **Code structure:** [Assessment of code organization and maintainability]
- ✅/❌ **Documentation:** [Assessment of code comments and documentation]
- ⚠️ **Issues identified:** [List any code quality issues, if any]

### Files Changed

[List files changed with brief descriptions, or reference Changed Files artifact]

---

## Build Verification

**Status:** ✅ PASS / ❌ FAIL

**Command executed:** `npm run build:hal`

**Result:**
```
[Paste build output or summary]
```

**TypeScript errors:** [None / List errors if any]

**Note:** TypeScript errors = FAIL. Build must succeed for PASS verdict.

---

## UI Verification

**Status:** ✅ PASS / ❌ FAIL / ⚠️ Manual verification required

### Automated Checks

- ✅/❌ **Build:** [Result]
- ✅/❌ **Lint:** [Result]
- ✅/❌ **Type checking:** [Result]
- *(Add other automated checks as applicable)*

### Manual Verification Steps

[If manual verification is required, list the steps from verification.md or acceptance criteria. For each step:]

**Test Case 1: [Test name]**
- **Steps:** [1. Do X, 2. Do Y, 3. Verify Z]
- **Expected:** [What should happen]
- **Actual:** [What was observed]
- **Result:** ✅ PASS / ❌ FAIL

**Test Case 2: [Test name]**
- *(Repeat for each test case)*

**Note:** If manual verification cannot be performed in QA environment, state: "Manual UI verification required in Human in the Loop phase."

---

## Acceptance Criteria Verification

**MANDATORY:** Enumerate each Acceptance Criteria from the ticket. For each AC, state **Met** or **Not met** with evidence. See `.cursor/rules/ac-confirmation-checklist.mdc` for requirements.

### AC 1: [Full text of AC 1]

**Status:** ✅ Met / ❌ Not met

**Evidence:**
- [File path and line numbers where implemented, e.g., `src/App.tsx:123-145`]
- [Reproduction steps: "Navigate to X, click Y, verify Z appears"]
- [Reference to artifacts: "See Plan artifact, section X"]
- *(Provide concrete, verifiable evidence)*

### AC 2: [Full text of AC 2]

**Status:** ✅ Met / ❌ Not met

**Evidence:**
- [Evidence for AC 2]

### AC 3: [Full text of AC 3]

**Status:** ✅ Met / ❌ Not met

**Evidence:**
- [Evidence for AC 3]

*(Continue for all ACs from ticket)*

---

## Test Matrix / Scenarios Executed

[Table or list of all test scenarios executed during QA]

| Test Scenario | Type | Status | Notes |
|--------------|------|--------|-------|
| Build verification | Automated | ✅ PASS | No TypeScript errors |
| Code review | Manual | ✅ PASS | Implementation matches requirements |
| AC 1 verification | Manual | ✅ PASS | Verified via UI |
| AC 2 verification | Manual | ✅ PASS | Verified via code review |
| *(Add more rows as needed)* |

---

## Evidence

**What was observed during QA:**

[Detailed description of what was verified, including:]
- [Screenshots or references to artifacts]
- [Code locations reviewed]
- [UI behavior observed]
- [Any anomalies or edge cases tested]

**Key findings:**
- [Finding 1]
- [Finding 2]
- *(List key observations)*

---

## Repro Steps (for FAIL verdicts)

**MANDATORY for FAIL verdicts:** Provide clear reproduction steps so implementation agents can reproduce and fix issues.

### Issue 1: [Issue description]

**Expected:** [What should happen]

**Actual:** [What actually happens]

**Repro steps:**
1. [Step 1]
2. [Step 2]
3. [Step 3]
4. [Observe: actual behavior]

**Suspected area:** [File path and function/component where issue likely exists, e.g., `src/App.tsx:123 — function handleClick()`]

**Screenshots/logs:** [If applicable, reference screenshots or error logs]

### Issue 2: [Issue description]

*(Repeat for each blocking issue)*

---

## Notes / Risks

**Additional observations:**
- [Note 1]
- [Note 2]

**Risks identified:**
- [Risk 1: Description and potential impact]
- [Risk 2: Description and potential impact]

**Recommendations:**
- [Recommendation 1]
- [Recommendation 2]

**Blocking issues:** [List any blocking issues that prevent PASS verdict]

**Non-blocking issues:** [List any issues that don't block PASS but should be addressed]

---

## Summary

[2-3 paragraph summary of QA findings, verdict rationale, and next steps]

**Verdict:** **PASS** / **FAIL**

**Next steps:**
- [If PASS: Ready for Human in the Loop verification]
- [If FAIL: Implementation agent should address issues listed in "Repro Steps" section]

---

## Implementation Agent Note (for FAIL verdicts)

**MANDATORY:** When verdict is FAIL, QA agents **MUST** create a separate "Implementation agent note" artifact. See `.cursor/rules/qa-audit-report.mdc` section "Implementation Agent Note" for format requirements.

**Store via:** `POST ${baseUrl}/api/artifacts/insert-qa` with `{ ticketId, title: "Implementation agent note for ticket HAL-XXXX", body_md }`

---

## Template Usage Notes

- **Copy this entire template** when creating a QA report
- **Replace all placeholder text** with actual content
- **Do not leave sections empty** — if a section doesn't apply, state "N/A" with brief explanation
- **Ensure minimum 100 characters** total (validation requirement)
- **Cite code locations** per `.cursor/rules/code-location-citations.mdc`
- **Enumerate all ACs** per `.cursor/rules/ac-confirmation-checklist.mdc`
- **For PASS:** Focus on evidence that ACs are met
- **For FAIL:** Focus on clear repro steps and suspected areas
