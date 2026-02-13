# Decisions (0009-docs-ticketstore-readonly-viewer)

## File System Access API
- **Decision:** Use `window.showDirectoryPicker()` so the app can read `docs/tickets/*.md` from a user-selected folder without a backend.
- **Reason:** Ticket specifies "Preferred approach: File System Access API so it works without a backend." Treat selected folder as project root; read `docs/tickets/` relative to it.

## No fallback to demo data
- **Decision:** Do not use demo or fake ticket data when disconnected or when folder has no `docs/tickets/`. Show clear in-app states: Disconnected, "Connect cancelled.", or "No `docs/tickets` folder found." / "Found 0 tickets."
- **Reason:** Ticket constraint: "Do not silently fall back to demo data; show a clear in-app disconnected/error state instead."

## Minimal type declarations
- **Decision:** Add minimal File System Access API interfaces in `vite-env.d.ts` (DirectoryHandle, FileHandle, showDirectoryPicker on Window) instead of adding a separate `@types` package.
- **Reason:** Keep dependencies minimal; types are only used for docs/tickets read-only flow.

## Refresh button
- **Decision:** Add a manual "Refresh" button when connected so the user can re-scan `docs/tickets/` after adding or changing files.
- **Reason:** Ticket notes "Add a manual Refresh button if needed for easy verification (optional; only if it materially improves UX)." Improves UX when files change on disk.

## Plain text for ticket contents
- **Decision:** Display ticket file contents in a `<pre>` (plain text). No markdown rendering in this ticket.
- **Reason:** Ticket says "full file contents (plain text is fine; markdown rendering optional)."
