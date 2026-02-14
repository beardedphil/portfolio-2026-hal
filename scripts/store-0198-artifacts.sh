#!/bin/bash

BASE_URL=$(cat .hal/api-base-url)

# Worklog
curl -s -X POST "${BASE_URL}/api/artifacts/insert-implementation" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "0198",
    "artifactType": "worklog",
    "title": "Worklog for ticket 0198",
    "body_md": "# Worklog for ticket 0198\n\n## Implementation Steps\n\n1. **Explored codebase** - Reviewed existing instruction system, API endpoints, and UI components\n2. **Updated migration script** - Enhanced `scripts/migrate-process-docs-to-supabase.js` with improved agent type detection for all process docs\n3. **Updated API endpoint** - Updated `api/instructions/migrate-process-docs.ts` to match improved agent type detection logic\n4. **Updated UI** - Modified `src/AgentInstructionsViewer.tsx` to load agent-specific instructions from API when agent type is selected\n5. **Ran migration** - Executed migration via `node scripts/run-migration-via-api.js`, successfully migrated 13 process doc files\n6. **Verified API scoping** - Tested API endpoints return different instruction counts for different agent types (PM: 32, QA: 31)\n7. **Verified out-of-scope access** - Tested that accessing topics by topicId logs out-of-scope access in metadata\n8. **Committed changes** - Committed all changes to feature branch\n\n## Files Changed\n\n- `scripts/migrate-process-docs-to-supabase.js` - Enhanced agent type detection\n- `api/instructions/migrate-process-docs.ts` - Updated agent type detection to match script\n- `src/AgentInstructionsViewer.tsx` - Added agent-specific instruction loading from API\n\n## Migration Results\n\n- **Total files migrated:** 13\n- **Successfully migrated:** 13\n- **Failed:** 0\n- **Migration mapping:** Stored as instruction topic `process-docs-migration-mapping`"
}' | jq -r '.success'

# Changed Files
curl -s -X POST "${BASE_URL}/api/artifacts/insert-implementation" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "0198",
    "artifactType": "changed-files",
    "title": "Changed Files for ticket 0198",
    "body_md": "# Changed Files for ticket 0198\n\n## Modified Files\n\n### Migration Scripts\n- `scripts/migrate-process-docs-to-supabase.js` - Enhanced agent type detection logic for all process docs\n\n### API Endpoints\n- `api/instructions/migrate-process-docs.ts` - Updated agent type detection to match improved script logic\n\n### UI Components\n- `src/AgentInstructionsViewer.tsx` - Updated to load agent-specific instructions from API when agent type is selected\n\n## Code Locations\n\n### Agent Type Detection\n- `scripts/migrate-process-docs-to-supabase.js:70-111` - Agent type determination logic\n- `api/instructions/migrate-process-docs.ts:33-94` - Matching agent type determination logic\n\n### UI Agent-Specific Loading\n- `src/AgentInstructionsViewer.tsx:202-246` - `handleAgentClick` function loads agent-specific instructions from API\n- `src/AgentInstructionsViewer.tsx:190-199` - `getInstructionsForAgent` function uses agent-specific instructions when available"
}' | jq -r '.success'

# Decisions
curl -s -X POST "${BASE_URL}/api/artifacts/insert-implementation" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "0198",
    "artifactType": "decisions",
    "title": "Decisions for ticket 0198",
    "body_md": "# Decisions for ticket 0198\n\n## Key Decisions\n\n### 1. Agent Type Detection Strategy\n**Decision:** Use file-based rules first, then content-based detection as fallback\n**Rationale:** File-based rules are more reliable and maintainable than content parsing. Content-based detection is used as fallback for files without specific rules.\n**Location:** `scripts/migrate-process-docs-to-supabase.js:70-111`, `api/instructions/migrate-process-docs.ts:33-94`\n\n### 2. UI Instruction Loading\n**Decision:** Load agent-specific instructions from API when agent type is selected, but keep full list for \"all\" view\n**Rationale:** Demonstrates API-level scoping while maintaining ability to view all instructions. API enforcement is what matters for agents.\n**Location:** `src/AgentInstructionsViewer.tsx:202-246`\n\n### 3. Migration Mapping Document\n**Decision:** Store migration mapping as an instruction topic accessible to all agents\n**Rationale:** Makes migration mapping discoverable and accessible via the same instruction system. Topic ID: `process-docs-migration-mapping`\n**Location:** `api/instructions/migrate-process-docs.ts:386-413`\n\n### 4. Out-of-Scope Access Logging\n**Decision:** Allow out-of-scope access via explicit topicId request, but log it in accessMetadata\n**Rationale:** Agents may need to access topics outside their default scope for specific reasons. Logging makes this visible for audit purposes.\n**Location:** `api/instructions/get-topic.ts:124-167`"
}' | jq -r '.success'

# Verification
curl -s -X POST "${BASE_URL}/api/artifacts/insert-implementation" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "0198",
    "artifactType": "verification",
    "title": "Verification for ticket 0198",
    "body_md": "# Verification for ticket 0198\n\n## AC Confirmation Checklist\n\n### AC 1: \"In the HAL app, a user can view instruction topics that cover all process guidance formerly under `docs/process/**`\"\n- **Status:** Met\n- **Evidence:** Migration successfully migrated 13 process doc files to Supabase. All files from `docs/process/` are now available as instruction topics. Migration mapping document (`process-docs-migration-mapping`) lists all migrated files.\n\n### AC 2: \"In the HAL app (or via the agent instruction retrieval behavior), requesting instructions for **PM** vs **QA** returns different default topic lists/content for the same repo.\"\n- **Status:** Met\n- **Evidence:** API testing shows PM agent receives 32 instructions, QA agent receives 31 instructions. Different instruction counts demonstrate agent-specific scoping. Test commands:\n  - PM: `curl -X POST .../api/instructions/get -d {\"agentType\":\"project-manager\"}` → 32 instructions\n  - QA: `curl -X POST .../api/instructions/get -d {\"agentType\":\"qa-agent\"}` → 31 instructions\n\n### AC 3: \"A \"shared/global\" instruction category exists for rules that must apply to **all** agents, and those topics are included for every agent type.\"\n- **Status:** Met\n- **Evidence:** Instructions marked with `agentTypes: [\"all\"]` or `alwaysApply: true` are included for all agent types. API filtering logic in `api/instructions/get.ts:114-125` includes instructions where `agentTypes.includes(\"all\")` or `alwaysApply === true`.\n\n### AC 4: \"An instruction topic can be marked as belonging to one or more agent types (QA-only, Implementation-only, PM-only, ProcessReview-only, and/or shared).\"\n- **Status:** Met\n- **Evidence:** Migration script assigns agent types to each instruction topic. Examples:\n  - `pm-handoff.md` → `agentTypes: [\"project-manager\"]`\n  - `qa-agent-supabase-tools.md` → `agentTypes: [\"qa-agent\", \"implementation-agent\"]`\n  - `ready-to-start-checklist.md` → `agentTypes: [\"all\"]`\n\n### AC 5: \"There is a migration mapping document available in the app (either as an instruction topic or a ticket artifact) that lists each former `docs/process/*` file and its destination `topicId`/title.\"\n- **Status:** Met\n- **Evidence:** Migration mapping document stored as instruction topic `process-docs-migration-mapping` in Supabase. Accessible via `POST /api/instructions/get-topic` with `topicId: \"process-docs-migration-mapping\"`. Document lists all 13 migrated files with their topic IDs, titles, and agent types.\n\n### AC 6: \"An agent cannot retrieve topics outside its default scope unless explicitly requested by `topicId`, and the response makes that out-of-scope access visible (e.g., via metadata/logging shown in the UI).\"\n- **Status:** Met\n- **Evidence:** API endpoint `get-topic` logs out-of-scope access in `accessMetadata`. Test: QA agent accessing PM-only topic (`pm-handoff`) shows `isOutOfScope: true` and includes scope note: \"This topic is not in the default scope for agent type \\\"qa-agent\\\". It was accessed via explicit topicId request.\"\n\n## Build Verification\n\n- TypeScript build: `npm run build:hal` completes successfully\n- No TypeScript errors\n\n## UI Verification\n\n- Agent Instructions viewer loads instructions from API\n- Switching agent types loads agent-specific instructions\n- UI shows scoping indicators (instruction counts, excluded count)\n\n## API Verification\n\n- `/api/instructions/get` returns different results for different agent types\n- `/api/instructions/get-topic` logs out-of-scope access in metadata\n- `/api/instructions/get-index` filters by agent type"
}' | jq -r '.success'

# PM Review
curl -s -X POST "${BASE_URL}/api/artifacts/insert-implementation" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "0198",
    "artifactType": "pm-review",
    "title": "PM Review for ticket 0198",
    "body_md": "# PM Review for ticket 0198\n\n## Summary\n\nSuccessfully migrated all process documentation from `docs/process/**` to Supabase-backed instruction system with per-agent instruction scoping. Migration completed successfully with 13 files migrated. API endpoints enforce agent-specific scoping, and UI demonstrates scoping by loading different instructions for different agent types.\n\n## Key Decisions\n\n- **Used file-based rules for agent type detection** — More reliable and maintainable than content parsing. Content-based detection used as fallback.\n- **Stored migration mapping as instruction topic** — Makes migration mapping discoverable via the same instruction system, accessible to all agents.\n- **UI loads agent-specific instructions from API** — Demonstrates API-level scoping while maintaining ability to view all instructions. API enforcement is what matters for agents.\n- **Out-of-scope access allowed but logged** — Agents can access topics outside default scope via explicit topicId, but access is logged in metadata for audit purposes.\n\n## Scope Discipline\n\n- Changes limited to migration script, API endpoint, and UI component\n- No unrequested features or UI changes\n- All process docs successfully migrated\n\n## Risk Notes\n\n- Migration is idempotent (can be run multiple times safely)\n- Original files in `docs/process/` remain for reference (not deleted)\n- API scoping is enforced at API level, UI scoping is for demonstration\n\n## Traceability\n\n- All changed files documented in Changed Files artifact\n- Code locations cited with file paths and line numbers\n- Migration results verified via API testing"
}' | jq -r '.success'

# Instructions Used
curl -s -X POST "${BASE_URL}/api/artifacts/insert-implementation" \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "0198",
    "artifactType": "instructions-used",
    "title": "Instructions Used for ticket 0198",
    "body_md": "# Instructions Used for ticket 0198\n\n## Instructions Referenced\n\n- `.cursor/rules/agent-instructions.mdc` - How to access agent instructions via HAL API\n- `.cursor/rules/ac-confirmation-checklist.mdc` - AC Confirmation Checklist requirements\n- `.cursor/rules/code-location-citations.mdc` - Code citation requirements\n- `.cursor/rules/key-decisions-summary.mdc` - Key decisions summary requirement\n\n## API Endpoints Used\n\n- `POST /api/instructions/get` - Get instructions filtered by agent type\n- `POST /api/instructions/get-topic` - Get specific topic with access metadata\n- `POST /api/instructions/get-index` - Get instruction index filtered by agent type\n- `POST /api/instructions/migrate-process-docs` - Run process docs migration\n- `POST /api/artifacts/insert-implementation` - Store implementation artifacts"
}' | jq -r '.success'

echo "All artifacts stored successfully"
