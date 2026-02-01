# Worklog: Auto-move tickets on agent completion (0061)

## Implementation steps

1. **Added state management**
   - Added `implAgentTicketId` and `qaAgentTicketId` state to track current ticket IDs
   - Added `autoMoveDiagnostics` state to track auto-move errors and info messages

2. **Created helper functions**
   - `extractTicketId`: Extracts 4-digit ticket ID from message content using regex patterns
   - `addAutoMoveDiagnostic`: Adds diagnostic entries to the diagnostics state
   - `moveTicketToColumn`: Moves a ticket to a target column via Supabase API, calculates position, handles errors

3. **Updated agent handlers**
   - Implementation Agent: Extract and store ticket ID when agent starts
   - Implementation Agent: Trigger auto-move to QA column when `stage === 'completed'`
   - QA Agent: Extract and store ticket ID when agent starts
   - QA Agent: Trigger auto-move to Human in the Loop when `stage === 'completed'` and verdict is PASS

4. **Added diagnostics UI**
   - Added auto-move diagnostics section to Diagnostics panel
   - Shows last 10 diagnostic entries with timestamps
   - Color-coded entries (error = red, info = green)

5. **Updated dependencies**
   - Added new callbacks to `handleSend` dependency array
   - Clear ticket IDs and diagnostics on disconnect

6. **Added CSS styles**
   - Styled auto-move diagnostic entries with appropriate colors and layout
