# Decisions: 0010 - HAL chat: hide until project attached + persist conversations

## D1: Gate chat behind `connectedProject`

- **Decision**: Only render the chat transcript/composer when `connectedProject` is set; otherwise show a clear placeholder state.
- **Why**: This matches the product constraint that chat should only exist when a project is attached, and it prevents confusing “agent” interactions without repo context.

## D2: Persist conversations in `localStorage` (scoped by project folder name)

- **Decision**: Store chat transcripts in browser `localStorage`, keyed by the connected project folder name.
- **Why**: Smallest possible persistence mechanism that survives refresh and meets the “scoped per project” requirement without adding any backend work.
- **Trade-offs**:
  - Folder name is not guaranteed globally unique, but is “good enough” for now.
  - Very long conversations could hit localStorage quota; we surface a persistence error in Diagnostics if save/load fails.

## D3: Serialize timestamps and preserve message IDs

- **Decision**: Serialize `Date` timestamps as ISO strings and restore them on load; reset `messageIdRef` to the maximum restored message ID to avoid collisions.
- **Why**: Maintains stable ordering/timestamps across refresh and avoids duplicate message keys after restoring history.

## Unrequested changes (required)

- None.

# Decisions: 0010 - HAL chat: hide until project attached + persist conversations

## D1: localStorage key strategy

**Decision**: Key conversations by project folder name using prefix `hal-chat-conversations-{projectName}`

**Rationale**:
- Simple and stable identifier already available in state
- No additional API calls or file system access needed
- Meets ticket requirement of per-project scoping
- User can visually identify which project in DevTools if needed

**Alternatives considered**:
- Hash of folder path: More unique but less readable, overkill for MVP
- UUID stored in .env: Requires write access, more complex

## D2: Date serialization approach

**Decision**: Serialize Date objects to ISO strings on save, parse back on load

**Rationale**:
- JSON.stringify doesn't preserve Date objects
- ISO format is standard and human-readable
- No external library needed

## D3: Chat placeholder vs hidden region

**Decision**: Show placeholder message instead of hiding entire chat region

**Rationale**:
- User knows chat exists and what's needed to enable it
- Better UX than mysteriously missing UI element
- Provides clear call-to-action

## D4: Agent selector disabled state

**Decision**: Keep agent selector visible but disabled when no project connected

**Rationale**:
- User can see available options
- Consistent with showing header even when chat disabled
- Clear visual indication of disabled state via CSS

## D5: Conversation clearing on disconnect

**Decision**: Clear conversation state on disconnect (data already persisted)

**Rationale**:
- Clean slate when no project connected
- Conversations are saved to localStorage before clearing
- Prevents confusion about which project messages belong to

## D6: Message ID restoration

**Decision**: Restore messageIdRef.current to max ID from loaded conversations

**Rationale**:
- Prevents ID collisions when adding new messages
- Maintains unique IDs across sessions
- Simple integer tracking is sufficient
