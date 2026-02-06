# Plan: Chat Preview Stack (0087)

## Approach

1. **Replace dropdown with preview stack**
   - Remove the dropdown selector in chat header
   - Create a new chat preview stack component showing all available chats
   - Each preview pane shows agent name/role and last message preview

2. **Implement collapsible groups**
   - QA group: collapsible, shows "QA Lead" when collapsed, expands to show QA agent instances
   - Implementation group: collapsible, shows "Implementation Lead" when collapsed, expands to show Implementation agent instances
   - Project Manager and Standup appear as individual preview panes (not grouped)

3. **Chat window state management**
   - Add state for `isChatOpen` and `openChatTarget` (ChatTarget | null)
   - When a preview is clicked, set `isChatOpen = true` and `openChatTarget` to the selected chat
   - When chat is closed, set `isChatOpen = false` and `openChatTarget = null`

4. **Replace Kanban iframe with chat window**
   - Conditionally render Kanban iframe or chat window based on `isChatOpen`
   - Chat window takes full space of the Kanban region when open
   - Include close button (X) and "Return to Kanban" link in chat window header

5. **Visual highlighting**
   - Highlight the currently open chat preview pane in the stack
   - Use CSS to show active state

## File Touchpoints

- `src/App.tsx`: Main implementation
  - Add state for chat open/closed
  - Replace dropdown with preview stack component
  - Implement collapsible groups logic
  - Add chat window that replaces Kanban iframe
  - Add close handlers
- `src/index.css`: Styling for preview stack, groups, chat window, highlighting
