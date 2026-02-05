## Vercel Preview smoke test (HAL)

This checklist verifies that a **Preview Deployment** behaves like local dev, using **Vercel serverless functions** (`/api/**`) and Supabase as the source of truth.

### Prereqs

- **Supabase migrations applied**
  - `docs/process/supabase-migrations/0079-repo-scoped-tickets.sql`
  - `docs/process/supabase-migrations/0080-file-access-queue.sql`
- **Vercel env vars set (Preview + Production)**
  - **Supabase (client)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - **Supabase (server)**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
  - **OpenAI (server)**: `OPENAI_API_KEY`, `OPENAI_MODEL`
  - **Cursor (server)**: `CURSOR_API_KEY`
  - **GitHub OAuth (server)**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AUTH_SESSION_SECRET`, `APP_ORIGIN`

### 1) Load app + Kanban mounts

- Open the Preview URL.
- Confirm:
  - HAL loads at `/`
  - Kanban loads inside the page (iframe at `/kanban-app/`)

### 2) GitHub OAuth + repo connect

- Click **Sign in GitHub** and complete OAuth.
- Click **Connect GitHub Repo** and select any repo you have access to.
- Confirm Kanban switches to repo-scoped mode (tickets filtered by the connected `repo_full_name`).

### 3) Supabase connectivity

- If not already connected, click **Connect Project Folder** (optional in Preview if you rely entirely on `VITE_SUPABASE_*`).
- Confirm tickets load in Kanban for the connected repo.

### 4) Ticket delete (serverless)

- In Kanban, delete any ticket.
- Confirm:
  - UI removes the ticket
  - Refreshing the page does **not** bring it back (delete persisted in Supabase)

### 5) PM chat (serverless)

- Send a simple message in PM chat (e.g. “hello”).
- Confirm it returns a response (this proves `/api/pm/respond` and `/api/openai/responses` are wired in prod).

### 6) Local folder file access bridge (optional)

This is only needed if you expect the PM to read/search files from a **local** folder via File System Access API.

- Click **Connect Project Folder** and select a local repo folder.
- Ask PM a question that triggers `read_file` or `search_files` (e.g. “search for ‘createClient’ in the project”).
- Confirm it returns results.

Notes:
- The bridge is session-scoped. If it fails intermittently in Preview, confirm `0080-file-access-queue.sql` is applied and that Vercel server env includes `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or service role).

### 7) Implementation / QA agents (optional)

- Implementation: send “Implement ticket NNNN”.
- QA: send “QA ticket NNNN”.

Confirm:
- You see progress stages (NDJSON stream) and/or a timeout message (expected for long runs in serverless).
- If a run completes quickly, it should move the ticket across columns in Supabase.

