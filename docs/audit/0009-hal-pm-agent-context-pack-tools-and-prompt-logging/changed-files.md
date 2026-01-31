# Changed Files: Ticket 0009

## Modified (HAL repo)

- `vite.config.ts` - Load `runPmAgent` from `projects/hal-agents/dist/agents/projectManager.js`; removed .ts import
- `package.json` - Added `build:agents` script; `dev:hal` now runs `build:agents && vite ...`
- `docs/audit/0009-hal-pm-agent-context-pack-tools-and-prompt-logging/plan.md` - Updated tasks and files
- `docs/audit/0009-hal-pm-agent-context-pack-tools-and-prompt-logging/worklog.md` - Session 2 actions
- `docs/audit/0009-hal-pm-agent-context-pack-tools-and-prompt-logging/changed-files.md` - This file
- `docs/audit/0009-hal-pm-agent-context-pack-tools-and-prompt-logging/decisions.md` - D5 added
- `docs/audit/0009-hal-pm-agent-context-pack-tools-and-prompt-logging/verification.md` - Status updated
- `docs/audit/0009-hal-pm-agent-context-pack-tools-and-prompt-logging/pm-review.md` - Checklist filled

## Modified (HAL’s projects/hal-agents submodule)

- `package.json` - Added `build` script, `devDependencies.typescript`
- `tsconfig.build.json` - New: outDir dist, rootDir src, esModuleInterop, allowSyntheticDefaultImports
- `src/agents/projectManager.ts` - Filter callback typed `(e: string)`
- `src/agents/tools.ts` - searchRoot narrowed to string for closure
- `src/utils/redact.ts` - Key-based redaction for SENSITIVE_KEYS (api_key, authorization, secret, etc.)

## Created

- `projects/hal-agents/tsconfig.build.json` - Build config for dist output
- `projects/hal-agents/dist/` - Emitted JS (agents/projectManager.js, tools.js, utils/redact.js, sandbox.js) after build

## Unchanged (already present from prior work)

- `src/App.tsx` - PM chat calls `/api/pm/respond`, Diagnostics shows outbound request and tool calls
- `src/index.css` - Styles for diagnostics subsections
- `docs/tickets/0009-hal-pm-agent-context-pack-tools-and-prompt-logging.md` - Ticket text
