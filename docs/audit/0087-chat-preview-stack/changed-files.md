# Changed Files: Chat Preview Stack with Agent Status Boxes (0087)

## Modified Files

- `src/App.tsx`
  - **Previous changes (chat preview stack):**
    - Added state for `openChatTarget`, `qaGroupExpanded`, `implGroupExpanded`
    - Added `getChatTargetPreview` helper function for PM/Standup preview text
    - Replaced dropdown selector with chat preview stack component
    - Modified Kanban region to conditionally render iframe or chat window
    - Added chat window component with close button and "Return to Kanban" link
  - **Current changes (agent status boxes):**
    - Added `formatAgentStatus` helper function to format agent status text
    - Removed full chat UI from Chat pane (removed lines 2656-3167: agent stub banners, status panels, conversation lists, chat transcripts, composers)
    - Added agent status boxes section at bottom of Chat pane
    - Status boxes filter to show only working agents (not idle, not completed)

- `src/index.css`
  - **Previous changes (chat preview stack):**
    - Added CSS for `.chat-preview-stack`, `.chat-preview-pane`, `.chat-preview-active`
    - Added CSS for `.chat-preview-group`, `.chat-preview-group-header`, `.chat-preview-group-items`
    - Added CSS for `.chat-window-container`, `.chat-window-header`, `.chat-window-close`, `.chat-window-return-link`
  - **Current changes (agent status boxes):**
    - Added CSS for `.agent-status-boxes` container (flex layout, positioned at bottom)
    - Added CSS for `.agent-status-box`, `.agent-status-box-header`, `.agent-status-box-name`, `.agent-status-box-status`
    - Added status-specific styling (working states, failed state, error display)
    - Status boxes use `margin-top: auto` to stick to bottom of Chat pane
