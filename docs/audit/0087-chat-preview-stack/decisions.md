# Decisions: Chat Preview Stack (0087)

## Design Decisions

1. **Preview stack replaces dropdown**
   - **Decision**: Replaced the dropdown selector with a Teams-style preview stack
   - **Rationale**: Provides better visibility of all available chats and makes it easier to switch between them
   - **Trade-off**: Takes more vertical space, but improves discoverability

2. **Collapsible groups for multi-instance agents**
   - **Decision**: QA and Implementation appear as collapsible groups with "Lead" entries when collapsed
   - **Rationale**: Reduces clutter when no instances are running, but allows expansion when needed
   - **Trade-off**: Requires one extra click to see instances, but keeps UI clean

3. **Chat window replaces Kanban iframe**
   - **Decision**: When a chat is open, it takes the full space of the Kanban region
   - **Rationale**: Provides focused chat experience without splitting attention
   - **Trade-off**: Can't view Kanban and chat simultaneously, but matches Teams-style workflow

4. **Close mechanisms**
   - **Decision**: Both X button and "Return to Kanban" link close the chat
   - **Rationale**: Provides multiple ways to close, accommodating different user preferences
   - **Trade-off**: Slight redundancy, but improves accessibility

5. **Active chat highlighting**
   - **Decision**: Currently open chat is highlighted with purple border and background
   - **Rationale**: Makes it clear which chat is currently active
   - **Trade-off**: None - standard UI pattern

## Unrequested Changes (required)

None - all changes are directly related to the ticket requirements.
