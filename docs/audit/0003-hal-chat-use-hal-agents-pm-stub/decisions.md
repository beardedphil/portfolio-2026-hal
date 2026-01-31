# Decisions: 0003-hal-chat-use-hal-agents-pm-stub

## D1: Direct Import from Submodule via Alias

**Context**: HAL must call the PM module living in the `projects/hal-agents` submodule (portfolio-2026-hal-agents). TypeScript/Vite do not resolve outside the app by default.

**Options Considered**:
1. **Path alias** — Map `@hal-agents` to `projects/hal-agents/src` in Vite and TS so HAL can `import { respond } from '@hal-agents/agents/projectManager'`.
2. **Wrapper module in HAL** — A file under `src/` that re-exports from a relative path like `../../projects/hal-agents/src/agents/projectManager` (may still require TS include).
3. **Publish hal-agents as npm package** — Would add release and versioning overhead; ticket says "direct import from submodule is fine."

**Decision**: Path alias (Option 1)

**Rationale**:
- Keeps a single, clear integration point.
- Vite bundles the submodule when it resolves the import; no extra build step.
- Ticket allows "direct import from submodule" and suggests a wrapper only "if TypeScript/Vite cannot import TS directly"; alias satisfies direct import.

**Config**:
- Vite: `resolve.alias['@hal-agents'] = path.resolve(__dirname, 'projects/hal-agents/src')`.
- TS: `paths: { "@hal-agents/*": ["projects/hal-agents/src/*"] }`, `include` extended with `projects/hal-agents/src`.

## D2: PM Stub Implemented Inside HAL Repo Submodule

**Context**: Ticket 0003 says "HAL uses the projects/hal-agents submodule as the source of PM agent logic." The submodule had no TypeScript yet.

**Decision**: Implement the minimal PM stub in `projects/hal-agents/src/agents/projectManager.ts` as part of this ticket.

**Rationale**:
- Delivers the required "human-verifiable" behavior: PM replies from hal-agents with `[PM@hal-agents]`.
- Keeps the task small and avoids depending on a separate implementation of hal-agents ticket 0001 in another PR.
- Submodule is the single source of PM logic; HAL only imports and displays.

## D3: PM Implementation Source in Diagnostics

**Context**: Acceptance criteria require "PM implementation source = hal-agents (not 'inline')".

**Decision**: Show `pmImplementationSource` as `hal-agents` when the selected agent is Project Manager, and `inline` when the selected agent is Implementation Agent (stub).

**Rationale**:
- When user is talking to PM, the source of that agent is hal-agents.
- When user is talking to Implementation Agent, the PM is not in use; "inline" indicates the other agent is the inline stub.
