# Plan: Agent-artifacts system (0082)

## Goal
Add an agent-artifacts system so each ticket can store and display agent completion reports (Implementation, QA, Human-in-the-Loop, and future agent types) in Supabase.

## Approach

1. **Create Supabase schema**
   - Create `agent_artifacts` table with fields: artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at
   - Add indexes for efficient queries by ticket and agent type
   - Add foreign key constraint to tickets table

2. **Build UI components**
   - Add `ArtifactsSection` component to display artifacts in ticket detail modal
   - Create `ArtifactReportViewer` component for viewing individual artifact reports
   - Add empty state when no artifacts exist
   - Support grouping by agent type (show most recent per type)

3. **Integrate with ticket detail modal**
   - Fetch artifacts when ticket detail modal opens
   - Display artifacts section below ticket body
   - Handle loading and error states

4. **Add agent artifact insertion**
   - Create `insertAgentArtifact` helper function
   - Implementation Agent: Insert artifact when work completes (include summary, PR URL, worklog)
   - QA Agent: Insert artifact when QA completes (read qa-report.md content)

5. **Add CSS styling**
   - Style artifacts section and list items
   - Style artifact report viewer modal
   - Support light and dark themes

## File touchpoints

- `docs/process/supabase-migrations/0082-agent-artifacts.sql`: Database migration
- `projects/kanban/src/App.tsx`: UI components, state management, Supabase queries
- `projects/kanban/src/index.css`: Styling for artifacts section and viewer
- `vite.config.ts`: Agent artifact insertion logic
