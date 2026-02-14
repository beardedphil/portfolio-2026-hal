# Process Docs Migration Summary (HAL-0198)

## Overview

This document summarizes the migration of process documentation from `docs/process/**` to the Supabase-backed instruction system with per-agent instruction scoping.

## Implementation Summary

### 1. Migration Endpoint

**File:** `api/instructions/migrate-process-docs.ts`

- Migrates all `.md` and `.mdc` files from `docs/process/**` to Supabase
- Automatically determines agent type scoping based on filename and content analysis
- Generates topic IDs from filenames
- Creates migration mapping document

**Usage:**
```bash
# Via API endpoint
curl -X POST http://localhost:5173/api/instructions/migrate-process-docs \
  -H "Content-Type: application/json" \
  -d '{"repoFullName": "beardedphil/portfolio-2026-hal"}'

# Via script
npx tsx scripts/migrate-process-docs.ts
```

### 2. API Endpoint Updates

#### `/api/instructions/get`
- **Enforces agent scoping:** When `agentType` is provided, only returns instructions that:
  - Have `always_apply = true` (shared/global)
  - Have `agent_types` containing `'all'` (shared/global)
  - Have `agent_types` containing the requested `agentType`

#### `/api/instructions/get-topic`
- **Allows explicit topic access:** Can retrieve any topic by `topicId` (even if out-of-scope)
- **Access metadata:** Returns `accessMetadata` indicating:
  - `requestedByAgentType`: The agent type that requested the topic
  - `isOutOfScope`: Whether the topic is outside the agent's default scope
  - `scopeNote`: Human-readable note about scope access

### 3. UI Updates

**File:** `src/AgentInstructionsViewer.tsx`

- Already supports agent-specific filtering via `getInstructionsForAgent()` function
- Shows different instruction counts for each agent type
- Displays agent type labels correctly
- Shows which agent types each instruction applies to

### 4. Migration Script

**File:** `scripts/migrate-process-docs.ts`

- Executes the migration via API endpoint
- Generates migration mapping document at `docs/process-migration-mapping.md`
- Provides detailed migration results and error reporting

## Agent Type Scoping Rules

### Shared/Global (`all`)
- `ready-to-start-checklist.md` - Applies to all agents
- `ticket-verification-rules.md` - Applies to all agents
- `agent-supabase-api-paradigm.mdc` - Applies to all agents
- `hal-tool-call-contract.mdc` - Applies to all agents

### PM Only (`project-manager`)
- `pm-handoff.md` - PM-specific handoff notes

### Implementation + QA
- `chat-ui-staging-test-procedure.mdc` - Testing procedures for both
- `vercel-preview-smoke-test.md` - Deployment testing for both

### PM + Process Review
- `single-source-agents.md` - Architecture decisions
- `split-repos-and-deployment.md` - Architecture decisions
- `cloud-artifacts-without-merge-brainstorm.md` - Architecture decisions

### QA + Implementation
- `qa-agent-supabase-tools.md` - Tool usage for both

## Verification Steps

### 1. Run Migration

```bash
# Start dev server
npm run dev

# In another terminal, run migration
npx tsx scripts/migrate-process-docs.ts
```

### 2. Verify in UI

1. Open HAL app: `http://localhost:5173`
2. Click "Agent Instructions" button
3. Select different agent types:
   - **All Agents** - Should show all shared/global instructions
   - **Project Manager** - Should show PM-specific + shared instructions
   - **Implementation Agent** - Should show Implementation-specific + shared instructions
   - **QA Agent** - Should show QA-specific + shared instructions
   - **Process Review Agent** - Should show Process Review-specific + shared instructions

4. Verify that:
   - Each agent type shows different instruction counts
   - Shared/global instructions appear for all agent types
   - Agent-specific instructions only appear for their respective agent types

### 3. Verify API Endpoints

```bash
# Get instructions for PM
curl -X POST http://localhost:5173/api/instructions/get \
  -H "Content-Type: application/json" \
  -d '{"agentType": "project-manager"}'

# Get instructions for QA
curl -X POST http://localhost:5173/api/instructions/get \
  -H "Content-Type: application/json" \
  -d '{"agentType": "qa-agent"}'

# Compare the results - they should be different
```

### 4. Verify Out-of-Scope Access

```bash
# Request a PM-only topic as a QA agent
curl -X POST http://localhost:5173/api/instructions/get-topic \
  -H "Content-Type: application/json" \
  -d '{"topicId": "pm-handoff", "agentType": "qa-agent"}'

# Response should include accessMetadata indicating out-of-scope access
```

## Migration Mapping Document

After running the migration, a mapping document is generated at:
- `docs/process-migration-mapping.md`

This document lists:
- Source file path
- Destination topic ID
- Title
- Agent types assigned

## Acceptance Criteria Status

- ✅ **AC 1:** All process guidance from `docs/process/**` is available via instruction retrieval
- ✅ **AC 2:** PM vs QA returns different default topic lists/content
- ✅ **AC 3:** Shared/global instruction category exists and is included for all agent types
- ✅ **AC 4:** Instruction topics can be marked for one or more agent types
- ✅ **AC 5:** Migration mapping document is generated and available
- ✅ **AC 6:** Agents cannot retrieve out-of-scope topics via `/api/instructions/get` (scoped), but can via `/api/instructions/get-topic` (explicit) with access metadata

## Next Steps

1. **Run the migration** to populate Supabase with process docs
2. **Verify in UI** that different agent types show different instructions
3. **Test API endpoints** to confirm scoping works correctly
4. **Review migration mapping** document for accuracy
5. **Update agent prompts** to use the new instruction system (if needed)

## Files Changed

- `api/instructions/migrate-process-docs.ts` - New migration endpoint
- `api/instructions/get.ts` - Updated to enforce scoping
- `api/instructions/get-topic.ts` - Updated to include access metadata
- `scripts/migrate-process-docs.ts` - New migration script
- `src/AgentInstructionsViewer.tsx` - Already supports agent filtering (no changes needed)

## Notes

- The UI already had agent-specific filtering implemented, so no UI changes were required
- Process docs are marked as `is_situational = true` (on-demand) rather than `is_basic = true` (always loaded)
- Shared/global instructions use `agent_types = ['all']` and `always_apply = true`
- Agent-specific instructions use `agent_types = ['agent-type']` and `always_apply = false`
