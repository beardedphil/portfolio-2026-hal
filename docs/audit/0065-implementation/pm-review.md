# PM Review: Supabase-only ticket storage (0065)

## Likelihood of success: 95%

High confidence. The changes are straightforward removals of file system mode code and updates to require Supabase. The existing Supabase integration is already well-tested.

## Potential failures (ranked)

1. **Migration path unclear** (Low risk)
   - **Symptoms**: Users with existing docs/tickets/*.md files don't know how to migrate
   - **Diagnosis**: Check if sync-tickets.js migration path is documented
   - **Mitigation**: sync-tickets.js still supports Docs→DB migration (one-time)

2. **Agent workflows break** (Low risk)
   - **Symptoms**: Implementation/QA agents fail when Supabase not configured
   - **Diagnosis**: Check agent error messages - should clearly indicate Supabase requirement
   - **Mitigation**: Error messages updated to guide users to connect Supabase

3. **Polling not working** (Very low risk)
   - **Symptoms**: Ticket edits in Supabase don't appear in UI
   - **Diagnosis**: Check debug panel for polling status and last refresh time
   - **Mitigation**: Polling already implemented and tested in previous tickets

4. **Detail modal shows error when Supabase not connected** (Expected behavior)
   - **Symptoms**: Detail modal shows error instead of ticket content
   - **Diagnosis**: This is correct behavior - verify error message is clear
   - **Mitigation**: Error message updated to guide user to connect Supabase

## In-app diagnostics

- Debug panel shows "Mode: Supabase-only" indicator
- Debug panel shows Supabase connection status
- Debug panel shows last refresh time and errors
- Error messages in UI clearly indicate Supabase connection required
