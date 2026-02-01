# Plan: Ticket Title ID Prefix Enforcement

## Approach

1. **Create normalization utility function** that ensures `- **Title**:` line has format `<ID> — <title>` (with em dash)
2. **Update sync-tickets.js** to normalize Title line when syncing from DB to docs
3. **Update PM agent create_ticket tool** to include ID prefix in body_md Title line when creating new tickets
4. **Update PM agent update_ticket_body tool** to normalize Title line when updating tickets
5. **Update extractTitleFromContent in App.tsx** to handle ID prefix and show in-app diagnostics if missing
6. **Add diagnostics logging** when normalization occurs (visible in UI)

## File touchpoints

- `scripts/sync-tickets.js` - normalize Title when writing docs from DB
- `projects/hal-agents/src/agents/projectManager.ts` - normalize in create_ticket and update_ticket_body tools
- `projects/kanban/src/App.tsx` - normalize in extractTitleFromContent and show diagnostics
- `docs/templates/ticket.template.md` - update template to show ID prefix format

## Normalization logic

- Extract ticket ID from filename or ticket ID parameter
- Check if Title line starts with `<ID> — ` (em dash)
- If not, normalize: remove any existing ID prefix, then prepend `<ID> — `
- Use em dash (—) not hyphen (-) for consistency with ticket 0048 example
