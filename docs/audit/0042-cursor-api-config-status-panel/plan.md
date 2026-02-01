# Plan: 0042 - Cursor API Configuration Status Panel

## Objective

Add a visible, non-technical in-app UI showing whether Cursor API is configured so later tickets (Implementation Agent) can rely on it without console debugging.

## Approach

1. Add `VITE_CURSOR_API_KEY` to `.env.example` for documentation
2. Create a Configuration panel above the Diagnostics section in the chat sidebar
3. Check `import.meta.env.VITE_CURSOR_API_KEY` at runtime to determine status
4. Display clear status: "Configured" (green) or "Not configured" (red) with hint about what's missing
5. Never display actual secret values

## Scope

- **In scope**: UI panel, environment variable documentation, styling
- **Out of scope**: Making actual Cursor API requests, storing secrets in Supabase, multiple providers

## Files to Change

1. `.env.example` - Add `VITE_CURSOR_API_KEY` documentation
2. `src/App.tsx` - Add Configuration Status panel component
3. `src/index.css` - Add styling for the panel

## Risk Assessment

- Low risk: UI-only change, no backend modifications
- No secrets exposed: Only checks if variable exists, never displays value
