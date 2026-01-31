# Worklog: 0003-hal-chat-use-hal-agents-pm-stub

## Session 1

### Analysis

- Read ticket 0003 and hal-agents ticket 0001 (PM stub API).
- Confirmed HAL chat currently uses a single inline stub for both agents in `handleSend`.
- Confirmed submodule `projects/hal-agents` (portfolio-2026-hal-agents) exists; no `src` or TS files present yet.

### Implementation

1. **PM module in submodule**
   - Created `projects/hal-agents/src/agents/projectManager.ts` with:
     - Types: `PMContext`, `PMRequest`, `PMResponse`.
     - `respond({ message, context })` returning `{ replyText, meta }`.
     - Signature `[PM@hal-agents]` in all replies.
     - Standup/status vs generic message handling.

2. **HAL build config**
   - `vite.config.ts`: added `path` import and `resolve.alias` mapping `@hal-agents` to `projects/hal-agents/src`.
   - `tsconfig.app.json`: added `baseUrl`, `paths` for `@hal-agents/*`, and `include` of `projects/hal-agents/src`.

3. **HAL App.tsx**
   - Import `respond as pmRespond` from `@hal-agents/agents/projectManager`.
   - Extended `DiagnosticsInfo` with `pmImplementationSource` and `lastAgentError`.
   - Added `lastAgentError` state.
   - In `handleSend`: when `selectedAgent === 'project-manager'`, call `pmRespond()` in a 500ms timeout, pass `context: { standup: /standup|status/i.test(content) }`, display `replyText`; on catch set `lastAgentError` and add error message with `[PM@hal-agents] Error: ...`. Implementation Agent branch unchanged (inline stub).
   - Diagnostics object: `pmImplementationSource` = `hal-agents` when PM selected, `inline` otherwise; `lastAgentError` from state.
   - Diagnostics panel: added rows "PM implementation source" and "Last agent error".

4. **Verification**
   - Ran `npx vite build` in HAL: build succeeded (28 modules, includes submodule).
   - Lint: no errors on edited files.
   - Full `npm run build` fails on pre-existing `showDirectoryPicker` type errors (unrelated to this ticket).

### Audit Artifacts

- Created `docs/audit/0003-hal-chat-use-hal-agents-pm-stub/` with plan, worklog, changed-files, decisions, verification.
