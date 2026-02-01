# Decisions: 0049 - Ensure All Newly Created Tickets Have Title with ID Prefix

## Trade-offs and Assumptions

- **Em dash vs regular dash**: Used em dash (`—`) instead of regular dash (`-`) for better visual distinction and to match the user's example format ("0049 — Update …").
- **Title field in body_md**: The Title line in the ticket body markdown is not automatically updated by the tool (it's provided by the PM agent). The template now shows the format, so the PM agent should follow it when creating tickets. The Supabase `title` field (which is what's displayed in the kanban UI) is automatically formatted by the tool.
- **Backward compatibility**: Existing tickets will not be automatically updated. Only newly created tickets will have the new format. This is acceptable as the requirement is for "newly created tickets."

## Unrequested changes (required)

None. All changes are directly required by the acceptance criteria.
