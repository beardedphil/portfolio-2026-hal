# PM Review: Agent-artifacts system (0082)

## Likelihood of success: 90%

The implementation follows established patterns (Supabase schema, modal UI, agent completion handlers) and handles edge cases (empty states, error handling, multiple agent types). The main risk is that Supabase migration must be run before artifacts can be stored/displayed.

## Potential failures (ranked by likelihood)

### 1. **Supabase migration not run** (Medium)
- **Symptoms**: Artifacts section shows "No artifacts available" even after agents complete work, or errors in browser console about missing table
- **Diagnosis**: Check browser console for Supabase errors mentioning "agent_artifacts" table. Verify migration file exists at `docs/process/supabase-migrations/0082-agent-artifacts.sql`
- **Mitigation**: Run the migration SQL in Supabase SQL editor. Migration is idempotent (uses `if not exists`).

### 2. **Artifact insertion fails silently** (Low)
- **Symptoms**: Agents complete work but no artifacts appear in UI
- **Diagnosis**: Check browser console for errors from `insertAgentArtifact` function. Check Supabase logs for insert failures.
- **Mitigation**: Errors are logged to console. Verify Supabase credentials are valid and `agent_artifacts` table exists. Check that ticket_pk and repo_full_name are correctly retrieved.

### 3. **Artifacts not loading in ticket detail modal** (Low)
- **Symptoms**: Artifacts section shows "Loading artifacts…" indefinitely or shows error
- **Diagnosis**: Check browser console for Supabase query errors. Verify ticket_pk is correct (should be UUID, not legacy id).
- **Mitigation**: Verify Supabase connection is active. Check that `fetchTicketArtifacts` is called with correct ticket_pk. Verify RLS policies allow reads.

### 4. **Artifact viewer modal doesn't open** (Very Low)
- **Symptoms**: Clicking artifact item doesn't open viewer modal
- **Diagnosis**: Check browser console for JavaScript errors. Verify `handleOpenArtifact` is called and `artifactViewer` state is set.
- **Mitigation**: Verify artifact data structure matches `SupabaseAgentArtifactRow` type. Check that modal component receives correct props.

### 5. **Multiple artifacts of same type not handled** (Very Low)
- **Symptoms**: Only one artifact per agent type is shown even if multiple exist
- **Diagnosis**: Check Supabase to see if multiple artifacts exist for same ticket and agent type. Current implementation shows only most recent.
- **Mitigation**: This is by design (shows most recent per type). If historical artifacts are needed, UI can be extended to show all.

## In-app diagnostics

- **Artifacts section**: Shows loading state, empty state, or list of artifacts
- **Artifact viewer**: Shows report title, agent type, timestamp, and body content
- **Browser console**: Logs errors from artifact insertion and fetching (for debugging)

## Verification checklist

- [ ] Artifacts section appears in ticket detail modal (even when empty)
- [ ] Implementation Agent completion creates artifact visible in UI
- [ ] QA Agent completion creates artifact visible in UI
- [ ] Artifact viewer opens when clicking artifact item
- [ ] Artifact viewer displays correct title, agent type, timestamp, and body
- [ ] Artifacts persist after page refresh
- [ ] Multiple agent types can have artifacts (Implementation, QA, etc.)
- [ ] Empty state message appears when no artifacts exist
