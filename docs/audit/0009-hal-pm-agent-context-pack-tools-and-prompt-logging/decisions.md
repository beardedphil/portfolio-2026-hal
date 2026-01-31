# Decisions: Ticket 0009

## D1: Split work between HAL and hal-agents

**Decision**: PM agent core logic goes in hal-agents (ticket 0003), HAL contains only the endpoint wrapper and UI.

**Rationale**: 
- hal-agents is designed to be a reusable agent library
- Keeps HAL focused on UI/integration concerns
- Enables parallel development by different agents

**Trade-off**: HAL depends on hal-agents#0003 being completed first. Until then, the endpoint will return an error or stub.

## D2: Endpoint returns structured response (not raw OpenAI JSON)

**Decision**: `/api/pm/respond` returns `{ reply, toolCalls, outboundRequest, error? }` rather than raw OpenAI response.

**Rationale**:
- Cleaner API for the frontend
- hal-agents can evolve its internal OpenAI usage without breaking HAL
- Redacted outbound request is already processed server-side

## D3: Diagnostics shows outbound request in collapsible section

**Decision**: Add a collapsible "Outbound Request JSON" section in Diagnostics (not inline in chat).

**Rationale**:
- Outbound request JSON can be very large
- Keeps chat transcript focused on the conversation
- Users who want to debug can expand Diagnostics

## D4: Stub behavior until hal-agents#0003 is ready

**Decision**: The endpoint will check if `runPmAgent` is available. If not (or if it throws), return a clear error message.

**Rationale**: Allows HAL-side work to be completed and tested structurally before hal-agents is ready.
