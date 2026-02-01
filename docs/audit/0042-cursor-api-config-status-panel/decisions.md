# Decisions: 0042 - Cursor API Configuration Status Panel

## D1: Use VITE_ prefix for the environment variable

**Decision**: Use `VITE_CURSOR_API_KEY` instead of `CURSOR_API_KEY`

**Rationale**: Vite only exposes environment variables prefixed with `VITE_` to the frontend. Since we need to check the presence of this key in the browser-side UI, the VITE_ prefix is required.

**Trade-off**: The actual API calls to Cursor will happen server-side in later tickets, where we'd use a non-VITE_ prefixed variable. For now, we're using VITE_ for the status display only.

## D2: Panel placement above Diagnostics toggle

**Decision**: Place the Configuration panel above the collapsible Diagnostics section

**Rationale**: The Configuration status should be immediately visible without clicking anything. Diagnostics is for debugging; Configuration status is operational information that users need at a glance.

## D3: Simple boolean check (exists vs not exists)

**Decision**: Only check if the environment variable is set, not validate its format

**Rationale**: 
- The ticket scope is UI-only, no API requests
- Format validation would require knowing Cursor API key format
- A simple presence check provides the needed information for troubleshooting

## D4: Non-collapsible panel

**Decision**: The Configuration panel is always expanded/visible

**Rationale**: Unlike Diagnostics (which contains technical details), the Configuration panel shows essential operational status. Users should see it immediately when troubleshooting why Implementation Agent isn't working.

## D5: Hint text shows variable name without "VITE_" prefix

**Decision**: Display "Missing CURSOR_API_KEY in .env" instead of "Missing VITE_CURSOR_API_KEY"

**Rationale**: From a user perspective, they're configuring a "Cursor API key". The VITE_ prefix is an implementation detail of Vite's environment variable exposure. The hint is more user-friendly without the prefix.
