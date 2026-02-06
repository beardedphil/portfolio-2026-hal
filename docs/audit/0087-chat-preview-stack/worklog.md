# Worklog: Chat Preview Stack (0087)

## Implementation Steps

1. **Added state management**
   - Added `openChatTarget` state to track which chat is open (ChatTarget | conversation ID | null)
   - Added `qaGroupExpanded` and `implGroupExpanded` states for collapsible groups

2. **Created preview stack component**
   - Replaced dropdown selector with Teams-style preview stack
   - Added preview panes for Project Manager and Standup (individual)
   - Added collapsible groups for QA and Implementation agents
   - Each preview pane shows agent name/role and last message preview
   - Added click handlers to open chats

3. **Implemented chat window**
   - Modified Kanban region to conditionally show iframe or chat window
   - When `openChatTarget` is set, chat window replaces Kanban iframe
   - Chat window includes header with title, "Return to Kanban" link, and close button (X)
   - Chat window renders full chat UI (transcript, composer, status panels)

4. **Added visual highlighting**
   - Active chat preview pane is highlighted with purple border and background
   - Uses `chat-preview-active` class for styling

5. **Added CSS styling**
   - Styled preview stack with hover effects and active states
   - Styled collapsible groups with expand/collapse icons
   - Styled chat window with header, close button, and return link
   - Added responsive styling for nested preview panes

6. **Fixed chat window message display**
   - Chat window uses `activeMessages` and `selectedChatTarget` directly
   - Ensures messages are displayed correctly based on open chat
