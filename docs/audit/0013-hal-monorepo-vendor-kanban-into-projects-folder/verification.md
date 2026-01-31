# Verification (UI-only): 0013 - Embrace monorepo: vendor kanban into projects/kanban

## Prerequisites

- HAL repo with the 0013 changes applied (kanban vendored, predev removed, docs updated).
- Node and npm available.

## Steps

### 1. projects/kanban is a normal folder

1. Open the HAL repo in the file explorer (or IDE).
2. Confirm **projects/kanban/** exists and contains normal files (e.g. `package.json`, `src/App.tsx`, `docs/`, etc.).
3. Confirm there is **no** `.git` file (or `.git` directory) inside `projects/kanban` that would make it a submodule. (If there is a `.git` file, the conversion was incomplete.)

### 2. No submodule reference

4. In a terminal, from the HAL repo root, run: `git submodule status`.
5. **Pass:** Output is empty (no submodules listed).  
   **Fail:** `projects/kanban` is listed.

### 3. One-command dev still works

6. From the HAL repo root, run: `npm run dev` (no need to run `git submodule update` first).
7. Wait for both HAL and kanban to start (ports 5173 and 5174).
8. Open the HAL app in the browser (e.g. http://localhost:5173).
9. **Pass:** The kanban board loads in the left pane (no "localhost refused to connect").  
   **Fail:** Kanban area is blank or shows a connection error.

### 4. No stray generated config

10. After running `npm run dev` once, stop the servers. Run `git status -sb` from the HAL repo root.
11. **Pass:** No unexpected new or modified files from the dev boot (only expected untracked such as `node_modules`, `dist`, or local configs already in `.gitignore`).  
   **Fail:** New tracked or untracked config files appear that should not be committed.

### 5. Documentation

12. Open **docs/process/single-source-agents.md** and read the "Kanban" section.
13. **Pass:** It states that `projects/kanban` is part of the HAL monorepo (normal directory, not a submodule).  
14. Open **.cursor/rules/submodule-sync.mdc** (if present).
15. **Pass:** It describes the monorepo and states that kanban is vendored; no submodule sync required.

## Pass criteria

- `projects/kanban/` is a normal folder (no submodule).
- `git submodule status` lists nothing.
- `npm run dev` starts HAL + kanban and the kanban iframe loads.
- No submodule init step is required.
- Docs state kanban is part of the monorepo.
