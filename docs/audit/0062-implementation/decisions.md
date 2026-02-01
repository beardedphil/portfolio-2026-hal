# Decisions: QA agent status/progress persistence (0062)

## Design decisions

1. **Mirror Implementation Agent pattern**
   - Used the same persistence approach as Implementation Agent (0050) for consistency
   - Same localStorage key naming convention
   - Same progress message format (timestamp + message)

2. **Progress messages in both conversation and state**
   - Progress messages are added to both the conversation (as system messages) and the progress state array
   - This ensures they persist in the conversation history AND are available for the status panel

3. **Status reset delay**
   - Reset status to 'idle' after 5 seconds when completed/failed
   - This prevents stale "running" indicators while still showing final status briefly
   - Matches the acceptance criteria: "If no QA run is active, the QA chat does not show stale 'running' indicators"

4. **Status panel visibility**
   - Status panel shows when `qaAgentRunStatus !== 'idle' || qaAgentError`
   - This ensures the panel is visible during active runs and when there are errors
   - After the 5-second delay, status resets to 'idle' and panel hides

5. **Progress feed display**
   - Shows last 5 progress messages (same as Implementation Agent)
   - Messages include timestamps for context
