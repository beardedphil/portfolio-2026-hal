# Changed Files: 0070 - Scalable chat UI with multiple conversation instances per agent role

## Modified files

- `src/App.tsx`
  - Updated data structure: Changed from `Record<ChatTarget, Message[]>` to `Map<string, Conversation>`
  - Added `Conversation` type with `id`, `agentRole`, `instanceNumber`, `messages`, `createdAt`
  - Added helper functions: `getConversationId`, `parseConversationId`, `getNextInstanceNumber`, `getOrCreateConversation`, `getDefaultConversationId`, `getConversationsForAgent`, `getConversationLabel`, `getConversationPreview`
  - Updated `addMessage`: Changed to accept `conversationId` instead of `ChatTarget`
  - Updated `triggerAgentRun`: Added optional `conversationId` parameter, updated all `addMessage` calls to use conversation IDs
  - Updated `HAL_OPEN_CHAT_AND_SEND` handler: Creates new conversation instances for Implementation/QA agents, opens modal
  - Updated conversation loading: Supabase and localStorage loading work with new Map structure
  - Added conversation card list UI: Shows cards for Implementation/QA agents when modal is closed
  - Added modal component: Full conversation thread view with transcript and composer
  - Updated active messages logic: Handles PM/Standup default conversation and Implementation/QA selected conversation
  - Added state: `selectedConversationId`, `conversationModalOpen`

- `src/index.css`
  - Added `.conversation-list` styles: Container for conversation cards with scrollable layout
  - Added `.conversation-list-empty` styles: Empty state message styling
  - Added `.conversation-cards` styles: Flex container for cards with gap
  - Added `.conversation-card` styles: Card styling with hover and focus states
  - Added `.conversation-card-header` and `.conversation-card-label` styles: Header and label styling
  - Added `.conversation-card-preview` styles: Preview text with ellipsis and line clamping
  - Added `.conversation-modal-overlay` styles: Fixed overlay with backdrop
  - Added `.conversation-modal` styles: Modal container with max dimensions and shadow
  - Added `.conversation-modal-header` styles: Header with title and close button
  - Added `.conversation-modal-close` styles: Close button with hover states
  - Added `.conversation-modal-content` styles: Content container with flex layout
  - Added `.conversation-modal-composer` styles: Composer styling within modal
  - Added responsive styles for mobile viewports
