# Decisions: 0002-hal-app-shell-kanban-left-chat-right

## D1: Kanban Integration via Iframe (Fallback Approach)

**Context**: The kanban board in `projects/kanban/` is a complete standalone React/Vite app with:
- Its own React context and state management
- DnD functionality via @dnd-kit with complex collision detection
- Supabase integration with connection state
- ~1800 lines of interconnected code

**Options Considered**:
1. **Direct component import** - Import and render kanban components directly
2. **Iframe embedding** - Embed kanban app as iframe
3. **Code duplication** - Copy/paste kanban code into HAL

**Decision**: Iframe embedding (Option 2)

**Rationale**:
- Ticket explicitly mentions iframe as acceptable fallback: "If direct embedding/import is not possible in this slice, implement a **temporary** fallback"
- Kanban app has its own React context tree, DnD providers, and Supabase client that would require significant refactoring to share
- Clean separation allows both apps to run independently
- Faster to implement while still meeting UI-verifiable requirements
- Migration path: can later extract shared components or use module federation

**Trade-offs**:
- Cross-origin communication between HAL and kanban is limited
- Slight visual integration overhead (iframe border handling)
- Both apps need to run simultaneously during development

## D2: Chat Messages as Local-Only State

**Context**: Ticket specifies "messages can be local-only for now" and "do not implement real LLM/agent infrastructure yet"

**Decision**: All chat state lives in React component state, no persistence

**Rationale**:
- Matches ticket scope constraints
- Simplest implementation that meets acceptance criteria
- Future: will add real agent integration and message persistence

## D3: Port Configuration

**Decision**: HAL runs on port 5173, Kanban on port 5174

**Rationale**:
- Vite defaults to 5173
- Kanban needs separate port to run simultaneously
- Clear distinction during development
