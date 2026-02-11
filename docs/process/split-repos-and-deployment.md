# Split Repos and Cost-Effective Deployment

## Current state

- **portfolio-2026-hal**: Monorepo that **vendors** (no submodules) two projects under `projects/`:
  - `projects/kanban` — copy of basic-kanban (Vite app, base `/kanban-app/`), built and copied to `dist/kanban-app` for production. HAL embeds it in an **iframe** and talks to it via **postMessage**.
  - `projects/hal-agents` — copy of hal-agents (Node/TS library: PM agent, runner, tools). HAL builds it and loads `projects/hal-agents/dist/agents/runner.js` at runtime (Vite dev and API serverless).
- **portfolio-2026-basic-kanban**: Standalone repo; minimal Vite config, no `base: '/kanban-app/'`.
- **portfolio-2026-hal-agents**: Standalone repo; has `projectManager.ts` and `tools.ts` only. **Missing** from standalone: `runner.ts`, `qaTools.ts` (and any other HAL-specific evolution).

HAL currently uses:
- **Kanban**: Dev proxy `/kanban-app` → localhost:5174; production = static files from `dist/kanban-app`. **Architecture**: separate SPA in an iframe (historical); not imported as a library.
- **hal-agents**: `file:projects/hal-agents` in package.json; Vite and API load runner from `projects/hal-agents/dist/agents/runner.js`. **Architecture**: library (no UI).

**Why treat both as libraries?** Kanban doesn’t need to be its own app. Like hal-agents, it can be a dependency HAL imports: the kanban repo publishes a React component library, HAL renders that component in the main app, and everything ships in one bundle and one deployment. No iframe, no second app, no second deploy.

---

## Goals

1. **Remove vendored copies** from HAL: delete `projects/kanban` and `projects/hal-agents` from the HAL repo.
2. **Sync changes back to standalone repos**: Push all changes made in the vendored copies into `portfolio-2026-basic-kanban` and `portfolio-2026-hal-agents`.
3. **Wire HAL to the external repos**: HAL depends on **both as libraries** — npm (or git) dependencies that HAL imports. No separate “Kanban app” deployment.
4. **One deployment**: HAL is the only app; Kanban and hal-agents are libraries. Single Vercel (or other) project.

---

## Phase 1: Sync standalone repos with vendored changes

### 1.1 portfolio-2026-hal-agents

- **Add missing files** from HAL’s `projects/hal-agents` into the standalone repo:
  - `src/agents/runner.ts`
  - `src/agents/qaTools.ts` (if present and used)
- **Merge any differences** in `projectManager.ts`, `tools.ts`, and shared utils between `projects/hal-agents` and the standalone repo (standalone may be behind).
- **Package build for HAL**: HAL expects a built `dist/agents/runner.js` (and `summarizeForContext` from the same module). Options:
  - **A)** Publish the package with `dist/` included (e.g. `npm run build` before publish, or `prepare` script). HAL then uses `node_modules/portfolio-2026-hal-agents/dist/agents/runner.js` or a package export.
  - **B)** HAL’s build runs `npm run build` inside `node_modules/portfolio-2026-hal-agents` (or after install). Then HAL loads from that dist path.
- **Exports**: Add an export for the runner so HAL can `import(...)` the built runner, e.g. `"./dist/agents/runner.js"` or a subpath export in `package.json`.
- Commit and push to the hal-agents repo; tag if you want HAL to pin a version.

### 1.2 portfolio-2026-basic-kanban (as a library)

- **Refactor Kanban into a React component library** (same idea as hal-agents: HAL imports it, no separate app).
  - Build the kanban repo as a **library** (e.g. Vite `build.lib` or a separate build that outputs a bundle with React components). Export a main component (e.g. `<KanbanBoard />`) and any types needed by HAL.
  - **Public API**: Props for everything HAL currently sends via postMessage — e.g. `supabaseUrl`, `supabaseAnonKey`, `repoFullName`, `theme`, `connectedRepo`, and callbacks for events HAL cares about (ticket selected, move to QA, agent assigned/unassigned, etc.). Optionally accept a **context** or **provider** for Supabase so the board doesn’t manage its own client.
  - **Sync vendored changes**: Merge any changes from `projects/kanban` into the standalone repo so the library version has feature parity.
- **Package.json**: Add `main` / `module` / `exports` pointing at the built library entry (and types). Name e.g. `portfolio-2026-kanban` or `@yourscope/kanban`.
- Commit and push; HAL will depend on this package (git or npm).

---

## Phase 2: Remove vendored copies from HAL and wire to external repos

### 2.1 HAL → hal-agents (library dependency)

- In **portfolio-2026-hal**:
  - Remove `projects/hal-agents` (delete directory and stop tracking).
  - In `package.json`, replace `"portfolio-2026-hal-agents": "file:projects/hal-agents"` with a reference to the standalone repo, e.g. `"portfolio-2026-hal-agents": "github:YourOrg/portfolio-2026-hal-agents#main"` (or a tag), or publish to npm and use a version.
  - Ensure HAL’s build runs the agents build when needed (e.g. `npm run build` in the dependency, or depend on pre-built dist).
  - **Resolve runner path at runtime**: Replace hardcoded `projects/hal-agents/dist/agents/runner.js` with the installed package path, e.g. `path.resolve(repoRoot, 'node_modules/portfolio-2026-hal-agents/dist/agents/runner.js')`, or use a package subpath export.
  - Update **vite.config.ts** (dev) and **api/pm/respond.ts** (and any other API that loads the runner) to use this path. Remove the `@hal-agents` alias that pointed at `projects/hal-agents/src`.

### 2.2 HAL → Kanban (library dependency, no iframe)

- In **portfolio-2026-hal**:
  - Remove `projects/kanban` (delete directory and stop tracking).
  - In `package.json`, add a dependency on the kanban **library** package, e.g. `"portfolio-2026-kanban": "github:YourOrg/portfolio-2026-basic-kanban#main"` (or npm).
  - **Replace the iframe with the in-app component**: Where HAL currently renders `<iframe src={KANBAN_URL} ... />` and talks to it via `postMessage`, instead:
    - `import { KanbanBoard } from 'portfolio-2026-kanban'`
    - Render `<KanbanBoard supabaseUrl={...} supabaseAnonKey={...} repoFullName={...} theme={...} onTicketSelect={...} ... />` in the same pane, passing the same data and handling events via props/callbacks.
  - Remove: kanban iframe URL constant, proxy for `/kanban-app`, build step that builds/copies kanban into `dist/kanban-app`, and all postMessage send/listen logic that was HAL↔Kanban. Keep only the props/callbacks interface to the Kanban library.
- **Single bundle**: Vite will bundle the Kanban library into the HAL app; one deploy, one app.

---

## Phase 3: Deployment (one app, two libraries)

| Repo                     | Role      | Deploy? |
|--------------------------|-----------|--------|
| portfolio-2026-hal        | The app   | Yes — single Vercel (or other) project. |
| portfolio-2026-basic-kanban | Library   | No — HAL imports it; no separate deployment. |
| portfolio-2026-hal-agents   | Library   | No — HAL imports it; no separate deployment. |

**Result:** One deployment. Both Kanban and hal-agents are libraries that HAL imports; only HAL is a deployed “app.” Cheapest and simplest from a deployment and cost perspective.

**To reduce cost further:** Limit Vercel preview deployments if needed; or use Cloudflare Pages / Netlify if their free tier fits.

---

## Checklist (summary)

- [ ] **hal-agents repo**: Add `runner.ts`, `qaTools.ts`; align `projectManager.ts`/`tools.ts` with HAL’s copy; add dist export/build; push.
- [ ] **kanban repo**: Refactor to a React component library; export `<KanbanBoard />` (or equivalent) with props/callbacks for HAL; sync vendored changes; add package exports; push.
- [ ] **HAL repo**: Remove `projects/kanban` and `projects/hal-agents`; add both as npm/git dependencies; load runner from `node_modules/portfolio-2026-hal-agents`; replace iframe with `<KanbanBoard ... />` and props/callbacks; remove kanban proxy and build-copy step; test dev and build.
- [ ] **Deployment**: Single HAL project; no Kanban or hal-agents projects.
