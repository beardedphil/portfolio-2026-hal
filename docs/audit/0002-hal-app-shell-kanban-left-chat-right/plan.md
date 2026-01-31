# Implementation Plan: 0002-hal-app-shell-kanban-left-chat-right

## Goal

Create a React/Vite/TypeScript app in `portfolio-2026-hal` that shows:
- Left column: kanban board (from `projects/kanban/`)
- Right column: chat UI with agent selector, transcript, message composer, and standup button
- In-app diagnostics panel

## Approach

### 1. App Structure
Create standard Vite/React/TypeScript app files at repo root:
- `index.html` - Entry HTML
- `vite.config.ts` - Vite configuration
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` - TypeScript configs
- `src/main.tsx` - React entry point
- `src/App.tsx` - Main application component
- `src/index.css` - Styles

### 2. Kanban Integration
The kanban board in `projects/kanban/` is a complete standalone Vite app with its own:
- Supabase integration
- DnD context and state management
- Complex component hierarchy

**Decision**: Use iframe embedding as the initial integration approach:
- This is explicitly mentioned in the ticket as an acceptable fallback
- Allows the kanban app to run independently with its own context
- Enables future migration to component import if needed

### 3. Chat UI
Create a chat region with:
- Agent dropdown (Project Manager, Implementation Agent stub)
- Message transcript area
- Message input + Send button
- "Standup (all agents)" button with placeholder output

### 4. Diagnostics Panel
In-app panel showing:
- Current kanban render mode
- Selected agent
- Last error (if any)

## Tasks

1. Create `index.html`
2. Create `vite.config.ts`
3. Create TypeScript config files
4. Create `src/main.tsx`
5. Create `src/App.tsx` with two-column layout
6. Create `src/index.css`
7. Update `package.json` with dev/build scripts
8. Test the app

## Success Criteria

- App runs with `npm run dev`
- Two-column layout visible
- Kanban board renders in left column
- Chat UI functional with local messages
- Standup button produces placeholder output
- Diagnostics panel shows render mode and agent
