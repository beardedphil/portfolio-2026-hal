# Decisions: 0070 - Scalable chat UI with multiple conversation instances per agent role

## Data structure choice

- **Chose `Map<string, Conversation>` over nested objects**: Provides O(1) lookup by conversation ID and easier iteration over all conversations. More scalable than `Record<ChatTarget, Conversation[]>` which would require array searches.

## Conversation ID format

- **Format: `{agentRole}-{instanceNumber}`** (e.g., "implementation-agent-1", "qa-agent-2")
  - Simple, predictable, and easy to parse
  - Allows quick identification of agent role and instance number
  - No collisions since instance numbers are sequential per agent role

## PM and Standup backward compatibility

- **Decision**: Keep PM and Standup using single default conversation (instance #1)
  - **Why**: These agents don't need multiple concurrent conversations in the current workflow
  - **Benefit**: Maintains existing behavior, no migration needed for PM conversations
  - **Future**: Can be extended to support multiple instances if needed

## Modal vs inline view

- **Decision**: Use modal for Implementation/QA conversation threads, inline view for PM/Standup
  - **Why**: Modal provides clear separation between conversation list and thread view
  - **Benefit**: User can see all conversations at a glance, then dive into specific threads
  - **Alternative considered**: Tabbed interface, but modal is simpler and more intuitive

## Conversation preview text

- **Decision**: Show first line of last message, truncated to 100 characters
  - **Why**: Provides enough context without overwhelming the card list
  - **Benefit**: Quick scan of conversation activity
  - **Alternative considered**: Show message count or timestamp, but preview is more informative

## New instance creation

- **Decision**: Create new instance on each Kanban column header button click
  - **Why**: Each work button click represents a new task/ticket, so it should be a new conversation
  - **Benefit**: Clear separation of work items, easy to track multiple tickets in parallel
  - **Alternative considered**: Reuse existing conversation, but that would mix different tickets

## Persistence strategy

- **Decision**: Store all conversations in single localStorage key or Supabase table
  - **Why**: Simpler than per-conversation storage, easier to migrate
  - **Benefit**: Single source of truth, atomic updates
  - **Migration**: Existing PM conversations automatically become instance #1
