# Changed Files: 0088 - QA Agent automatically moves ticket to Doing when starting, and to Human in the Loop/To Do on Pass/Fail

- `api/agent-runs/launch.ts` — Added move-to-Doing logic when QA agent starts (ticket in QA column moves to Doing before agent launch)
- `vite.config.ts` — Added move-to-Doing logic in `/api/qa-agent/run` endpoint (ticket in QA column moves to Doing when QA starts)
