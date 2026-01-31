# Decisions: 0001-project-manager-agent-stub

## D1: Response Shape and Types

**Context**: Ticket requires `respond({ message, context }) -> { replyText, meta }` with minimal types so the API can evolve.

**Decision**: Export named types `RespondInput`, `RespondOutput`, `RespondMeta`, `RespondContext`. `meta` includes `source: 'hal-agents'` and `case: 'standup' | 'default'`.

**Rationale**: Keeps the contract explicit and allows HAL (or other callers) to type-check. No server or LLM in this slice.

## D2: Standup/Status Detection

**Context**: Ticket requires at least two cases: “standup”/“status” → standup summary; other → acknowledgement + checklist.

**Decision**: Normalize message to lowercase and treat as standup/status if it includes the substring “standup” or “status” (e.g. “give me a status” or “standup?” both trigger standup).

**Rationale**: Simple and deterministic; avoids overfitting to exact phrases.

## D3: Package Entry and No Build Step

**Context**: Module must be callable by HAL without a server; repo should stay framework-agnostic (pure TS).

**Decision**: Point `main` and `exports` to `src/agents/projectManager.ts` (source). No `dist` or build script in this repo; HAL’s Vite compiles the linked package.

**Rationale**: Minimal slice; single source of truth. If later we add a build step, we can switch to `dist/` without changing the contract.

## D4: HAL Integration for Verification

**Context**: Human-verifiable deliverable is “in the HAL app chat UI, when the user selects Project Manager and sends a message, the response clearly indicates it came from the hal-agents PM module.”

**Decision**: Implement HAL-side integration in this pass: HAL depends on `file:projects/hal-agents`, calls `respond()` when Project Manager is selected, and shows `replyText` and PM implementation source in diagnostics.

**Rationale**: Delivers the required UI-verifiable outcome. HAL-side changes can be referenced again in HAL ticket 0003 (use hal-agents PM stub).
