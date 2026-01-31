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

1. **hal-agents**: Add build that emits JS to `dist/`
   - Add `tsconfig.build.json` with `outDir: dist`, `rootDir: src`
   - Add `build` script and TypeScript devDependency
   - Fix type errors for Node ESM (filter callback, searchRoot narrowing)
2. **vite.config.ts**: `/api/pm/respond` endpoint
   - Import `runPmAgent` from `projects/hal-agents/dist/agents/projectManager.js` (built output)
   - Read `OPENAI_API_KEY` and `OPENAI_MODEL` from env
   - Call `runPmAgent()` with message and config (repoRoot = HAL root)
   - Return JSON response (reply, toolCalls, outboundRequest redacted)
3. **dev:hal**: Run `build:agents` before Vite so dist exists on first PM request

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

- `projects/hal-agents/` - Add build (tsconfig.build.json, package.json build script, type fixes, redact key-based)
- `vite.config.ts` - Load runPmAgent from dist, add build:agents to dev:hal
- `package.json` - dev:hal runs build:agents first
- `src/App.tsx` - Already has PM handler and diagnostics (no change)
