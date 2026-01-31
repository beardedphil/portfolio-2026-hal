# Plan: 0034 - Meta: Investigate why PM agent-created tickets are not "ready" (placeholders/missing sections)

## Goal

Identify and fix the root cause that leads to newly created tickets containing unresolved placeholders and/or missing required sections, so new tickets are immediately "Ready-to-start" per the Definition of Ready.

## Analysis

### Root cause

1. **Template not in context**: The PM agent was instructed to "follow the repo ticket template" but the content of `docs/templates/ticket.template.md` was **not** included in the context pack. The model only saw the Ready-to-start checklist (what "ready" means) and a short tool description—not the exact section headings and placeholder syntax to replace.
2. **Weak tool description**: The create_ticket tool said "Full markdown body (template: Title, Owner, Type, …)" without explicitly requiring concrete content and no angle-bracket placeholders.
3. **No post-create feedback**: After create_ticket succeeded, there was no readiness check on the stored body, so neither the model nor the user saw "what's missing" in-app when a ticket was created but not ready.

### Approach

1. **Inject ticket template into context pack**: In `buildContextPack`, read `docs/templates/ticket.template.md` (from repo root) and add a section "Ticket template (required structure for create_ticket)" with the template content and an instruction to replace every angle-bracket placeholder with concrete content so the ticket passes the Ready-to-start checklist.
2. **Strengthen create_ticket tool**: Update the tool description and `body_md` parameter to explicitly require all required sections filled with concrete content, no angle-bracket placeholders, and that the ticket must pass the Ready-to-start checklist.
3. **Post-create readiness check**: After a successful insert, run `evaluateTicketReady(input.body_md)` and add `ready` and `missingItems` to the success output so Diagnostics and the model see immediately whether the created ticket passes. If not ready, the fallback reply (when the model returns no text) includes the missing items so the user gets an in-app diagnostic.

## Implementation Steps

1. In projectManager.ts `buildContextPack`: add "Ticket template" section before "Ready-to-start checklist"; read `docs/templates/ticket.template.md` from config.repoRoot and append instruction to replace placeholders.
2. In projectManager.ts create_ticket tool: update description and body_md parameter description to require concrete content and no placeholders; extend success result type with `ready` and `missingItems`; after successful insert call `evaluateTicketReady(input.body_md.trim())` and add to output; update fallback reply when create_ticket succeeded to append missing-items message when `ready === false`.
3. Create audit folder and artifacts (plan, worklog, changed-files, decisions, verification, pm-review).
