# Plan: 0176 - Testing scenarios requirement

## Approach

1. Create new rule file `.cursor/rules/testing-scenarios-requirement.mdc` that defines the requirement for all agents to include "Testing scenarios used" sections when verifying acceptance criteria.

2. Update existing rule files to reference and enforce the new requirement:
   - Update `.cursor/rules/qa-audit-report.mdc` to include testing scenarios in QA report structure
   - Update `projects/kanban/hal-template/.cursor/rules/auditability-and-traceability.mdc` to include testing scenarios in Verification artifact and PM Review artifact requirements
   - Update `docs/templates/pm-review.template.md` to include testing scenarios section template

3. Document all changes in `docs/audit/0176-testing-scenarios-requirement/changed-files.md`

## File touchpoints

- `.cursor/rules/testing-scenarios-requirement.mdc` (new)
- `.cursor/rules/qa-audit-report.mdc` (modify)
- `projects/kanban/hal-template/.cursor/rules/auditability-and-traceability.mdc` (modify)
- `docs/templates/pm-review.template.md` (modify)
- `docs/audit/0176-testing-scenarios-requirement/changed-files.md` (new)
