# Changed Files: 0003-hal-chat-use-hal-agents-pm-stub

## New Files

### Submodule (projects/hal-agents — portfolio-2026-hal-agents)

- `projects/hal-agents/src/agents/projectManager.ts` — PM agent stub: `respond({ message, context })` returning `{ replyText, meta }` with `[PM@hal-agents]` signature.

### Audit Artifacts

- `docs/audit/0003-hal-chat-use-hal-agents-pm-stub/plan.md`
- `docs/audit/0003-hal-chat-use-hal-agents-pm-stub/worklog.md`
- `docs/audit/0003-hal-chat-use-hal-agents-pm-stub/changed-files.md`
- `docs/audit/0003-hal-chat-use-hal-agents-pm-stub/decisions.md`
- `docs/audit/0003-hal-chat-use-hal-agents-pm-stub/verification.md`

## Modified Files

### HAL Application

- `vite.config.ts` — Added `path` import and `resolve.alias` for `@hal-agents` → `projects/hal-agents/src`.
- `tsconfig.app.json` — Added `baseUrl`, `paths` for `@hal-agents/*`, and `include` of `projects/hal-agents/src`.
- `src/App.tsx` — Import PM from hal-agents; extended diagnostics type and state; Project Manager branch in `handleSend` calls PM module and shows reply/error; diagnostics panel shows PM implementation source and last agent error.
