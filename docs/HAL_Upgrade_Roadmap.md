# HAL Implementation Roadmap -- Ordered Ticket Plan

Generated: 2026-02-19T03:14:40.635906 UTC

------------------------------------------------------------------------

# PHASE 1 --- FOUNDATIONS (Unblock Everything Else)

## T1 --- Create Bootstrap State Machine (bootstrap_run)

**Goal:** Persist staged bootstrap workflow with resumable steps. -
Create `bootstrap_run` table (id, project_id, status, step, logs,
created_at, updated_at). - Steps must be idempotent and retryable. -
Each step logs raw provider errors + friendly summary. - Definition of
Done: - Failed step can be retried without corrupting state. - State
survives server restart.

------------------------------------------------------------------------

## T2 --- Implement ensure_repo_initialized(project_id)

**Goal:** Guarantee repository has a real `main` branch and first
commit. - Use GitHub Git Database API (blob → tree → commit → ref). -
Create private repo by default. - Create branch `main` explicitly. -
Store `initial_commit_sha` and `default_branch = main`. - Definition of
Done: - Empty repo becomes usable repo with single scaffold commit. -
Re-running does not duplicate commits.

------------------------------------------------------------------------

## T3 --- Create Golden Path Scaffold Template

**Goal:** Opinionated Vite + React starter. - Include version.json
generator. - Include idle-aware reload hook. - Include Supabase env
plumbing. - Must deploy successfully on first commit. - Definition of
Done: - New repo deploys without manual changes.

------------------------------------------------------------------------

# PHASE 2 --- INFRASTRUCTURE AUTOMATION

## T4 --- Automate Supabase Project Creation

-   Create project via API.
-   Store project ref + URL.
-   Encrypt and store service keys.
-   Definition of Done:
    -   Supabase project auto-created and credentials stored securely.

------------------------------------------------------------------------

## T5 --- Automate Vercel Project Creation

-   Create project via API.
-   Link GitHub repo.
-   Inject environment variables.
-   Trigger first deploy.
-   Definition of Done:
    -   Preview URL available automatically.

------------------------------------------------------------------------

## T6 --- Preview Verification Step

-   Poll `/version.json` until available.
-   Mark bootstrap complete when verified.
-   Definition of Done:
    -   Bootstrap only completes after successful preview response.

------------------------------------------------------------------------

# PHASE 3 --- CONTEXT MANAGEMENT (Context v0)

## T7 --- Implement build_context_bundle(project_id, ticket_id, role)

-   Deterministic JSON output.
-   Include: manifest, ticket, state snapshot, deltas, repo pointers,
    relevant artifacts.
-   Enforce role-based character budgets.
-   Definition of Done:
    -   Agent runs reproducible from bundle alone.

------------------------------------------------------------------------

## T8 --- Artifact Distiller

-   Generate summary + hard_facts + keywords.
-   Cache per artifact version.
-   Definition of Done:
    -   Bundles never include raw large documents.

------------------------------------------------------------------------

## T9 --- Relevance Scoring + Hybrid Selection

-   Keyword/tag/path overlap + recency + pinned boost.
-   Deterministic selection.
-   Definition of Done:
    -   Same inputs → same artifact selection.

------------------------------------------------------------------------

## T10 --- Context Receipt Storage

-   Store checksum.
-   Store artifact versions used.
-   Store snippet references.
-   Definition of Done:
    -   Any agent run can be reconstructed.

------------------------------------------------------------------------

## T11 --- Drift Detection Enforcement

-   Block transitions if:
    -   Acceptance criteria unmet.
    -   Failing tests.
    -   Doc mismatch.
-   Definition of Done:
    -   System refuses inconsistent state transitions.

------------------------------------------------------------------------

# PHASE 4 --- REQUIREMENT HARDENING

## T12 --- Implement Requirement Expansion Document (RED)

-   Structured JSON artifact.
-   Functional, edge cases, NFR, out_of_scope, assumptions, risk_score.
-   Definition of Done:
    -   Every ticket has RED before Dev.

------------------------------------------------------------------------

## T13 --- RED Validator Gate

-   Enforce minimum functional count.
-   Enforce minimum edge cases.
-   Require error handling + test expectations.
-   Reject vague language.
-   Definition of Done:
    -   Ticket cannot move to Dev without passing validation.

------------------------------------------------------------------------

## T14 --- Update Dev/QA Agents to Consume RED

-   Remove dependency on raw ticket description.
-   Definition of Done:
    -   Agents reference RED explicitly in runs.

------------------------------------------------------------------------

# PHASE 5 --- EMBEDDINGS & LEARNING

## T15 --- Create artifact_chunks Table (pgvector)

-   Include metadata + vector column.
-   Add index (HNSW preferred for recall).
-   Definition of Done:
    -   Vector search operational.

------------------------------------------------------------------------

## T16 --- Async Embedding Pipeline

-   Embed only distilled knowledge atoms.
-   Chunk hashing to avoid re-embedding.
-   Definition of Done:
    -   New/updated artifacts embedded automatically.

------------------------------------------------------------------------

## T17 --- Hybrid Retrieval in Context + RED Generation ✅

-   Combine vector similarity + metadata filtering. ✅
-   Definition of Done:
    -   RED expansion uses historical scar tissue. ⏳ (Backend ready, UI integration pending)
    -   Context Bundle generation uses hybrid retrieval. ✅
    -   UI shows "Retrieval sources" summary for Context Bundles. ✅

------------------------------------------------------------------------

# PHASE 6 --- PROCESS COMPOUNDING

## T18 --- Structured Failure Library

-   failure_type
-   root_cause
-   prevention_candidate
-   recurrence tracking
-   Definition of Done:
    -   Failures logged in normalized format.

------------------------------------------------------------------------

## T19 --- Policy Adjustment System

-   Trial-mode rule changes.
-   Promote/revert mechanism.
-   Track recurrence metrics.
-   Definition of Done:
    -   Process changes measurable and reversible.

------------------------------------------------------------------------

# PHASE 7 --- SECURITY & GOVERNANCE

## T20 --- Encrypt Provider Tokens at Rest

-   OAuth tokens encrypted.
-   Supabase keys encrypted.
-   Definition of Done:
    -   No plaintext secrets stored.

------------------------------------------------------------------------

## T21 --- Provider Disconnect + Audit Logs

-   Allow revocation.
-   Log bootstrap and infra actions.
-   Definition of Done:
    -   Full audit trail available per project.

------------------------------------------------------------------------

# FINAL VALIDATION

## T22 --- Cold Start Continuity Test

-   Restart system.
-   Rebuild context bundle.
-   Resume project.
-   Definition of Done:
    -   No reliance on transient memory.

------------------------------------------------------------------------

END OF ROADMAP
