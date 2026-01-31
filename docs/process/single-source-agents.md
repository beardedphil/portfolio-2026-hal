# Single source for agents (hal-agents)

## Problem

When the agents package lived in a **git submodule** at `projects/hal-agents`, the same code lived in two places:

- HAL repo: `portfolio-2026-hal/projects/hal-agents` (submodule at a pinned commit)
- Standalone repo: `portfolio-2026-hal-agents` (or a separate clone of the same repo)

Edits had to be applied in both, or synced manually, so HAL often didn’t have the latest agents code.

## Approach: hal-agents lives only in HAL

**hal-agents is no longer a submodule.** It is a normal directory inside the HAL repo:

- **Single place to edit**: `projects/hal-agents` inside HAL.
- **HAL always has the latest**: No separate repo to sync; what you commit in HAL is what runs.
- **No double edits**: Edit only under HAL; run `npm run dev:hal` and the PM agent uses that code.

### Optional: keep an external agents repo

If you still want a separate repo (e.g. `portfolio-2026-hal-agents`) for publishing or reuse:

- Treat HAL as the source of truth. Edit only in `portfolio-2026-hal/projects/hal-agents`.
- When you want to push to the external repo, either:
  - **Push a subtree**: from HAL root,  
    `git subtree push --prefix=projects/hal-agents <remote> main`, or
  - **Add the external repo as a remote** in `projects/hal-agents` and push from there (e.g. after `cd projects/hal-agents && git remote add agents <url>` and committing from that directory if you later split it back out).

For day-to-day work, **edit only in HAL** so there is a single source of truth.

## Kanban

`projects/kanban` remains a **submodule** (separate repo). Only hal-agents (agents) was converted to a normal directory so agents code is maintained in one place.
