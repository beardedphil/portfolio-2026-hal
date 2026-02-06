# Changed Files: Chat Preview Stack (0087)

## Modified Files

- `src/App.tsx`
  - Added state for `openChatTarget`, `qaGroupExpanded`, `implGroupExpanded`
  - Added `getChatTargetPreview` helper function for PM/Standup preview text
  - Replaced dropdown selector with chat preview stack component
  - Modified Kanban region to conditionally render iframe or chat window
  - Added chat window component with close button and "Return to Kanban" link
  - Updated click handlers to set `openChatTarget` when previews are clicked

- `src/index.css`
  - Added CSS for `.chat-preview-stack`, `.chat-preview-pane`, `.chat-preview-active`
  - Added CSS for `.chat-preview-group`, `.chat-preview-group-header`, `.chat-preview-group-items`
  - Added CSS for `.chat-window-container`, `.chat-window-header`, `.chat-window-close`, `.chat-window-return-link`
  - Added styling for nested preview panes and empty states
