# Worklog: 0049 - Ensure All Newly Created Tickets Have Title with ID Prefix

- **projectManager.ts**: Updated line 511 to use em dash (` — `) instead of regular dash (` - `) when formatting the title with ID prefix: `${id} — ${input.title.trim()}`
- **projectManager.ts**: Updated PM_SYSTEM_INSTRUCTIONS to clarify that create_ticket tool automatically prefixes titles with "NNNN —" format, so agents should provide titles without the ID prefix.
- **projectManager.ts**: Updated create_ticket tool description to mention automatic title prefixing with "NNNN —" format (em dash).
- **projectManager.ts**: Updated create_ticket tool parameter description for `title` to clarify it should not include the ID prefix.
- **ticket.template.md**: Updated Title field example to show "NNNN — <short title>" format (e.g. "0049 — Update ticket title format").
- **Audit**: Created docs/audit/0049-implementation/ (plan, worklog, changed-files, decisions, verification, pm-review).
