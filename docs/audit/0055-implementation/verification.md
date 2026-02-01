## Verification steps

1. **Code review:** Verify that both `done-means-pushed.mdc` and `qa-audit-report.mdc` contain explicit requirements for adding/updating an "Artifacts" section in the ticket body
2. **Check minimum artifact list:** Confirm both rules specify the minimum artifact list: plan, worklog, changed-files, decisions, verification, pm-review, and qa-report (when applicable)
3. **Check link format clarification:** Verify both rules clarify that paths are acceptable as links and must match canonical folder naming (`<task-id>-<short-title-kebab>`)
4. **Check consistency:** Verify `auditability-and-traceability.mdc` references the Artifacts section requirement
5. **Verify example format:** Check that both rules include an example Artifacts section showing the expected format

## Expected result

- Implementation agents will be required to add an "Artifacts" section to tickets when marking ready for QA
- QA agents will be required to add/update the "Artifacts" section to include qa-report.md when QA is complete
- All required audit artifacts will be traceable from the Kanban UI via clickable links/paths in the ticket body
