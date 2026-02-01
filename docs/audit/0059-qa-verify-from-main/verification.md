# Verification

## Human-verifiable steps

1. Open the HAL UI's agent rules view (where `.cursor/rules/*.mdc` content is shown/managed)
2. Navigate to or search for the QA agent instructions (qa-audit-report.mdc)
3. Verify the following are present and clear:

### Acceptance Criteria Verification

- [x] **AC1:** The QA agent instructions explicitly state that, in the "cloud QA cannot access feature branches" workflow, QA pulls/tests the latest `main` branch that contains the implementation merge.
  - **Location:** "Cloud QA workflow context" section and "Which branch to use (decision rule)" → Step 1
  - **Verification:** Look for explicit instruction: "Pull the latest `main` branch: `git checkout main && git pull origin main`"

- [x] **AC2:** The QA agent instructions include a clear decision rule: if the ticket indicates "merged to `main` for QA access", QA must not attempt to locate or check out a feature branch and must proceed using `main`.
  - **Location:** "Which branch to use (decision rule)" section
  - **Verification:** Look for: "If the ticket or prompt states that the implementation was 'merged to main for QA access'... You **must** verify from the **`main`** branch. Do **not** attempt to locate, check out, or use the feature branch."

- [x] **AC3:** The QA agent instructions require QA to record artifacts/links in the ticket (including `docs/audit/<ticket-id>-<short-title>/qa-report.md`) and note that verification was performed against `main`.
  - **Location:** "Which branch to use (decision rule)" → Step 3, and "If you are verifying from `main`" → Step 2
  - **Verification:** Look for instructions to:
    - Record in `qa-report.md` that verification was performed against `main`
    - Update ticket body with link to qa-report.md and note about `main` verification

- [x] **AC4:** The instructions describe what QA does after verification: move the ticket to **Human in the Loop** (DB-first), and avoid redundant merges if the change is already on `main`.
  - **Location:** "If you are verifying from `main`" section
  - **Verification:** Look for:
    - Instruction to move ticket to Human in the Loop using `node scripts/move-ticket-column.js` (DB-first)
    - Explicit note: "Do **not** merge again — the change is already on `main`"

## Expected result

A human can open the QA agent instructions in the HAL UI's agent rules view and see:
- Clear explanation of the cloud QA workflow context
- Explicit step-by-step guidance for verifying from `main`
- Decision rule that prevents attempting to check out feature branches when ticket indicates "merged to main for QA access"
- Instructions to record verification context in both qa-report.md and ticket
- Post-verification workflow that avoids redundant merges
