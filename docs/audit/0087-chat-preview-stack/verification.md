# Verification: Chat Preview Stack (0087)

## UI-Only Verification Steps

### 1. Preview Stack Display
- [ ] Connect a project folder
- [ ] In the Chat area (right panel), verify a stack of chat preview panes is visible
- [ ] Verify preview panes show:
  - Project Manager (with preview text if messages exist)
  - Standup (all agents) (with preview text if messages exist)
  - QA Lead (collapsible group)
  - Implementation Lead (collapsible group)

### 2. Collapsible Groups
- [ ] Click on "QA Lead" group header - verify it expands/collapses
- [ ] When collapsed, verify "QA Lead" entry is visible
- [ ] When expanded, verify any QA agent instances are shown (or "No QA agents running" if none)
- [ ] Repeat for "Implementation Lead" group

### 3. Opening Chats
- [ ] Click on "Project Manager" preview pane
- [ ] Verify Kanban board iframe is hidden
- [ ] Verify chat window appears in place of Kanban board
- [ ] Verify chat window shows Project Manager conversation
- [ ] Verify "Project Manager" preview pane is highlighted (purple border/background)

### 4. Chat Window Features
- [ ] Verify chat window has a header with chat title
- [ ] Verify "Return to Kanban" link is visible in header
- [ ] Verify X button is visible in top-right of header
- [ ] Verify chat transcript is visible
- [ ] Verify chat composer (input and send button) is visible

### 5. Closing Chat
- [ ] Click the X button
- [ ] Verify chat window closes
- [ ] Verify Kanban board iframe is restored
- [ ] Verify preview pane highlighting is removed
- [ ] Click a preview pane again to open chat
- [ ] Click "Return to Kanban" link
- [ ] Verify chat window closes and Kanban board is restored

### 6. Multi-Instance Agents
- [ ] Start an Implementation agent (via Kanban button or chat)
- [ ] Verify "Implementation Lead" group can be expanded
- [ ] Verify Implementation agent instance appears in expanded group
- [ ] Click on the instance preview pane
- [ ] Verify chat window opens with that instance's conversation
- [ ] Verify the instance preview pane is highlighted
- [ ] Repeat for QA agent

### 7. Active Chat Highlighting
- [ ] Open a chat (any chat)
- [ ] Verify the corresponding preview pane has purple border and background
- [ ] Close the chat
- [ ] Verify highlighting is removed
- [ ] Open a different chat
- [ ] Verify only the new chat's preview pane is highlighted

### 8. Empty States
- [ ] Expand QA group when no QA agents are running
- [ ] Verify "No QA agents running" message is shown
- [ ] Expand Implementation group when no Implementation agents are running
- [ ] Verify "No Implementation agents running" message is shown

### 9. Chat Pane Only Shows Preview Stack
- [ ] Verify Chat pane (right panel) shows only the preview stack
- [ ] Verify no embedded chat transcript is visible in Chat pane
- [ ] Verify no chat composer is visible in Chat pane
- [ ] Verify no agent stub banners are visible in Chat pane (when no chat is open)
- [ ] Verify no status panels are visible in Chat pane (when no chat is open)

### 10. Agent Status Boxes
- [ ] Verify agent status boxes section appears at bottom of Chat pane
- [ ] When Implementation agent is working (not idle, not completed), verify "Implementation Agent" status box appears
- [ ] Verify status box shows agent name ("Implementation Agent") and current status (e.g., "Running", "Preparing")
- [ ] When QA agent is working (not idle, not completed), verify "QA Agent" status box appears
- [ ] When Implementation agent reaches "Done" state, verify its status box disappears
- [ ] When QA agent reaches "Done" state, verify its status box disappears
- [ ] When both agents are idle, verify no status boxes are shown
- [ ] Verify status boxes show error messages if agent errors occur

## Expected Behavior

- Preview stack is always visible in right panel when project is connected
- Chat pane shows only preview stack (no embedded full chat view)
- Agent status boxes appear at bottom of Chat pane for working agents only
- Status boxes disappear when agents reach "Done" state
- Clicking a preview opens that chat in the Kanban region
- Chat window replaces Kanban iframe completely
- Closing chat restores Kanban iframe
- Currently open chat is visually highlighted
- Groups expand/collapse to show/hide agent instances
