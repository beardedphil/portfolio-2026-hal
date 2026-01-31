# Ticket

- **ID**: `0003`
- **Title**: PM agent core: context pack builder + read-only tools + tool loop
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Implement the PM agent core in hal-agents: build a context pack, define read-only tools, execute a tool loop against OpenAI Responses API, and return results with redacted outbound request for diagnostics.

## Human-verifiable deliverable (UI-only)

When HAL's `/api/pm/respond` endpoint calls the exported `runPmAgent()` function:
- The PM responds intelligently to questions about the repo (e.g., "Summarize ticket 0001")
- Tool calls (list_directory, read_file, search_files) are executed and results included
- The response includes a redacted copy of the outbound OpenAI request for HAL to display in Diagnostics

## Acceptance criteria (UI-only)

- [ ] Export `runPmAgent(message, config)` from `src/agents/projectManager.ts` that:
  - [ ] Builds a **context pack** containing:
    - User message (verbatim)
    - Key repo rules from `.cursor/rules/` directory
    - Repo state snapshot (`git status -sb` output)
  - [ ] Sends request to OpenAI Responses API with PM system instructions and tool definitions
  - [ ] Executes a **tool loop** (max 10 iterations) for read-only tools:
    - `list_directory`: List files in a directory (sandboxed to repo root)
    - `read_file`: Read file contents (max 500 lines, sandboxed)
    - `search_files`: Regex search across files (sandboxed)
  - [ ] Returns structured result: `{ reply, toolCalls, outboundRequest, error? }`
- [ ] Create `src/utils/redact.ts` that redacts sensitive values from the outbound request:
  - OpenAI API keys (`sk-...`)
  - JWT tokens (`eyJ...`)
  - Supabase URLs
- [ ] Tool calls and their outputs are captured in the response for HAL to display
- [ ] Errors during context pack build or OpenAI calls are returned in `error` field with phase info

## Constraints

- **Read-only tools only**: No file writes, no git commits, no external mutations
- All file paths must be sandboxed to the provided `repoRoot` (prevent path traversal)
- No secrets in the exported response (use redaction utility)
- Keep implementation focused on what HAL needs to call it

## Non-goals

- HAL API endpoint (separate ticket 0009)
- HAL UI/Diagnostics updates (separate ticket 0009)
- Write-capable tools (edit files, run commands) — future ticket
- Kanban mutations — future ticket

## Implementation notes (optional)

**Suggested interface:**

```typescript
export interface PmAgentConfig {
  repoRoot: string;           // Absolute path to repo
  openaiApiKey: string;       // Passed from HAL server
  openaiModel: string;
  rulesDir?: string;          // Default: .cursor/rules/
}

export interface PmAgentResult {
  reply: string;                    // Final assistant message text
  toolCalls: ToolCallRecord[];      // All tool calls made during response
  outboundRequest: object;          // Redacted first OpenAI request (for diagnostics)
  error?: string;                   // Error message if failed
  errorPhase?: 'context-pack' | 'openai' | 'tool';
}

export async function runPmAgent(
  message: string,
  config: PmAgentConfig
): Promise<PmAgentResult>
```

**PM System Instructions (suggested):**

```
You are the Project Manager agent for HAL. Your job is to help users understand 
the codebase, review tickets, and provide project guidance.

You have access to read-only tools to explore the repository. Use them to answer 
questions about code, tickets, and project state.

Always cite file paths when referencing specific content.
```

**Tool definitions for OpenAI:**

- `list_directory`: `{ path: string }` — returns directory listing
- `read_file`: `{ path: string, maxLines?: number }` — returns file contents
- `search_files`: `{ pattern: string, glob?: string }` — regex search

## Audit artifacts required (implementation agent)

Create `docs/audit/0003-pm-agent-context-pack-tools/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

# Ticket

- **ID**: `0003`
- **Title**: PM agent core: context pack builder + read-only tools + tool loop
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Implement the PM agent core in hal-agents: build a context pack, define read-only tools, execute a tool loop against OpenAI Responses API, and return results with redacted outbound request for diagnostics.

## Human-verifiable deliverable (UI-only)

When HAL's `/api/pm/respond` endpoint calls the exported `runPmAgent()` function:
- The PM responds intelligently to questions about the repo (e.g., "Summarize ticket 0001")
- Tool calls (list_directory, read_file, search_files) are executed and results included
- The response includes a redacted copy of the outbound OpenAI request for HAL to display in Diagnostics

## Acceptance criteria (UI-only)

- [ ] Export `runPmAgent(message, config)` from `src/agents/projectManager.ts` that:
  - [ ] Builds a **context pack** containing:
    - User message (verbatim)
    - Key repo rules from `.cursor/rules/` directory
    - Repo state snapshot (`git status -sb` output)
  - [ ] Sends request to OpenAI Responses API with PM system instructions and tool definitions
  - [ ] Executes a **tool loop** (max 10 iterations) for read-only tools:
    - `list_directory`: List files in a directory (sandboxed to repo root)
    - `read_file`: Read file contents (max 500 lines, sandboxed)
    - `search_files`: Regex search across files (sandboxed)
  - [ ] Returns structured result: `{ reply, toolCalls, outboundRequest, error? }`
- [ ] Create `src/utils/redact.ts` that redacts sensitive values from the outbound request:
  - OpenAI API keys (`sk-...`)
  - JWT tokens (`eyJ...`)
  - Supabase URLs
- [ ] Tool calls and their outputs are captured in the response for HAL to display
- [ ] Errors during context pack build or OpenAI calls are returned in `error` field with phase info

## Constraints

- **Read-only tools only**: No file writes, no git commits, no external mutations
- All file paths must be sandboxed to the provided `repoRoot` (prevent path traversal)
- No secrets in the exported response (use redaction utility)
- Keep implementation focused on what HAL needs to call it

## Non-goals

- HAL API endpoint (separate ticket 0009)
- HAL UI/Diagnostics updates (separate ticket 0009)
- Write-capable tools (edit files, run commands) — future ticket
- Kanban mutations — future ticket

## Implementation notes (optional)

**Suggested interface:**

```typescript
export interface PmAgentConfig {
  repoRoot: string;           // Absolute path to repo
  openaiApiKey: string;       // Passed from HAL server
  openaiModel: string;
  rulesDir?: string;          // Default: .cursor/rules/
}

export interface PmAgentResult {
  reply: string;                    // Final assistant message text
  toolCalls: ToolCallRecord[];      // All tool calls made during response
  outboundRequest: object;          // Redacted first OpenAI request (for diagnostics)
  error?: string;                   // Error message if failed
  errorPhase?: 'context-pack' | 'openai' | 'tool';
}

export async function runPmAgent(
  message: string,
  config: PmAgentConfig
): Promise<PmAgentResult>
```

**PM System Instructions (suggested):**

```
You are the Project Manager agent for HAL. Your job is to help users understand 
the codebase, review tickets, and provide project guidance.

You have access to read-only tools to explore the repository. Use them to answer 
questions about code, tickets, and project state.

Always cite file paths when referencing specific content.
```

**Tool definitions for OpenAI:**

- `list_directory`: `{ path: string }` — returns directory listing
- `read_file`: `{ path: string, maxLines?: number }` — returns file contents
- `search_files`: `{ pattern: string, glob?: string }` — regex search

## Audit artifacts required (implementation agent)

Create `docs/audit/0003-pm-agent-context-pack-tools/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`
