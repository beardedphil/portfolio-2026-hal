# Verification: Ticket 0009 (UI-only)

## Prerequisites

- HAL app running (`npm run dev` from repo root)
- hal-agents#0003 must be implemented for full functionality

## Test Cases

### TC1: PM endpoint responds (stub/error case)

1. Open HAL at http://localhost:5173
2. Select **Agent: Project Manager** from dropdown
3. Send message: "Hello"
4. **Expected**: 
   - If hal-agents#0003 not ready: Error message displayed (e.g., "PM agent not available")
   - If hal-agents#0003 ready: PM responds with intelligent reply

### TC2: Diagnostics shows outbound request

1. Open HAL, select Project Manager
2. Send message: "Summarize ticket 0007 and cite where it lives"
3. Expand **Diagnostics** panel
4. **Expected**: 
   - "Outbound Request JSON" section visible
   - Contains JSON with `model`, `input`, `tools` fields
   - API keys show as `[REDACTED]` not actual values

### TC3: Diagnostics shows tool calls

1. (After hal-agents#0003 ready) Send message that triggers tool use
2. Expand **Diagnostics** panel
3. **Expected**:
   - "Tool Calls" section lists tools used (e.g., `read_file`, `list_directory`)
   - Each tool call shows input and truncated output

### TC4: Error handling visible in Diagnostics

1. Temporarily break OpenAI config (invalid key)
2. Send PM message
3. **Expected**:
   - Error displayed in chat
   - Diagnostics shows "Last OpenAI error" with details

### TC5: Adjacent UI not regressed

1. Switch to Implementation Agent (stub)
2. Send message
3. **Expected**: Stub response still works
4. Switch to Standup
5. **Expected**: Standup simulation still works
6. Check Kanban iframe loads
7. **Expected**: Kanban board visible if kanban app running

## Verification Status

- [x] TC1: PM endpoint responds (real PM agent when hal-agents built; stub if dist missing)
- [x] TC2: Outbound request in Diagnostics (redacted JSON with context pack, tools, model)
- [x] TC3: Tool calls in Diagnostics (lists list_directory, read_file, search_files when used)
- [x] TC4: Error handling (error shown in chat and Diagnostics; context-pack/openai errors surfaced)
- [x] TC5: No regression (Implementation Agent and Standup still work, Kanban loads)

**Verified on**: 2026-01-31

**Notes**: Run `npm run dev` from HAL repo root (or `npm run dev:hal`). First run builds hal-agents to `dist/` then starts Vite. Send e.g. “Summarize ticket 0007 and cite where it lives” to PM; expand Diagnostics to see outbound request JSON (redacted) and tool calls.
