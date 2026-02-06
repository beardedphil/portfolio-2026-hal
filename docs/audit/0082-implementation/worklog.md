# Worklog: Agent-artifacts system (0082)

## Implementation steps

1. **Created Supabase migration**
   - Created `docs/process/supabase-migrations/0082-agent-artifacts.sql`
   - Defined `agent_artifacts` table schema with all required fields
   - Added indexes for efficient queries (ticket_pk, repo_full_name, agent_type)
   - Added foreign key constraint to tickets table with cascade delete
   - Added trigger for auto-updating `updated_at` timestamp

2. **Added TypeScript types**
   - Added `SupabaseAgentArtifactRow` type to `App.tsx`
   - Defined agent types: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'

3. **Created UI components**
   - `getAgentTypeDisplayName`: Helper function to get human-readable agent type names
   - `ArtifactReportViewer`: Modal component for viewing artifact reports (title, agent type, timestamp, body)
   - `ArtifactsSection`: Component to display artifacts list in ticket detail modal
   - Both components follow existing modal patterns (scroll lock, focus trap, keyboard navigation)

4. **Integrated with ticket detail modal**
   - Added state: `detailModalArtifacts`, `detailModalArtifactsLoading`, `artifactViewer`
   - Created `fetchTicketArtifacts` function to query Supabase for artifacts by ticket_pk
   - Updated ticket detail modal to fetch artifacts when modal opens
   - Added `ArtifactsSection` to ticket detail modal body
   - Added `ArtifactReportViewer` modal for viewing individual artifacts

5. **Added CSS styling**
   - Styled artifacts section with border-top separator
   - Styled artifacts list items as clickable buttons
   - Added hover and focus states
   - Styled artifact report viewer modal (reuses ticket detail modal styles)
   - Added dark theme support

6. **Added agent artifact insertion**
   - Created `insertAgentArtifact` helper function in `vite.config.ts`
   - Implementation Agent: Insert artifact when status is 'FINISHED'
     - Get ticket_pk and repo_full_name from ticket
     - Build report body from summary, PR URL, and worklog if available
     - Insert with agent_type: 'implementation'
   - QA Agent: Insert artifact when status is 'FINISHED'
     - Get ticket_pk and repo_full_name from ticket
     - Read qa-report.md content if available, otherwise use summary
     - Insert with agent_type: 'qa'

7. **Fixed TypeScript errors**
   - Removed unused `supabaseUrl` and `supabaseAnonKey` props from `TicketDetailModal`
