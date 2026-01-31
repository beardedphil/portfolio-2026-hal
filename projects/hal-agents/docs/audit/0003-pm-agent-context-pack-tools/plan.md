# Plan (0003-pm-agent-context-pack-tools)

## Goal

Implement the PM agent core in hal-agents: build a context pack, define read-only tools, execute a tool loop against OpenAI Responses API, and return results with redacted outbound request for diagnostics.

## Approach

### 1. Dependencies

- Add `ai`, `@ai-sdk/openai`, `zod` to package.json.

### 2. Context Pack Builder

- Build context pack containing:
  - User message (verbatim)
  - Key repo rules from `.cursor/rules/` directory (read .mdc files)
  - Repo state snapshot (`git status -sb` output)

### 3. Read-Only Tools

- `list_directory`: List files in a directory (sandboxed to repo root)
- `read_file`: Read file contents (max 500 lines, sandboxed)
- `search_files`: Regex search across files (glob filter optional, sandboxed)

### 4. Path Sandbox

- Create `src/utils/sandbox.ts` to resolve paths within repo root and prevent traversal.

### 5. Redaction Utility

- Create `src/utils/redact.ts` that redacts:
  - OpenAI API keys (`sk-...`)
  - JWT tokens (`eyJ...`)
  - Supabase URLs

### 6. Tool Loop with OpenAI Responses API

- Use Vercel AI SDK `generateText` with `createOpenAI({ apiKey })`, `openai.responses(model)`
- Tools defined with `tool({ description, inputSchema: z.object(...), execute })`
- `stopWhen: stepCountIs(10)` for max 10 tool iterations
- Custom fetch to capture first outbound request for redaction

### 7. Export runPmAgent

- `runPmAgent(message, config) -> PmAgentResult`
- Returns `{ reply, toolCalls, outboundRequest, error?, errorPhase? }`
- Errors during context pack or OpenAI calls returned with phase info

## Tasks

1. Add ai, @ai-sdk/openai, zod dependencies.
2. Create src/utils/redact.ts.
3. Create src/utils/sandbox.ts.
4. Create src/agents/tools.ts with list_directory, read_file, search_files.
5. Update src/agents/projectManager.ts with runPmAgent, context pack, tool loop.
6. Create audit artifacts.
