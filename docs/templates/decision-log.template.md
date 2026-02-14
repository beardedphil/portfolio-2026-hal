# Decision Log Template

Use this template when creating a "Decisions" artifact for implementation tickets. Copy the structure below and fill in each decision entry as you make key implementation choices.

## Decision Entry Format

For each significant decision, document:

### Context

Brief description of the situation or problem that required a decision. What were you trying to achieve? What constraints or requirements influenced the decision?

### Decision

State the decision clearly and concisely. What did you choose to do?

### Alternatives Considered

List the alternative approaches you evaluated. For each alternative, briefly explain what it would have involved.

### Trade-offs

What are the benefits and drawbacks of the chosen approach? What did you gain, and what did you give up or accept as limitations?

### Consequences / Follow-ups

What are the immediate and potential future impacts of this decision? Are there any follow-up tasks, technical debt, or areas that may need attention later?

### Links

Reference related tickets, PRs, files, or documentation that are relevant to this decision:
- Tickets: HAL-XXXX
- Files: `path/to/file.ts`
- PRs: #XX
- Documentation: `docs/path/to/doc.md`

---

## Example Decision Entry

### Context

We need to store implementation artifacts in Supabase so they're accessible from the HAL UI. The implementation agent runs in cloud environments without direct Supabase access, so we need a way to store artifacts without requiring Supabase credentials in the cloud environment.

### Decision

Use HAL API endpoints (`POST /api/artifacts/insert-implementation`) that the implementation agent calls directly via HTTP. The HAL server has Supabase credentials and handles the database operations.

### Alternatives Considered

1. **Direct Supabase access from cloud agent** - Would require exposing Supabase credentials in the cloud environment, which is a security risk.
2. **Queue file approach** - Agent writes to `.hal-tool-call-queue.json` and something else processes it after merge to main. This delays artifact availability until merge.
3. **GitHub API webhook** - Use GitHub webhooks to trigger artifact storage, but this adds complexity and still requires merge to main.

### Trade-offs

**Benefits:**
- Artifacts are available immediately without waiting for merge to main
- No Supabase credentials needed in cloud environment
- Simple HTTP API contract that agents can call directly

**Drawbacks:**
- Requires HAL to be deployed and accessible from cloud environments
- Adds a network dependency (agent must be able to reach HAL API)

### Consequences / Follow-ups

- HAL must be deployed to a publicly accessible URL (e.g., Vercel)
- The `.hal/api-base-url` file must be present in the repo so agents know where to call
- Future: Consider adding retry logic for network failures
- Future: Consider adding artifact validation on the server side

### Links

- Ticket: HAL-0082 (Agent artifacts system)
- Documentation: `docs/process/agent-supabase-api-paradigm.mdc`
- API endpoint: `/api/artifacts/insert-implementation`

---

## Notes

- If no significant decisions were made during implementation, state that explicitly: "No significant implementation decisions were required for this ticket. The implementation followed standard patterns and existing conventions."
- Focus on decisions that affect maintainability, architecture, or future work. Minor implementation details don't need full entries.
- Each decision entry should be self-contained and understandable to someone reviewing the code later.
