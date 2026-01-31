# Decisions (0007-hal-dev-script-start-kanban-and-hal)

## concurrently over npm-run-all

- **Decision:** Use `concurrently` to run HAL and Kanban in parallel.
- **Why:** Ticket suggests both; concurrently gives labeled output (`-n hal,kanban`) and colored output, which helps when both servers log to the same terminal. Cross-platform and widely used.

## Fixed ports with strictPort

- **Decision:** Use fixed ports (5173 for HAL, 5174 for kanban) and pass `--strictPort` to both Vite processes.
- **Why:** Ticket requires "avoid auto-picking a new port behaviors that break the embed unless the embed URL is also made dynamic." With strictPort, if a port is in use, the process fails immediately with a clear error instead of silently switching ports and breaking the iframe.

## npm --prefix for kanban

- **Decision:** Run kanban via `npm --prefix projects/kanban run dev -- --port 5174 --strictPort`.
- **Why:** Kanban is a git submodule at `projects/kanban`; `npm --prefix` runs the kanban project's dev script without changing the working directory. The `--` forwards `--port 5174 --strictPort` to Vite.

## No changes to iframe URL

- **Decision:** Keep KANBAN_URL as `http://localhost:5174` in App.tsx.
- **Why:** It already matches the chosen kanban port; no need for dynamic URL unless we add port configuration later.
