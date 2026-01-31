# Verification (0004-fix-pm-agent-stepcountis-and-sync-hal-submodule)

## UI-only verification

1. Open HAL workspace at `portfolio-2026-hal/`.
2. Ensure `.env` has `OPENAI_API_KEY` and `OPENAI_MODEL`.
3. Ensure HAL's `projects/hal-agents` submodule is updated to the commit that contains this fix (from the real repo `portfolio-2026-hal-agents`).
4. Run `npm run dev` in the HAL root.
5. In HAL app, select **Agent: Project Manager** and send: `ping`.
6. Confirm:
   - PM returns a real PM response (not the fallback stub `"[PM Agent] ... not yet implemented"`).
   - Diagnostics show an outbound request JSON (redacted) instead of the "not implemented" stub.
   - No SSR/import error in dev server logs about `ai` or `stepCountIs`.
7. Optionally send: "Summarize ticket 0001" and confirm PM can use tools and respond.

## Edge cases

- If submodule is not updated, HAL may still show the old stub or the stepCountIs error; update submodule and restart dev server.
- Missing OPENAI_API_KEY → error returned with errorPhase: 'openai'.
