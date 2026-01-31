# Decisions (0008-hal-dev-predev-sync-submodules)

## predev lifecycle hook

- **Decision:** Use npm's built-in `predev` script so submodule sync/init runs automatically before `dev`.
- **Why:** Ticket requires "runs automatically as part of npm run dev"; no extra tooling or wrapper script. Works on Windows (npm runs scripts in shell; `&&` is supported).

## sync then update --init --recursive

- **Decision:** Run `git submodule sync --recursive` then `git submodule update --init --recursive`, chained with `&&`.
- **Why:** Sync ensures .gitmodules config is applied; update --init initializes missing submodules and checks out pinned commits. Recursive covers nested submodules if any. If either fails, script exits non-zero and dev does not start.

## No --remote or fetch of newer refs

- **Decision:** Do not use `git submodule update --remote` or any step that would pull newer commits and change superrepo state.
- **Why:** Ticket constraint: "does not silently modify tracked state beyond checking out the submodule commits pinned by the superrepo." Only init and checkout at existing recorded commits.
