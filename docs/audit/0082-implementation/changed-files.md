# Changed Files: Agent-artifacts system (0082)

## Created files

### `docs/process/supabase-migrations/0082-agent-artifacts.sql`
- Database migration for `agent_artifacts` table
- Includes table schema, indexes, foreign key constraints, and triggers

## Modified files

### `projects/kanban/src/App.tsx`
- Added `SupabaseAgentArtifactRow` type definition
- Added `getAgentTypeDisplayName` helper function
- Added `ArtifactReportViewer` component (modal for viewing artifact reports)
- Added `ArtifactsSection` component (displays artifacts list in ticket detail)
- Updated `TicketDetailModal` to include artifacts section
- Added state: `detailModalArtifacts`, `detailModalArtifactsLoading`, `artifactViewer`
- Added `fetchTicketArtifacts` function to query Supabase
- Updated ticket detail modal effect to fetch artifacts
- Added handlers: `handleOpenArtifact`, `handleCloseArtifact`
- Updated `handleCloseTicketDetail` to also close artifact viewer

### `projects/kanban/src/index.css`
- Added styles for artifacts section:
  - `.artifacts-section`: Container with border-top separator
  - `.artifacts-section-title`: Section heading
  - `.artifacts-loading`, `.artifacts-empty`: Loading and empty states
  - `.artifacts-list`: Unordered list container
  - `.artifacts-item`: List item wrapper
  - `.artifacts-item-button`: Clickable artifact button
  - `.artifacts-item-title`: Artifact title text
  - `.artifacts-item-meta`: Timestamp text
- Added dark theme adjustments for artifacts

### `vite.config.ts`
- Added `insertAgentArtifact` helper function
- Updated Implementation Agent completion handler:
  - Get ticket_pk and repo_full_name from ticket
  - Build artifact body from summary, PR URL, and worklog
  - Insert artifact with agent_type: 'implementation'
- Updated QA Agent completion handler:
  - Get ticket_pk and repo_full_name from ticket
  - Read qa-report.md content if available
  - Insert artifact with agent_type: 'qa'
