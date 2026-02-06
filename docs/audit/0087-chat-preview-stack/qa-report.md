# QA Report: Chat Preview Stack (0087)

## Ticket & Deliverable

**Goal**: Improve the Chat interface by introducing a Microsoft Teams–style stack of chat preview panes that makes it easy to see and switch between all agent chats, including grouped multi-instance agents.

**Human-verifiable deliverable**: In the Chat area, there is a stack of chat preview panes listing all available chats; the Chat pane shows only previews (no embedded full chat view). Selecting a chat replaces the Kanban board iframe with an in-app chat window that can be closed to return to the Kanban board.

## Audit Artifacts

All required audit files are present:
- ✅ [plan.md](docs/audit/0087-chat-preview-stack/plan.md)
- ✅ [worklog.md](docs/audit/0087-chat-preview-stack/worklog.md)
- ✅ [changed-files.md](docs/audit/0087-chat-preview-stack/changed-files.md)
- ✅ [decisions.md](docs/audit/0087-chat-preview-stack/decisions.md)
- ✅ [verification.md](docs/audit/0087-chat-preview-stack/verification.md)
- ✅ [pm-review.md](docs/audit/0087-chat-preview-stack/pm-review.md)

## Code Review

### Implementation Summary

The implementation adds:
1. **State management** (`openChatTarget`, `qaGroupExpanded`, `implGroupExpanded`) to track open chat and group expansion
2. **Preview stack component** replacing the dropdown selector, showing all available chats
3. **Chat window** that conditionally replaces the Kanban iframe when a chat is opened
4. **Collapsible groups** for QA and Implementation agents
5. **Visual highlighting** for the active chat preview pane

### Acceptance Criteria Review

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Chat UI includes a stack/list of chat preview panes | ✅ PASS | `src/App.tsx:2462-2644` - Preview stack component with panes for PM, Standup, QA group, and Implementation group |
| Chat pane shows only the preview stack (full chat view removed/hidden) | ❌ FAIL | `src/App.tsx:2654+` - Full chat view (transcript, composer) is still rendered in the right panel when `connectedProject` is true. Both preview stack and full chat view are rendered simultaneously. |
| Clicking a preview pane opens that chat conversation | ✅ PASS | `src/App.tsx:2466-2472, 2498-2504, 2556-2562, 2615-2621` - Click handlers set `openChatTarget` and `selectedChatTarget`/`selectedConversationId` |
| Chat window replaces Kanban iframe when opened | ✅ PASS | `src/App.tsx:2088-2408` - Conditional rendering: `openChatTarget ? <chat-window> : <kanban-iframe>` |
| Chat window includes X button in top-right | ✅ PASS | `src/App.tsx:2111-2120` - Close button with × symbol and `onClick={() => setOpenChatTarget(null)}` |
| Chat window includes "Return to Kanban" link | ✅ PASS | `src/App.tsx:2102-2110` - Return link button with same close handler |
| Closing chat restores Kanban iframe | ✅ PASS | `src/App.tsx:2106, 2115` - Both close mechanisms set `openChatTarget` to `null`, which triggers iframe rendering |
| QA appears as collapsible group with QA Lead visible when collapsed | ✅ PASS | `src/App.tsx:2528-2584` - QA group with header showing "QA Lead" and expand/collapse icon |
| Implementation appears as collapsible group with Implementation Lead visible when collapsed | ✅ PASS | `src/App.tsx:2587-2643` - Implementation group with header showing "Implementation Lead" and expand/collapse icon |
| Expanding QA group reveals QA agent instances | ✅ PASS | `src/App.tsx:2547-2583` - When `qaGroupExpanded` is true, maps over `getConversationsForAgent('qa-agent')` |
| Expanding Implementation group reveals Implementation agent instances | ✅ PASS | `src/App.tsx:2606-2642` - When `implGroupExpanded` is true, maps over `getConversationsForAgent('implementation-agent')` |
| Empty states shown when no instances exist | ✅ PASS | `src/App.tsx:2549-2550, 2608-2609` - Shows "No QA agents running" / "No Implementation agents running" when groups are expanded with no conversations |
| Currently open chat is visually highlighted | ✅ PASS | `src/App.tsx:2465, 2497, 2555, 2614` - `chat-preview-active` class applied when `openChatTarget` matches. CSS at `src/index.css:419-428` provides purple border/background |

### Code Quality

- **State management**: Clean separation of concerns with `openChatTarget` tracking which chat is open
- **Event handlers**: Properly set both `openChatTarget` and `selectedChatTarget`/`selectedConversationId` when opening chats
- **Accessibility**: Keyboard support (`onKeyDown` handlers) and ARIA labels present
- **Styling**: Consistent with existing design system, uses CSS variables for theming

### Issues Found

1. **CRITICAL: Full chat view still rendered in right panel** (`src/App.tsx:2654+`)
   - **Issue**: When `connectedProject` is true, both the preview stack (lines 2460-2645) and the full chat view (transcript, composer starting at line 2654) are rendered in the right panel
   - **Expected**: Per acceptance criteria #2, the Chat pane should show ONLY the preview stack; the full chat view should be removed/hidden
   - **Impact**: Violates acceptance criterion #2. Users will see both the preview stack and the full chat view simultaneously, which is not the intended design
   - **Location**: `src/App.tsx:2654-3555` (full chat view section)

## UI Verification

**Automated checks**: Not run (requires dev server and manual interaction)

**Manual verification required**: The following steps from `verification.md` must be performed manually:

1. **Preview Stack Display**: Connect a project and verify preview stack appears in right panel
2. **Full Chat View Removal**: Verify that the full chat view (transcript, composer) is NOT visible in the right panel when preview stack is shown
3. **Collapsible Groups**: Test QA and Implementation group expand/collapse
4. **Opening Chats**: Click preview panes and verify chat window replaces Kanban iframe
5. **Closing Chats**: Test both X button and "Return to Kanban" link
6. **Multi-Instance Agents**: Start agent instances and verify they appear in expanded groups
7. **Active Highlighting**: Verify currently open chat preview pane is highlighted
8. **Empty States**: Verify empty state messages when groups are expanded with no instances

**Note**: Due to the identified issue with the full chat view still being rendered, manual verification should confirm whether this causes visual overlap or layout issues in the UI.

## Verdict

**Status**: ❌ **FAIL**

**Reason**: Acceptance criterion #2 is not met. The full chat view (transcript, composer) is still rendered in the right panel alongside the preview stack, when it should be removed/hidden per the requirement: "The Chat pane shows only the preview stack; the existing bottom/full chat view inside the Chat pane is removed/hidden."

**Blocking**: Yes. This is a core requirement that affects the UI design and user experience.

**Recommendation**: 
1. Conditionally hide or remove the full chat view section (`src/App.tsx:2654+`) when `connectedProject` is true
2. Ensure the preview stack is the only content visible in the right panel when a project is connected
3. Re-verify that all chats open in the chat window (Kanban region) and not in the right panel

**Non-blocking issues**: None identified.
