# New Project Setup: Vercel + Supabase

This guide walks you through setting up a new HAL project with Vercel (hosting) and Supabase (database). Choose the path that fits you best.

---

## What You'll Need

- **GitHub account** — for your code repo and OAuth (Sign in with GitHub)
- **Supabase account** — [supabase.com](https://supabase.com) (free tier works)
- **Vercel account** — [vercel.com](https://vercel.com) (free tier works)
- **HAL already running** — either locally (`npm run dev`) or at your deployed URL (for the Bootstrap flow)

---

## Path A: Manual Setup (Step-by-Step)

Best if you prefer to understand each step or don't have HAL running yet.

### Step 1: Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Pick your organization, name the project (e.g. `my-hal-project`), set a database password, and choose a region
4. Wait for the project to finish provisioning (1–2 minutes)

### Step 2: Run the database migrations

In your Supabase project:

1. Open **SQL Editor** in the left sidebar
2. Run the following SQL scripts **in this order** (each in a new query, then Run):

**2a. Base tables** (from `projects/kanban/docs/supabase-schema.md`)

```sql
-- tickets
create table if not exists public.tickets (
  id text primary key,
  filename text not null,
  title text not null,
  body_md text not null,
  kanban_column_id text null,
  kanban_position int null,
  kanban_moved_at timestamptz null,
  updated_at timestamptz not null default now()
);

-- kanban_columns
create table if not exists public.kanban_columns (
  id text primary key,
  title text not null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**2b. Repo-scoped tickets** (0079)

Copy the full contents of `docs/process/supabase-migrations/0079-repo-scoped-tickets.sql` and run it.

**2c. File access queue** (0080)

Copy the full contents of `docs/process/supabase-migrations/0080-file-access-queue.sql` and run it.

**2d. Agent runs** (0081)

Copy the full contents of `docs/process/supabase-migrations/0081-agent-runs.sql` and run it.

**2e. Agent artifacts** (0082)

Copy the full contents of `docs/process/supabase-migrations/0082-agent-artifacts.sql` and run it.

**2f. Process reviews** (0134) — optional, for Process Review feature

Copy the full contents of `docs/process/supabase-migrations/0134-process-reviews.sql` and run it.

**2g. Bootstrap runs** (0775) — required if using the in-app Bootstrap flow (Path B)

Copy the full contents of `docs/process/supabase-migrations/0775-bootstrap-runs.sql` and run it.

### Step 3: Get your Supabase credentials

1. In Supabase Dashboard, go to **Project Settings** (gear icon) → **API**
2. Copy:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

### Step 4: Create a GitHub repository

1. Create a new repo on GitHub (e.g. `my-hal-project`)
2. Push your HAL codebase to it (or fork/clone `portfolio-2026-hal` and push to your repo)

### Step 5: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import** next to your GitHub repo
3. Leave the default build settings (Vercel usually detects Vite)
4. **Before deploying**, add environment variables (see Step 6)
5. Click **Deploy**

### Step 6: Add Vercel environment variables

In your Vercel project: **Settings** → **Environment Variables**. Add these for **Preview** and **Production**:

| Variable | Where to get it | Required |
|----------|-----------------|----------|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | Yes |
| `SUPABASE_URL` | Same as VITE_SUPABASE_URL | Yes |
| `SUPABASE_ANON_KEY` | Same as VITE_SUPABASE_ANON_KEY | Yes |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | For PM chat |
| `OPENAI_MODEL` | e.g. `gpt-4o-mini` | For PM chat |
| `CURSOR_API_KEY` | Cursor Dashboard → Integrations | For Implementation/QA agents |
| `GITHUB_CLIENT_ID` | GitHub → Settings → Developer settings → OAuth Apps | For Sign in with GitHub |
| `GITHUB_CLIENT_SECRET` | Same OAuth App | For Sign in with GitHub |
| `AUTH_SESSION_SECRET` | Generate a long random string (32+ chars) | For OAuth session |
| `APP_ORIGIN` | Your Vercel URL, e.g. `https://my-project.vercel.app` | For OAuth redirect |
| `HAL_ENCRYPTION_KEY` | 64 hex chars or long random string | For secret encryption |

See `.env.example` in the repo root for the full list and comments.

### Step 7: Redeploy and verify

After adding env vars, trigger a new deployment (Deployments → … → Redeploy). Then open your Vercel URL and:

1. Load the app — HAL and Kanban should appear
2. Click **Sign in GitHub** and complete OAuth
3. Click **Connect GitHub Repo** and select your repo
4. Confirm tickets load (or you see empty columns — that’s OK for a new project)

See [Vercel Preview smoke test](process/vercel-preview-smoke-test.md) for a full checklist.

---

## Path B: In-App Bootstrap (Semi-Automated)

Use this when **HAL is already running** (locally or deployed) and you have:

- A **Supabase project** with migrations applied (Steps 1–2 from Path A)
- A **GitHub repo** connected in HAL (Sign in GitHub + Connect GitHub Repo)

### What the Bootstrap does

1. Initializes the repository (ensures `main` exists)
2. Can create a **new Supabase project** via API (if you have Supabase Management API token)
3. **Creates a Vercel project** — links your GitHub repo, sets env vars, triggers first deploy
4. Verifies the preview deployment is live

### How to run it

1. Open HAL (local or deployed)
2. Sign in with GitHub and connect your repo
3. Connect your project folder (or ensure Supabase is configured via `VITE_SUPABASE_*` env vars)
4. Click **Bootstrap** in the header  
   _Note: The Bootstrap button appears when running Kanban standalone (e.g. `npm run dev` from `projects/kanban`). When using the full HAL app, use Path A (manual setup) or run Kanban standalone to access Bootstrap._
5. Enter your **Vercel API token** ([vercel.com/account/tokens](https://vercel.com/account/tokens))
6. Click **Create Vercel project & deploy**
7. Follow the steps — when prompted, provide the preview URL for verification

The Bootstrap screen will create the Vercel project, link it to your repo, add env vars (from your current HAL config), and trigger the first deploy.

---

## Path C: New HAL Project Wizard (Scaffold Only)

Use this to **copy the HAL scaffold** (rules, docs, scripts) into a new repo folder. It does **not** set up Vercel or Supabase.

1. Open HAL with Kanban (standalone or embedded)
2. Click **New HAL project** in the header
3. Enter a project name and optional repo URL
4. Check off: Repo created → Copied scaffold → Set `.env` → Added as submodule (if applicable)
5. Use **Wizard v1**: Select scaffold folder (`hal-template/`), select destination folder, click **Copy scaffold**
6. Manually create a Supabase project and Vercel project, then follow Path A from Step 2

---

## Quick Reference

### Migration order (Supabase SQL Editor)

1. Base tables: `tickets`, `kanban_columns` (see Step 2a above)
2. `0079-repo-scoped-tickets.sql`
3. `0080-file-access-queue.sql`
4. `0081-agent-runs.sql`
5. `0082-agent-artifacts.sql`
6. `0134-process-reviews.sql` (optional)
7. `0775-bootstrap-runs.sql` (required for Path B — in-app Bootstrap)

### Essential env vars (Vercel)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase URL (client + server) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (client + server) |
| `SUPABASE_URL` | Same (server-side fallback) |
| `SUPABASE_ANON_KEY` | Same (server-side fallback) |
| `APP_ORIGIN` | Your app URL (for OAuth redirect) |
| `AUTH_SESSION_SECRET` | Session encryption |
| `HAL_ENCRYPTION_KEY` | Secrets encryption |

### Key files

- **Supabase migrations**: `docs/process/supabase-migrations/*.sql`
- **Base schema**: `projects/kanban/docs/supabase-schema.md`
- **Env template**: `.env.example`
- **Vercel smoke test**: `docs/process/vercel-preview-smoke-test.md`

---

## Troubleshooting

| Problem | What to check |
|---------|---------------|
| "Supabase not initialized" | Run base tables + 0079 migrations. Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. |
| OAuth redirect fails | Ensure `APP_ORIGIN` matches your deployed URL exactly (no trailing slash). Check GitHub OAuth callback URL: `https://<your-domain>/api/auth/github/callback`. |
| Tickets don't load | Confirm repo is connected. Check Supabase has `tickets` with `pk` column (0079 applied). |
| Bootstrap "Create Vercel project" fails | Verify Vercel token has project create scope. Ensure GitHub repo is connected in HAL. |
| PM chat not responding | Add `OPENAI_API_KEY` and `OPENAI_MODEL` to Vercel env vars and redeploy. |

---

## Next steps

- Add tickets via **New HAL project** or `docs/tickets/`
- Run `npm run sync-tickets` to sync tickets to Supabase
- Use **Implement** and **QA** buttons for agent-driven workflow
- See [Vercel Preview smoke test](process/vercel-preview-smoke-test.md) for full verification
