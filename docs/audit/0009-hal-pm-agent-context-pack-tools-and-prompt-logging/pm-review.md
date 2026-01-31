# PM Review: Ticket 0009

## Summary (1–3 bullets)

- PM requests now go through hal-agents `runPmAgent()`: context pack (user message, .cursor/rules, git status), read-only tools (list_directory, read_file, search_files), and redacted outbound request in Diagnostics.
- hal-agents (hal-agents) builds to `dist/`; HAL loads from dist so Node can run the agent without a TS loader. `dev:hal` runs `build:agents` before Vite.
- Redaction extended to key-based (api_key, authorization, secret, password, token, supabase keys) so .env-style values are redacted in Diagnostics.

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Acceptance criteria (context pack, tools, outbound request, redaction, Diagnostics) are implemented and wired.
- Verification is UI-only; depends on OPENAI_API_KEY and OPENAI_MODEL in HAL’s .env and hal-agents building cleanly.

## What to verify (UI-only)

- Select Project Manager, send “Summarize ticket 0007 and cite where it lives,” see PM reply and expand Diagnostics → Outbound Request JSON (redacted) and Tool Calls.
- If context pack or OpenAI fails, chat and Diagnostics show a clear error.

## Potential failures (ranked)

1. **Port 5173 in use** — Vite fails to start. Free the port or change port in vite.config.
2. **hal-agents build fails** — `dev:hal` fails at build:agents. Fix TS errors in hal-agents or run build manually from `projects/hal-agents`.
3. **Missing .env** — PM returns 503 “OpenAI API is not configured.” Add OPENAI_API_KEY and OPENAI_MODEL to HAL’s .env.

## Audit completeness check

- **Artifacts present**: plan, worklog, changed-files, decisions, verification, pm-review
- **Traceability gaps**: None

## Checklist

- [x] All acceptance criteria met
- [x] Verification steps pass
- [x] No unrequested changes (or documented in decisions.md)
- [x] Code follows project conventions
- [x] No secrets exposed in client bundle or diagnostics (redaction server-side)

## Sign-off

- [ ] Approved for merge
- Reviewer:
- Date:
