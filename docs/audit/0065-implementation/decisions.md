# Decisions: Supabase-only ticket storage (0065)

## Unrequested changes (required)

None - all changes are directly required by the ticket acceptance criteria.

## Design decisions

1. **sync-tickets.js kept for migration only**
   - Decision: Keep the script but remove DB→Docs writes and make docs/tickets optional
   - Rationale: Allows one-time migration of existing docs/tickets/*.md files to Supabase, but doesn't maintain the files going forward

2. **File system mode completely removed (not just hidden)**
   - Decision: Removed all file system mode code rather than just disabling it
   - Rationale: Cleaner codebase, no dead code paths, reduces maintenance burden

3. **Error messages updated to indicate Supabase-only**
   - Decision: All error messages when Supabase is not configured clearly state Supabase-only mode requirement
   - Rationale: Better user experience, clear guidance on what's needed

4. **Diagnostics show mode indicator**
   - Decision: Added "Supabase-only" mode indicator in debug panel
   - Rationale: Makes it clear to users/developers that file system mode is no longer available
