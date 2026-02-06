# Brainstorm: Cloud Agent Artifacts in Supabase Without Merge to Main

## Problem

- Cloud agent (Cursor Cloud Agents) creates artifacts and tool calls, but they’re written to **`.hal-tool-call-queue.json` on the agent’s branch** (e.g. `ticket/0097-implementation`).
- Execution today reads the queue from the **local filesystem** (whatever branch HAL / Tool Agent has checked out, usually `main`).
- So artifacts and moves don’t show up until that branch is merged to main and someone runs the queue from main. No env vars are available in the cloud, so the agent can’t call Supabase or HAL directly unless we give it a URL (and HAL is reachable).

**Goal:** Get cloud-created artifacts into Supabase and linked on the ticket **without** requiring a merge to main, and **without** giving the cloud environment Supabase (or other) env vars.

---

## Option 1: HAL Deployed + API URL in Repo (Direct fetch from cloud)

**Idea:** Deploy HAL somewhere public (e.g. Vercel). Put the HAL base URL in a repo file (e.g. `.hal/api-base-url` or in a Cursor rule). Instruct the cloud agent to **call the HAL API directly** with `fetch()` for artifact insert and ticket move (same contract as existing `POST /api/artifacts/insert-implementation`, etc.). HAL server has Supabase env; cloud needs no credentials.

**Pros:** Immediate; no queue; no merge; no credentials in cloud.  
**Cons:** (1) Cloud agent must actually **run** `fetch()` (Cursor Cloud must support executing HTTP from the agent). (2) User must deploy HAL and keep the URL in the repo.

**No-merge:** Yes — artifacts and moves happen as soon as the agent calls the API.

---

## Option 2: Queue on a Dedicated Branch; HAL Reads via GitHub API

**Idea:** Cloud agent keeps writing tool calls to `.hal-tool-call-queue.json`, but **pushes that file to a fixed branch** (e.g. `hal/pending-tool-calls`) instead of only on the feature branch. HAL (or Tool Agent) is changed to **read the queue from that branch via GitHub API** (e.g. `GET .../repos/owner/repo/contents/.hal-tool-call-queue.json?ref=hal/pending-tool-calls`), execute tool calls, then **clear the queue** by pushing an empty array back to that branch (or a “processed” marker).

**Pros:** No merge to main; cloud agent already can push to the repo; no new env in cloud (agent just writes a file and pushes to a branch).  
**Cons:** Agent prompt/instructions must be updated to push queue to the dedicated branch; HAL needs a GitHub token to read/write that file; need to handle race conditions and clearing semantics.

**No-merge:** Yes — execution is driven by the dedicated branch, not by what’s on main.

---

## Option 3: GitHub Action Calls HAL When Queue File Exists

**Idea:** Add a GitHub Action that runs on push (or on `workflow_dispatch`). It reads `.hal-tool-call-queue.json` **from the branch that was pushed** (e.g. `github.ref`), POSTs the payload to HAL’s `/api/tool-calls/execute-all` (or a new “ingest from webhook” endpoint). HAL executes with its server-side Supabase creds and returns. Optionally, the workflow could then clear the file in that branch or leave it for audit.

**Pros:** No merge to main; queue stays on the agent branch; execution is triggered by push.  
**Cons:** HAL must be **reachable from GitHub** (deployed, or use a self-hosted runner that can reach HAL). You need a secret (e.g. `HAL_API_URL` + `HAL_INGEST_SECRET`) in the repo so only GitHub can call HAL.

**No-merge:** Yes — the Action runs on the agent branch and sends that branch’s queue to HAL.

---

## Option 4: Ingest Endpoint + One-Time or Short-Lived Token in Repo

**Idea:** HAL exposes something like `POST /api/ingest-tool-calls` that accepts `{ toolCalls: [...] }` and a **token** (query param or header). You put a one-time or short-lived URL in the repo (e.g. `.hal/ingest-url.txt` with `https://my-hal.vercel.app/api/ingest-tool-calls?token=...`). Cloud agent is instructed to read that file and `fetch(ingestUrl, { method: 'POST', body: JSON.stringify({ toolCalls }) })`. HAL validates the token and runs the same logic as execute-all.

**Pros:** No Supabase (or HAL) credentials in cloud; only a single URL+token; works as soon as the agent can do `fetch()`.  
**Cons:** Token in repo can be leaked (use short-lived or one-time); still requires cloud agent to be able to run `fetch()` and HAL to be deployed.

**No-merge:** Yes — artifacts and moves happen when the agent calls the ingest URL.

---

## Option 5: Supabase Edge Function as Public Ingest (Secret in Path)

**Idea:** Supabase Edge Function at a public URL, e.g. `https://<project>.supabase.co/functions/v1/ingest-tool-calls?secret=<shared-secret>`. Cloud agent is given that URL in the prompt or a repo file; it POSTs `{ toolCalls: [...] }`. The function validates the secret, then does ticket lookups and inserts into `agent_artifacts` (and ticket moves if you add that). No HAL deployment required; Supabase has the data.

**Pros:** No HAL deployment; cloud has no Supabase keys; only a URL + secret.  
**Cons:** Secret in repo or prompt; Edge Function must implement the same semantics as HAL (ticket resolution, artifact types, move column); duplicates some logic.

**No-merge:** Yes — artifacts (and optionally moves) go straight into Supabase.

---

## Option 6: Keep Queue on Agent Branch, HAL Polls GitHub for “Any” Queue

**Idea:** Tool Agent (or a small HAL background job) doesn’t read the queue from the local filesystem. Instead it uses the GitHub API to **list recent branches** (e.g. `ticket/*` or branches updated in last N hours) and for each branch fetches `.hal-tool-call-queue.json`. It merges all non-empty queues, executes, then clears each branch’s file via API (or marks as processed). So “Run tool calls” / Tool Agent would drain queues from all active agent branches, not just main.

**Pros:** No change to how the agent writes; no merge required; HAL just changes *where* it reads the queue from.  
**Cons:** More complex (multi-branch, dedup, clear semantics); need GitHub token; might execute the same logical tool call if same ticket appears on multiple branches (need idempotency or branch selection rules).

**No-merge:** Yes — execution is based on reading from agent branches via API.

---

## Summary Table

| Option | Cloud env vars? | Merge to main? | HAL deployed? | Cloud must `fetch()`? |
|--------|------------------|----------------|---------------|------------------------|
| 1. HAL URL in repo | No | No | Yes | Yes |
| 2. Queue on dedicated branch | No | No | No (local HAL ok) | No (agent just pushes file) |
| 3. GitHub Action → HAL | No | No | Yes (or self-hosted runner) | No |
| 4. Ingest endpoint + token | No | No | Yes | Yes |
| 5. Supabase Edge Function | No | No | No | Yes |
| 6. HAL polls GitHub for queues | No | No | No (local HAL ok) | No |

**Recommendation:** If the cloud agent **can** run `fetch()`: Option 1 or 4 (HAL deployed + URL in repo or ingest URL with token) is the simplest and gives immediate updates. If the cloud agent **cannot** run `fetch()`: Option 2 (dedicated branch) or Option 3 (GitHub Action) avoids merge-to-main and keeps credentials only on HAL/GitHub.

---

## Clarification That Would Help

- **Can Cursor Cloud Agents execute HTTP requests** (e.g. `fetch(HAL_API_URL + '/api/artifacts/insert-implementation', ...)`)? If yes, Options 1, 4, 5 are viable. If no, we’re limited to “agent writes something to the repo and something else (HAL or GitHub) pulls it” (Options 2, 3, 6).
