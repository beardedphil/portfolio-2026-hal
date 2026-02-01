# Decisions

## Cloud QA branch access limitation workflow

- **Decision:** Implementation agents must merge feature branches to `main` when ready for QA (instead of leaving them on feature branches) because cloud QA agents cannot access non-`main` branches.
- **Rationale:** Cloud environments may restrict QA agent access to only the `main` branch. Merging to `main` makes changes accessible for QA review and testing.
- **Trade-offs:**
  - **Pros:** Enables cloud QA agents to review and test changes
  - **Cons:** Changes are on `main` before QA approval (but this is necessary for cloud QA access)
- **Mitigation:** Implementation agent must clearly mark ticket as "Merged to main for QA" and include all audit artifacts in ticket body so QA knows the context.

## Section naming

- **Decision:** Changed section title from "implementation agent exception" to "implementation agent workflow" to reflect this is the standard process for cloud agents, not an exception.
- **Rationale:** This workflow is required for cloud environments, so it should be presented as the standard workflow rather than an exception.

## QA workflow updates

- **Decision:** QA rules explicitly state that for tickets marked "Merged to main for QA", QA reviews on `main` and still produces the required qa-report.md.
- **Rationale:** QA needs clear instructions on how to handle tickets that are already merged to `main` due to cloud access limitations.
