# Plan: Ticket 0009 - HAL PM Agent Endpoint + Diagnostics

## Scope

This ticket covers the **HAL-side integration** for the PM agent:
- API endpoint (`POST /api/pm/respond`) that calls hal-agents `runPmAgent()`
- UI updates to display PM responses and diagnostics (outbound request JSON, tool calls)

The PM agent core logic (context pack, tools, tool loop, redaction) is implemented in hal-agents ticket 0003.

## Architecture

```
User Message
    │
    ▼
┌─────────────────────────────────────────┐
│  HAL (portfolio-2026-hal)               │
│  ┌───────────────────────────────────┐  │
│  │  App.tsx                          │  │
│  │  - Calls /api/pm/respond          │  │
│  │  - Displays reply in chat         │  │
│  │  - Shows diagnostics panel        │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  vite.config.ts                   │  │
│  │  - POST /api/pm/respond endpoint  │  │
│  │  - Imports runPmAgent from        │  │
│  │    @hal-agents                    │  │
│  │  - Passes config (keys, repoRoot) │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  hal-agents (submodule)                 │
│  - runPmAgent(message, config)          │
│  - Returns { reply, toolCalls,          │
│    outboundRequest, error? }            │
└─────────────────────────────────────────┘
```

## Tasks

1. **vite.config.ts**: Add `/api/pm/respond` endpoint
   - Import `runPmAgent` from `@hal-agents/agents/projectManager`
   - Read `OPENAI_API_KEY` and `OPENAI_MODEL` from env
   - Call `runPmAgent()` with message and config
   - Return JSON response

2. **App.tsx**: Update PM chat handling
   - Call `/api/pm/respond` instead of `/api/openai/responses`
   - Parse structured response
   - Display `reply` in chat transcript
   - Store `outboundRequest` and `toolCalls` for diagnostics

3. **App.tsx**: Extend Diagnostics panel
   - Add "Outbound Request JSON" collapsible section
   - Add "Tool Calls" section showing tool name + input/output
   - Both sections only visible when PM is selected and data exists

## Dependencies

- **hal-agents#0003** must be implemented first (exports `runPmAgent`)
- Until 0003 is done, the endpoint will return a stub/error

## Files to modify

- `vite.config.ts` - Add new endpoint
- `src/App.tsx` - Update PM handler and diagnostics
