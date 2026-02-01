# Plan

- Update `.cursor/rules/done-means-pushed.mdc` to add a "Cloud QA branch access limitation" section that describes the scenario and workflow for implementation agents to merge to `main` when ready for QA
- Remove the conflicting "Do not merge to main" section that contradicts the new workflow
- Update `.cursor/rules/qa-audit-report.mdc` to add a section explaining that QA reviews on `main` for tickets marked "Merged to main for QA"
- Update references throughout `done-means-pushed.mdc` to reflect that merging to main is required (not forbidden) for cloud QA access
- Create all required audit artifacts (plan, worklog, changed-files, decisions, verification, pm-review)
