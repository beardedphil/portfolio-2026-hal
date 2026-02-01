# Changed Files: Auto-move tickets on agent completion (0061)

## Modified files

### `src/App.tsx`
- Added state: `implAgentTicketId`, `qaAgentTicketId`, `autoMoveDiagnostics`
- Added `DiagnosticsInfo` type field: `autoMoveDiagnostics`
- Added helper functions:
  - `extractTicketId`: Extracts ticket ID from message content
  - `addAutoMoveDiagnostic`: Adds diagnostic entries
  - `moveTicketToColumn`: Moves ticket via Supabase API
- Updated Implementation Agent handler: Extract ticket ID on start, trigger auto-move on completion
- Updated QA Agent handler: Extract ticket ID on start, trigger auto-move on PASS completion
- Added auto-move diagnostics UI section in Diagnostics panel
- Updated `handleSend` dependencies to include new callbacks
- Updated `handleDisconnect` to clear ticket IDs and diagnostics

### `src/index.css`
- Added styles for auto-move diagnostics:
  - `.diag-auto-move-list`: Container for diagnostic entries
  - `.diag-auto-move-entry`: Individual diagnostic entry
  - `.diag-auto-move-error`: Error entry styling (red border/background)
  - `.diag-auto-move-info`: Info entry styling (green border/background)
  - `.diag-auto-move-time`: Timestamp styling
  - `.diag-auto-move-message`: Message text styling
  - `.diag-auto-move-more`: "More entries" indicator
