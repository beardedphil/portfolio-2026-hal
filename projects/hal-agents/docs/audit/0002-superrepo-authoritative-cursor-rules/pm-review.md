# PM Review

## Summary

- Removed duplicated `.cursor/rules` from this repo and replaced them with a stub pointing to the HAL superrepo.

## Likelihood of success

**Score (0–100%)**: 90%

**Why:**
- Eliminates drift by removing the second copy of rules.

## Potential failures

1. **Repo opened standalone** — stub rules apply and the agent may not load the authoritative rules. Mitigation: open `portfolio-2026-hal/` as the workspace root.

