# PM Review (0003-pm-agent-context-pack-tools)

## Summary

- Implemented runPmAgent with context pack (user message, .cursor/rules, git status).
- Added read-only tools: list_directory, read_file, search_files (sandboxed).
- Tool loop via AI SDK generateText + stepCountIs(10).
- Redacted outbound request for diagnostics.
- Errors include errorPhase (context-pack | openai | tool).

## Likelihood of success

**Score (0–100%)**: 85%

**Why:**
- AI SDK and Responses API are well-documented.
- Path sandboxing prevents traversal.
- HAL already calls /api/pm/respond and expects this shape.

## What to verify (UI-only)

- Project Manager chat: "Summarize ticket 0001" → PM uses tools, returns summary.
- Diagnostics: outbound request JSON visible, no sk- keys.
- Tool calls displayed when PM uses list_directory / read_file / search_files.

## Potential failures (ranked)

1. **AI SDK version mismatch** — Import errors or missing stepCountIs. Fix: align ai/@ai-sdk/openai versions.
2. **Rules dir path** — When run from HAL, repoRoot is HAL root; .cursor/rules may be in HAL or hal-agents. Context: HAL vite passes path.resolve(__dirname) as repoRoot (HAL root), so .cursor/rules from HAL superrepo are used.
3. **Git not in PATH** — git status fails in some envs. Mitigation: catch error, include "(git status failed)" in context pack.

## Audit completeness check

- **Artifacts present**: plan, worklog, changed-files, decisions, verification, pm-review
- **Traceability**: Ticket 0003 acceptance criteria mapped to implementation.
