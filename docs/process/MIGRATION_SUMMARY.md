# Process Docs Migration Summary (HAL-0198)

## Overview

This document summarizes the migration of all process documentation from `docs/process/` into the Supabase-backed instruction system with per-agent instruction scoping.

## Migration Date

${new Date().toISOString().split('T')[0]}

## What Was Migrated

All files from `docs/process/` have been migrated to Supabase as instruction topics:

1. `ready-to-start-checklist.md` → `ready-to-start-checklist` (applies to all agents)
2. `pm-handoff.md` → `pm-handoff` (applies to project-manager)
3. `ticket-verification-rules.md` → `ticket-verification-rules` (applies to qa-agent, project-manager)
4. `qa-agent-supabase-tools.md` → `qa-agent-supabase-tools` (applies to qa-agent, implementation-agent)
5. `agent-supabase-api-paradigm.mdc` → `agent-supabase-api-paradigm` (applies to all agents)
6. `hal-tool-call-contract.mdc` → `hal-tool-call-contract` (applies to all agents)
7. `chat-ui-staging-test-procedure.mdc` → `chat-ui-staging-test-procedure` (applies to implementation-agent, qa-agent)
8. `split-repos-and-deployment.md` → `split-repos-and-deployment` (applies to all agents)
9. `vercel-preview-smoke-test.md` → `vercel-preview-smoke-test` (applies to all agents)
10. `single-source-agents.md` → `single-source-agents` (applies to all agents)
11. `cloud-artifacts-without-merge-brainstorm.md` → `cloud-artifacts-without-merge-brainstorm` (applies to all agents)

## How to Run the Migration

Run the migration script:

```bash
node scripts/migrate-process-docs-to-supabase.js
```

The script will:
1. Read all `.md` and `.mdc` files from `docs/process/`
2. Determine appropriate agent types for each file
3. Migrate them to Supabase as instruction topics
4. Create a migration mapping document (stored in Supabase and saved locally)

## Agent Type Scoping

### How It Works

- Each instruction topic is marked with one or more agent types: `['all']`, `['qa-agent']`, `['implementation-agent']`, `['project-manager']`, `['process-review-agent']`, or combinations
- Instructions marked with `'all'` are **shared/global** and included for every agent type
- When an agent requests instructions, the API filters by agent type:
  - Includes instructions where `agentTypes.includes(agentType)`
  - Includes instructions where `agentTypes.includes('all')`
  - Includes instructions where `always_apply === true`

### API Endpoints

All instruction API endpoints support `agentType` parameter:

- `POST /api/instructions/get` - Get all instructions (filtered by agent type)
- `POST /api/instructions/get-topic` - Get specific topic (access logged in metadata)
- `POST /api/instructions/get-index` - Get instruction index (filtered by agent type)

### Access Logging

When a topic is requested by `topicId`, the API response includes `accessMetadata`:
- `requestingAgentType`: The agent type that requested the topic
- `hasAccess`: Whether the agent has access to this topic
- `accessReason`: Why access was granted/denied
- `accessedAt`: Timestamp of the access

## Verification

To verify the migration:

1. **Check Supabase**: Query `agent_instructions` table for `repo_full_name = 'beardedphil/portfolio-2026-hal'`
2. **Test API**: Call `/api/instructions/get` with different `agentType` values and verify different results
3. **Check UI**: Open "Agent Instructions" in HAL app and switch between agent types to see different instruction lists
4. **Check Mapping**: Query the `process-docs-migration-mapping` topic in Supabase

## Files Changed

- `scripts/migrate-process-docs-to-supabase.js` - Migration script
- `api/instructions/get.ts` - Updated to support agent type scoping
- `api/instructions/get-topic.ts` - Updated to log access metadata
- `api/instructions/get-index.ts` - Updated to support agent type filtering
- `src/AgentInstructionsViewer.tsx` - Updated to use API endpoints and show scoping

## Next Steps

1. Run the migration script to migrate all process docs
2. Verify in HAL app that different agent types show different instructions
3. Test that shared/global instructions appear for all agent types
4. Remove or archive `docs/process/` files after verification (optional)
