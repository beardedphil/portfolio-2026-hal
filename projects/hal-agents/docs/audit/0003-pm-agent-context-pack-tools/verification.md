# Verification (0003-pm-agent-context-pack-tools)

## UI-only verification

1. Open HAL workspace at `portfolio-2026-hal/`.
2. Ensure `.env` has `OPENAI_API_KEY` and `OPENAI_MODEL`.
3. Run `npm run dev` in the HAL root.
4. In HAL app, select **Project Manager** agent and send: "Summarize ticket 0001".
5. Confirm:
   - PM responds intelligently (may use tools to read ticket).
   - Diagnostics show outbound request (redacted, no sk- keys visible).
   - Tool calls (if any) appear in diagnostics.
6. Send: "List files in docs/tickets".
7. Confirm PM uses list_directory and returns directory contents.

## Edge cases

- Invalid path (e.g. `../../../etc/passwd`) → tool returns "Path escapes repo sandbox".
- Missing OPENAI_API_KEY → error returned with errorPhase: 'openai'.
