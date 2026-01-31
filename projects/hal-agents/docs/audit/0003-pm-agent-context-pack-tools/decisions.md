# Decisions (0003-pm-agent-context-pack-tools)

## Use Vercel AI SDK

- Chose AI SDK (`ai`, `@ai-sdk/openai`) over raw OpenAI API for tool loop and Responses API support.
- `stepCountIs(10)` handles multi-step tool loop without manual message management.

## Capture Outbound Request via Custom Fetch

- createOpenAI accepts a `fetch` option. We wrap the global fetch to capture the first request body, parse as JSON, and redact before including in PmAgentResult.
- Only the first request is captured (diagnostics need a sample, not every step).

## Path Sandbox

- All file paths resolved via sandboxPath(repoRoot, path). Uses path.relative to detect escapes (starts with .. or is absolute).

## Rules Directory

- Default `.cursor/rules/`; configurable via `rulesDir` in PmAgentConfig.
- Reads .mdc files only; ignores other extensions.
