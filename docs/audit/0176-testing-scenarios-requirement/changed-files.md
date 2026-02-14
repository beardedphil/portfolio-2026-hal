# Changed Files: 0176 - Testing scenarios requirement

## Rule files created

- `.cursor/rules/testing-scenarios-requirement.mdc`
  - New rule file requiring all agents (implementation, QA, PM) to include "Testing scenarios used" sections when verifying acceptance criteria. Specifies minimum content requirements (1 happy-path + 2 edge cases) and where scenarios must appear for each agent type.

## Rule files modified

- `.cursor/rules/qa-audit-report.mdc`
  - Added "Testing scenarios used" as mandatory section #7 in QA report structure. References the new testing-scenarios-requirement.mdc rule for full requirements.

- `projects/kanban/hal-template/.cursor/rules/auditability-and-traceability.mdc`
  - Updated verification.md artifact description to include mandatory "Testing scenarios used" section requirement.
  - Updated PM Review artifact section to include "Testing scenarios used" requirement when PM review includes verification of acceptance criteria.

## Template files modified

- `docs/templates/pm-review.template.md`
  - Added "Testing scenarios used" section template with example format showing happy-path and edge case scenarios.
