# Worklog: 0002-hal-app-shell-kanban-left-chat-right

## Session 1 - 2026-01-30

### Analysis
- Read ticket requirements
- Explored existing kanban app structure in `projects/kanban/` (submodule pointing to `portfolio-2026-basic-kanban`)
- Discovered kanban app is a complete standalone React/Vite/TS app with:
  - Complex DnD (drag-and-drop) functionality via @dnd-kit
  - Supabase integration
  - ~1800 lines of code in App.tsx

### Decision: Iframe Embedding
Given the kanban app's complexity and standalone nature, chose iframe embedding as the integration approach:
- Allows kanban to run independently with its own React context and state
- Explicitly mentioned in ticket as acceptable fallback
- Cleaner separation of concerns for initial implementation
- Can migrate to direct component import later if needed

### Implementation
1. Created standard Vite/React/TS app structure:
   - `index.html` - Entry point
   - `vite.config.ts` - Vite config
   - `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` - TypeScript configs
   - `src/main.tsx` - React entry
   - `src/App.tsx` - Main app component
   - `src/index.css` - Styles
   - `src/vite-env.d.ts` - Vite types

2. Implemented two-column layout:
   - Left: Kanban board via iframe (http://localhost:5174)
   - Right: Chat UI

3. Chat UI features:
   - Agent dropdown (Project Manager, Implementation Agent stub)
   - Message transcript with timestamps
   - Message input with Enter-to-send
   - "Standup (all agents)" button with placeholder summaries

4. Diagnostics panel:
   - Kanban render mode
   - Kanban URL and load status
   - Selected agent
   - Last error

5. Updated package.json with:
   - dev/build/preview scripts
   - React and TypeScript dependencies

### Testing
- Need to run `npm install` in HAL repo
- Start kanban app on port 5174
- Start HAL app on port 5173
- Verify two-column layout and chat functionality
