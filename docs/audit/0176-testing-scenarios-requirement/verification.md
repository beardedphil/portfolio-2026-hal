# Verification: 0176 - Testing scenarios requirement

## Testing scenarios used

### Happy path
- **Scenario:** Verify that newly created rule file exists and contains the testing scenarios requirement
  - **Steps:** 
    1. Open `.cursor/rules/testing-scenarios-requirement.mdc` in the HAL app or file system
    2. Verify the file exists and contains sections for Implementation Agent, QA Agent, and PM/Process Review Agent
    3. Verify it specifies minimum content requirements (1 happy-path + 2 edge cases)
  - **Expected:** File exists with complete requirement documentation
  - **Result:** PASS

### Edge cases
- **Scenario:** Verify that QA audit report rule references the new testing scenarios requirement
  - **Steps:**
    1. Open `.cursor/rules/qa-audit-report.mdc` in the HAL app
    2. Search for "Testing scenarios used" section
    3. Verify it appears as section #7 in the QA report structure
    4. Verify it references `.cursor/rules/testing-scenarios-requirement.mdc`
  - **Expected:** QA audit report rule includes testing scenarios as mandatory section with reference to the new rule file
  - **Result:** PASS

- **Scenario:** Verify that auditability rule includes testing scenarios requirement for Verification artifacts
  - **Steps:**
    1. Open `projects/kanban/hal-template/.cursor/rules/auditability-and-traceability.mdc` in the HAL app
    2. Find the section describing `verification.md` artifact
    3. Verify it includes the mandatory "Testing scenarios used" requirement
    4. Verify it references `.cursor/rules/testing-scenarios-requirement.mdc`
  - **Expected:** Verification artifact description includes testing scenarios requirement with reference
  - **Result:** PASS

- **Scenario:** Verify that PM review template includes testing scenarios section
  - **Steps:**
    1. Open `docs/templates/pm-review.template.md` in the HAL app
    2. Search for "Testing scenarios used" section
    3. Verify it includes example format with happy-path and edge case scenarios
  - **Expected:** PM review template includes testing scenarios section with example format
  - **Result:** PASS

## Human-verifiable steps

1. **Check rule file exists:** In the HAL app or file system, navigate to `.cursor/rules/testing-scenarios-requirement.mdc` and confirm it exists with complete content.

2. **Check QA rule updated:** Open `.cursor/rules/qa-audit-report.mdc` and verify section #7 "Testing scenarios used" is present in the QA report structure.

3. **Check auditability rule updated:** Open `projects/kanban/hal-template/.cursor/rules/auditability-and-traceability.mdc` and verify both the verification.md and PM Review sections mention the testing scenarios requirement.

4. **Check PM template updated:** Open `docs/templates/pm-review.template.md` and verify it includes a "Testing scenarios used" section with example format.

5. **Spot-check in UI:** For a future ticket completed after this change, open the Verification artifact or QA report in the HAL app and confirm the "Testing scenarios used" section is present and non-empty.
