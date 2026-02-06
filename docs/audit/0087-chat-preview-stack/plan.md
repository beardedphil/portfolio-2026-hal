# Plan: Chat Preview Stack with Agent Status Boxes (0087)

## Approach

1. **Chat Preview Stack (already implemented)**
   - Preview stack shows all available chats
   - Each preview pane shows agent name/role and last message preview
   - Collapsible groups for QA and Implementation agents
   - Project Manager and Standup appear as individual preview panes

2. **Remove full chat UI from Chat pane**
   - Remove embedded chat transcript, composer, and status panels from right Chat pane
   - Chat pane should only show preview stack (no full chat view)

3. **Add agent status boxes at bottom**
   - Create agent status boxes section at bottom of Chat pane
   - Show status boxes only for working agents (not idle, not completed)
   - Each status box shows agent name/role and current status
   - Status boxes disappear when agents reach "Done" state

4. **Chat window (already implemented)**
   - Chat window replaces Kanban iframe when a chat is opened
   - Includes close button (X) and "Return to Kanban" link
   - Full chat UI is shown in the chat window, not in the Chat pane

5. **Visual highlighting (already implemented)**
   - Currently open chat preview pane is highlighted in the stack

## File Touchpoints

- `src/App.tsx`: 
  - Remove full chat UI from Chat pane (agent stub banners, status panels, conversation lists, chat transcripts, composers)
  - Add agent status boxes section at bottom of Chat pane
  - Add `formatAgentStatus` helper function
  - Filter status boxes to show only working agents (not idle, not completed)
- `src/index.css`: 
  - Add CSS for agent status boxes (`.agent-status-boxes`, `.agent-status-box`, etc.)
  - Style status boxes with grid/stack layout at bottom of Chat pane
