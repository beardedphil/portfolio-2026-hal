# Plan (0004-fix-pm-agent-stepcountis-and-sync-hal-submodule)

## Goal

Fix the PM agent runtime import error (`stepCountIs` not exported by installed `ai` package) in portfolio-2026-hal-agents, then sync HAL's `projects/hal-agents` submodule to the real repo's latest `main` so HAL loads and runs the real PM agent.

## Approach

### 1. Fix projectManager.ts (real repo)

- Remove `stepCountIs` from the `ai` import.
- Replace `stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)` with `maxSteps: MAX_TOOL_ITERATIONS` in the `generateText` call.
- The installed `ai` package (^4.3.0) does not export `stepCountIs`; `maxSteps` is the supported option for limiting the tool loop.

### 2. Audit artifacts

- Create `docs/audit/0004-fix-pm-agent-stepcountis-and-sync-hal-submodule/` with plan, worklog, changed-files, decisions, verification, pm-review.

### 3. Sync HAL submodule

- After the fix is committed (and optionally pushed) in portfolio-2026-hal-agents, update HAL's `projects/hal-agents` submodule to point to that commit.
- In HAL: `git submodule update --remote projects/hal-agents` (or checkout the specific commit from the real repo), then commit the updated submodule pointer and push HAL `main` per HAL's process.

## Tasks

1. Edit `src/agents/projectManager.ts`: remove stepCountIs import and use maxSteps.
2. Create audit directory and all six audit artifacts.
3. In HAL repo, update `projects/hal-agents` to the latest from the real repo and commit (submodule sync).
