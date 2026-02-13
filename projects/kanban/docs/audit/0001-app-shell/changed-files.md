# Changed files (0001-app-shell)

## Created

| Path | Purpose |
|------|---------|
| `package.json` | NPM project: React 18, Vite 6, TypeScript, scripts dev/build/preview |
| `vite.config.ts` | Vite config with React plugin |
| `tsconfig.json` | TS project references (app + node) |
| `tsconfig.app.json` | Compiler options for `src/` |
| `tsconfig.node.json` | Compiler options for `vite.config.ts` |
| `index.html` | Entry HTML, root div, script to `/src/main.tsx` |
| `src/main.tsx` | React root render (StrictMode, App) |
| `src/App.tsx` | App shell: title, subtitle, Debug toggle, Debug panel (build info, action log, errors) |
| `src/index.css` | Global minimal styles |
| `src/vite-env.d.ts` | Vite client types reference |
| `docs/audit/0001-app-shell/prompt.md` | This task prompt |
| `docs/audit/0001-app-shell/plan.md` | Implementation plan |
| `docs/audit/0001-app-shell/worklog.md` | Work log |
| `docs/audit/0001-app-shell/changed-files.md` | This file |
| `docs/audit/0001-app-shell/decisions.md` | Design/tech decisions |
| `docs/audit/0001-app-shell/verification.md` | Human UI verification steps |

## Unchanged
- `.cursor/` and `docs/templates/` left as-is.
