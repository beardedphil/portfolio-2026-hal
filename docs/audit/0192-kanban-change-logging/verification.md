# Verification (0192-kanban-change-logging)

## UI-Only Verification Steps

All verification steps can be performed by opening the ticket in the Kanban UI and viewing the documentation. No terminal commands, devtools, or console logs required.

## Step 1: Verify Workflow Rule Document Exists

- **Action:** Navigate to `.cursor/rules/kanban-change-logging.mdc` in the codebase (or view it in the ticket's artifacts if available)
- **Check:** The file exists and contains:
  - "When Logging Is Required" section
  - "Log Format (Copy/Paste Template)" section with exact format
  - "Where to Store the Log" section (ticket body primary, artifact fallback)
  - "What to Do When Logging Fails Completely" section
  - At least one concrete example
- **Pass:** All sections are present and clearly documented

## Step 2: Verify Log Format Includes All Required Fields

- **Action:** Open `.cursor/rules/kanban-change-logging.mdc` and locate the "Log Format (Copy/Paste Template)" section
- **Check:** The template includes:
  - Timestamp (YYYY-MM-DD HH:MM:SS UTC format)
  - Agent type
  - Ticket ID(s) affected
  - From column → To column
  - Old position → New position
  - Reason
- **Pass:** All required fields are present in the template

## Step 3: Verify Storage Location Is Documented

- **Action:** Open `.cursor/rules/kanban-change-logging.mdc` and locate the "Where to Store the Log" section
- **Check:** The section clearly states:
  - Primary method: ticket body "Kanban Change Log" section
  - Fallback method: artifact creation
  - Both methods are visible in ticket UI
- **Pass:** Both storage locations are documented and both are human-verifiable in ticket UI

## Step 4: Verify Failure Handling Is Defined

- **Action:** Open `.cursor/rules/kanban-change-logging.mdc` and locate the "What to Do When Logging Fails Completely" section
- **Check:** The section defines:
  - Do not perform move if logging fails (with exception for critical workflows)
  - Create follow-up ticket if logging fails
  - Document failure in worklog
- **Pass:** Failure handling is clearly defined

## Step 5: Verify Concrete Example Exists

- **Action:** Open `.cursor/rules/kanban-change-logging.mdc` and locate the examples section
- **Check:** At least one example is provided showing:
  - Complete log entry with all required fields
  - Realistic scenario (e.g., "Unassigned → To Do because DoR passed")
- **Pass:** At least one complete, realistic example is present

## Step 6: Verify Workflow Checklist Exists

- **Action:** Open `.cursor/rules/kanban-change-logging.mdc` and locate the "Workflow Steps (Copy/Paste Checklist)" section
- **Check:** The checklist includes steps for:
  - Before move (note current state)
  - Perform move
  - After move (log entry)
  - Fallback handling
- **Pass:** Complete workflow checklist is present

## Summary

- **All steps pass:** The workflow document is complete and meets all acceptance criteria
- **Any step fails:** Note which step failed and what was missing
